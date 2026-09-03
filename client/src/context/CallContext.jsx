// In-app voice calling: WebSocket signaling client + WebRTC peer connection
// management. This context owns the one signaling socket for the whole app
// (mirrors how AuthContext owns the one session) and exposes a small state
// machine the UI (CallOverlays.jsx, ConversationThread.jsx) renders from.
//
// Call states: 'idle' -> 'calling' (we invited, waiting) -> 'connecting'
// (accepted, doing the SDP/ICE handshake) -> 'active' (audio flowing), or
// 'idle' -> 'ringing' (we were invited) -> 'connecting' -> 'active'.
//
// STUN-only: no TURN relay is configured (that needs a paid TURN provider
// account, which isn't something this can provision), so two peers both
// behind restrictive/symmetric NATs may fail to connect peer-to-peer. That's
// a disclosed, known limitation of this approach, not a bug.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';

const CallContext = createContext(null);

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

// A call that's accepted-but-not-yet-connected shouldn't ring forever if the
// ICE handshake itself never completes (e.g. both peers behind symmetric
// NATs, no TURN to fall back on) -- fail it out cleanly instead of hanging.
const CONNECT_TIMEOUT_MS = 20_000;

function wsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/calls`;
}

export function CallProvider({ children }) {
  const { user } = useAuth();
  const [callState, setCallState] = useState('idle'); // idle | calling | ringing | connecting | active
  const [incomingCall, setIncomingCall] = useState(null); // { callId, conversationId, callerName }
  const [activeCall, setActiveCall] = useState(null); // { callId, conversationId, otherName }
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState(null);
  const [callStartedAt, setCallStartedAt] = useState(null);

  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const pendingCandidatesRef = useRef([]); // ICE candidates that arrive before the remote description is set
  const connectTimerRef = useRef(null);
  const makingOfferRef = useRef(false);
  const roleRef = useRef(null); // 'caller' | 'callee' for the call currently in progress

  const clearConnectTimer = () => {
    if (connectTimerRef.current) {
      clearTimeout(connectTimerRef.current);
      connectTimerRef.current = null;
    }
  };

  const teardownPeerConnection = useCallback(() => {
    clearConnectTimer();
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    pendingCandidatesRef.current = [];
    makingOfferRef.current = false;
    roleRef.current = null;
  }, []);

  const resetToIdle = useCallback(() => {
    teardownPeerConnection();
    setCallState('idle');
    setIncomingCall(null);
    setActiveCall(null);
    setMuted(false);
    setCallStartedAt(null);
  }, [teardownPeerConnection]);

  const send = useCallback((payload) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  /** Creates the RTCPeerConnection + local mic stream, wiring ICE candidates back through signaling. */
  const setupPeerConnection = useCallback(
    async (callId) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      pc.onicecandidate = (e) => {
        if (e.candidate) send({ type: 'call:signal', callId, data: { candidate: e.candidate.toJSON() } });
      };

      pc.ontrack = (e) => {
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0];
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          clearConnectTimer();
          setCallState('active');
          setCallStartedAt((prev) => prev || Date.now());
        } else if (pc.connectionState === 'failed') {
          setError('Call connection failed. This can happen across some networks/firewalls.');
          send({ type: 'call:hangup', callId });
          resetToIdle();
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      connectTimerRef.current = setTimeout(() => {
        if (pc.connectionState !== 'connected') {
          setError('Could not connect the call (no response from the other side\'s network).');
          send({ type: 'call:hangup', callId });
          resetToIdle();
        }
      }, CONNECT_TIMEOUT_MS);

      return pc;
    },
    [send, resetToIdle]
  );

  const startCall = useCallback(
    async (conversationId, otherName) => {
      setError(null);
      if (callState !== 'idle') return;
      setCallState('calling');
      setActiveCall({ callId: null, conversationId, otherName });
      send({ type: 'call:invite', conversationId });
    },
    [callState, send]
  );

  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    setError(null);
    const { callId, conversationId, callerName } = incomingCall;
    roleRef.current = 'callee';
    setActiveCall({ callId, conversationId, otherName: callerName });
    setIncomingCall(null);
    setCallState('connecting');
    try {
      await setupPeerConnection(callId);
      send({ type: 'call:accept', callId });
    } catch {
      setError('Could not access your microphone.');
      send({ type: 'call:decline', callId });
      resetToIdle();
    }
  }, [incomingCall, setupPeerConnection, send, resetToIdle]);

  const declineCall = useCallback(() => {
    if (!incomingCall) return;
    send({ type: 'call:decline', callId: incomingCall.callId });
    setIncomingCall(null);
    setCallState('idle');
  }, [incomingCall, send]);

  const hangUp = useCallback(() => {
    const callId = activeCall?.callId;
    if (callId) {
      send({ type: 'call:hangup', callId });
    } else if (callState === 'calling') {
      // We invited but nothing has a callId assigned to us to cancel with yet
      // (server hasn't replied with call:ringing) -- there's nothing to
      // cancel server-side in that narrow window; just reset locally.
    }
    resetToIdle();
  }, [activeCall, callState, send, resetToIdle]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const next = !muted;
    localStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setMuted(next);
  }, [muted]);

  // ---- Signaling message handling ----
  const handleServerMessage = useCallback(
    async (msg) => {
      switch (msg.type) {
        case 'call:incoming': {
          // Ignore a second incoming invite while already on/handling a call.
          if (callState !== 'idle') return;
          setIncomingCall({ callId: msg.callId, conversationId: msg.conversationId, callerName: msg.callerName });
          setCallState('ringing');
          return;
        }
        case 'call:ringing': {
          setActiveCall((prev) => (prev ? { ...prev, callId: msg.callId } : prev));
          return;
        }
        case 'call:unavailable': {
          setError('They are not available to take a call right now.');
          resetToIdle();
          return;
        }
        case 'call:accepted': {
          // We're the caller; the callee accepted. Caller creates the offer
          // (callee-answers-first convention avoids "glare" from both sides
          // trying to offer simultaneously).
          if (roleRef.current === null) roleRef.current = 'caller';
          setCallState('connecting');
          try {
            const callId = activeCall?.callId ?? msg.callId;
            const pc = await setupPeerConnection(callId);
            makingOfferRef.current = true;
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            send({ type: 'call:signal', callId, data: { sdp: pc.localDescription } });
          } catch {
            setError('Could not access your microphone.');
            send({ type: 'call:hangup', callId: activeCall?.callId ?? msg.callId });
            resetToIdle();
          } finally {
            makingOfferRef.current = false;
          }
          return;
        }
        case 'call:signal': {
          const pc = pcRef.current;
          if (!pc) return;
          const { data } = msg;
          if (data.sdp) {
            await pc.setRemoteDescription(data.sdp);
            if (data.sdp.type === 'offer') {
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              send({ type: 'call:signal', callId: msg.callId, data: { sdp: pc.localDescription } });
            }
            // Flush any ICE candidates that arrived before the remote description was set.
            for (const cand of pendingCandidatesRef.current) {
              await pc.addIceCandidate(cand).catch(() => {});
            }
            pendingCandidatesRef.current = [];
          } else if (data.candidate) {
            if (pc.remoteDescription) {
              await pc.addIceCandidate(data.candidate).catch(() => {});
            } else {
              pendingCandidatesRef.current.push(data.candidate);
            }
          }
          return;
        }
        case 'call:dismiss': {
          // Another of our own open tabs answered this call -- stop ringing here.
          if (incomingCall?.callId === msg.callId) {
            setIncomingCall(null);
            setCallState('idle');
          }
          return;
        }
        case 'call:declined': {
          setError('Call declined.');
          resetToIdle();
          return;
        }
        case 'call:cancelled': {
          setIncomingCall(null);
          setCallState('idle');
          return;
        }
        case 'call:timeout': {
          setError('No answer.');
          resetToIdle();
          return;
        }
        case 'call:ended': {
          resetToIdle();
          return;
        }
        case 'error': {
          setError(msg.message || 'Something went wrong with the call.');
          return;
        }
        default:
          return;
      }
    },
    [callState, incomingCall, activeCall, setupPeerConnection, send, resetToIdle]
  );

  const handleServerMessageRef = useRef(handleServerMessage);
  handleServerMessageRef.current = handleServerMessage;

  // ---- Own the one signaling socket for as long as the user is logged in ----
  useEffect(() => {
    if (!user) {
      wsRef.current?.close();
      wsRef.current = null;
      resetToIdle();
      return;
    }

    let cancelled = false;
    let reconnectTimer = null;

    const connect = () => {
      if (cancelled) return;
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          handleServerMessageRef.current(msg);
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        if (cancelled) return;
        // The signaling socket dropping mid-call means the server-side
        // cleanup (cleanupSocketCalls) already ended it on the server; drop
        // our own local call state so the UI doesn't show a phantom call.
        resetToIdle();
        reconnectTimer = setTimeout(connect, 3000);
      };
    };
    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => resetToIdle, [resetToIdle]);

  return (
    <CallContext.Provider
      value={{
        callState,
        incomingCall,
        activeCall,
        muted,
        error,
        callStartedAt,
        remoteAudioRef,
        startCall,
        acceptCall,
        declineCall,
        hangUp,
        toggleMute,
        clearError: () => setError(null),
      }}
    >
      {children}
      <audio ref={remoteAudioRef} autoPlay />
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}
