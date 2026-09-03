// Global call UI: an incoming-call modal and an active-call bar, both mounted
// once in main.jsx (inside CallProvider) so a call rings/persists no matter
// which page the user is currently on -- same reasoning as a phone app's
// call screen not caring which app was in the foreground when it rang.
import { useEffect, useState } from 'react';
import { useCall } from '../context/CallContext.jsx';

function useElapsedSeconds(startedAt) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);
  return elapsed;
}

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function IncomingCallModal() {
  const { incomingCall, acceptCall, declineCall } = useCall();
  if (!incomingCall) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-ember-100 text-3xl font-display text-ember-600 animate-pulse">
          {incomingCall.callerName?.[0]?.toUpperCase() || '?'}
        </div>
        <p className="text-sm text-ink-700/60">Incoming call</p>
        <p className="mt-1 font-display text-xl text-ink-900">{incomingCall.callerName || 'Someone'}</p>
        <div className="mt-6 flex justify-center gap-4">
          <button
            onClick={declineCall}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white text-2xl shadow-lg hover:bg-red-600"
            aria-label="Decline call"
          >
            ✕
          </button>
          <button
            onClick={acceptCall}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white text-2xl shadow-lg hover:bg-green-600"
            aria-label="Accept call"
          >
            📞
          </button>
        </div>
      </div>
    </div>
  );
}

function ActiveCallBar() {
  const { callState, activeCall, muted, error, callStartedAt, toggleMute, hangUp, clearError } = useCall();
  const elapsed = useElapsedSeconds(callStartedAt);

  if (callState === 'idle' || callState === 'ringing') {
    if (!error) return null;
    // Show a brief, dismissable toast for terminal call errors (declined, no
    // answer, connection failed) even once we're back to idle.
    return (
      <div className="fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-ink-900 px-5 py-2.5 text-sm text-white shadow-lg">
        {error}
        <button onClick={clearError} className="ml-3 text-white/60 hover:text-white">
          ✕
        </button>
      </div>
    );
  }

  const label = callState === 'calling' ? `Calling ${activeCall?.otherName || ''}…` : callState === 'connecting' ? 'Connecting…' : formatDuration(elapsed);

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-4 rounded-full bg-ink-900 px-5 py-3 text-white shadow-2xl">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${callState === 'active' ? 'bg-green-400' : 'bg-ember-400 animate-pulse'}`} />
        <span className="text-sm font-medium">{activeCall?.otherName || 'Call'}</span>
        <span className="text-xs text-white/60">{label}</span>
      </div>
      {callState === 'active' && (
        <button
          onClick={toggleMute}
          className={`flex h-9 w-9 items-center justify-center rounded-full text-sm ${muted ? 'bg-ember-500' : 'bg-white/10 hover:bg-white/20'}`}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? '🔇' : '🎙️'}
        </button>
      )}
      <button
        onClick={hangUp}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-sm hover:bg-red-600"
        aria-label="Hang up"
      >
        ✕
      </button>
    </div>
  );
}

export default function CallOverlays() {
  return (
    <>
      <IncomingCallModal />
      <ActiveCallBar />
    </>
  );
}
