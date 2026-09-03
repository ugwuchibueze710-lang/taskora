// In-app voice calling: the signaling channel that lets two browsers find
// each other and exchange the small handshake blobs WebRTC needs (an SDP
// offer/answer and a batch of ICE candidates) before they connect directly,
// peer-to-peer, for the actual audio. This module only ever forwards small
// JSON messages between two authenticated sockets -- the audio itself never
// touches this server.
//
// Authentication reuses the exact same session cookie ('taskora.sid') as
// every REST route: the shared `sessionMiddleware` (middleware/session.js)
// is run by hand against the upgrade request before the WebSocket handshake
// completes, so there is exactly one source of truth for "who is this",
// never a second parallel auth mechanism just for calls.
import { WebSocketServer } from 'ws';
import { query, withTransaction } from '../lib/db.js';
import { notify } from '../services/notification.service.js';
import { sessionMiddleware } from '../middleware/session.js';

const WS_PATH = '/ws/calls';
const RING_TIMEOUT_MS = 45_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

// userId -> Set<ws>. A person can have the app open in more than one tab, so
// every outgoing event goes to every socket they currently have open; each
// tab's own client-side state decides whether a given event is relevant to
// it (e.g. a stale tab silently ignores signaling for a call another tab
// already answered).
const presence = new Map();

// callId -> { conversationId, callerUserId, calleeUserId, status, ringTimer }
// In-memory bookkeeping for calls currently in flight, so every subsequent
// signaling message (accept/decline/signal/hangup) can be authorized and
// routed without a database round trip. The `calls` table remains the
// durable record; this map only ever holds calls that are not yet in a
// terminal state and is rebuilt from nothing on every server restart, which
// is fine -- a call in progress across a redeploy would drop anyway, same as
// a real phone call would if a cell tower rebooted mid-call.
const activeCalls = new Map();

function addPresence(userId, ws) {
  if (!presence.has(userId)) presence.set(userId, new Set());
  presence.get(userId).add(ws);
}

function removePresence(userId, ws) {
  const set = presence.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) presence.delete(userId);
}

function isOnline(userId) {
  return presence.has(userId) && presence.get(userId).size > 0;
}

function sendTo(userId, payload) {
  const set = presence.get(userId);
  if (!set) return false;
  const text = JSON.stringify(payload);
  let delivered = false;
  for (const sock of set) {
    if (sock.readyState === sock.OPEN) {
      sock.send(text);
      delivered = true;
    }
  }
  return delivered;
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

/** Same as sendTo, but skips one specific socket (used to tell a callee's OTHER open tabs to stop ringing once one tab answers). */
function sendToOthers(userId, payload, exceptWs) {
  const set = presence.get(userId);
  if (!set) return;
  const text = JSON.stringify(payload);
  for (const sock of set) {
    if (sock !== exceptWs && sock.readyState === sock.OPEN) sock.send(text);
  }
}

/**
 * Mirrors a call's outcome into the existing conversation thread as a
 * type='system' message (metadata.kind = 'call'), exactly like a job_update
 * or quote already appears inline -- so there is no separate call-log screen
 * to build. Deliberately bypasses message.service.js's sendMessage(), which
 * exists for real customer/provider messages and fires auto-replies and a
 * generic "New message" notification neither of which apply to a call event
 * (calls get their own, more specific notification -- see notifyCallEnded).
 */
async function logCallToConversation(client, { conversationId, body, metadata }) {
  await client.query(
    `INSERT INTO messages (conversation_id, sender_user_id, sender_role, type, body, metadata)
     VALUES ($1, NULL, 'system', 'system', $2, $3)`,
    [conversationId, body, JSON.stringify({ kind: 'call', ...metadata })]
  );
  await client.query('UPDATE conversations SET last_message_at = now() WHERE id = $1', [conversationId]);
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Loads a conversation + verifies `userId` is a participant, same rule as message.service.js's loadConversationForUser. */
async function loadConversationParticipant(conversationId, userId) {
  const { rows } = await query(
    `SELECT conv.id, conv.customer_id, pr.user_id AS provider_user_id
       FROM conversations conv JOIN providers pr ON pr.id = conv.provider_id
      WHERE conv.id = $1`,
    [conversationId]
  );
  const conv = rows[0];
  if (!conv) return null;
  if (conv.customer_id !== userId && conv.provider_user_id !== userId) return null;
  const calleeUserId = conv.customer_id === userId ? conv.provider_user_id : conv.customer_id;
  return { conversationId: conv.id, calleeUserId };
}

async function handleInvite(ws, user, msg) {
  const conversationId = msg.conversationId;
  if (typeof conversationId !== 'string') return send(ws, { type: 'error', message: 'conversationId is required.' });

  const participant = await loadConversationParticipant(conversationId, user.id);
  if (!participant) return send(ws, { type: 'error', message: 'Conversation not found.' });
  const { calleeUserId } = participant;

  const { rows } = await query(
    `INSERT INTO calls (conversation_id, caller_user_id, callee_user_id, status)
     VALUES ($1, $2, $3, 'ringing') RETURNING id`,
    [conversationId, user.id, calleeUserId]
  );
  const callId = rows[0].id;

  if (!isOnline(calleeUserId)) {
    await query(`UPDATE calls SET status = 'missed', ended_at = now() WHERE id = $1`, [callId]);
    await withTransaction((client) =>
      logCallToConversation(client, {
        conversationId,
        body: `📞 Missed call`,
        metadata: { callId, outcome: 'missed' },
      })
    );
    await notify(calleeUserId, {
      type: 'missed_call',
      title: 'Missed call',
      body: `${user.first_name} tried to call you.`,
      data: { conversationId, callId },
    });
    return send(ws, { type: 'call:unavailable', callId, conversationId });
  }

  const ringTimer = setTimeout(() => timeoutRinging(callId), RING_TIMEOUT_MS);
  activeCalls.set(callId, {
    conversationId,
    callerUserId: user.id,
    calleeUserId,
    status: 'ringing',
    ringTimer,
  });

  send(ws, { type: 'call:ringing', callId, conversationId });
  sendTo(calleeUserId, {
    type: 'call:incoming',
    callId,
    conversationId,
    callerUserId: user.id,
    callerName: `${user.first_name} ${user.last_name || ''}`.trim(),
  });
}

async function timeoutRinging(callId) {
  const call = activeCalls.get(callId);
  if (!call || call.status !== 'ringing') return;
  activeCalls.delete(callId);
  await query(`UPDATE calls SET status = 'missed', ended_at = now() WHERE id = $1`, [callId]);
  await withTransaction((client) =>
    logCallToConversation(client, {
      conversationId: call.conversationId,
      body: `📞 Missed call`,
      metadata: { callId, outcome: 'missed' },
    })
  );
  await notify(call.calleeUserId, {
    type: 'missed_call',
    title: 'Missed call',
    body: 'You missed a call.',
    data: { conversationId: call.conversationId, callId },
  });
  sendTo(call.callerUserId, { type: 'call:timeout', callId });
  sendTo(call.calleeUserId, { type: 'call:timeout', callId });
}

async function handleAccept(ws, user, msg) {
  const call = activeCalls.get(msg.callId);
  if (!call || call.calleeUserId !== user.id || call.status !== 'ringing') {
    return send(ws, { type: 'error', message: 'This call is no longer available.' });
  }
  clearTimeout(call.ringTimer);
  call.status = 'accepted';
  await query(`UPDATE calls SET status = 'accepted', connected_at = now() WHERE id = $1`, [msg.callId]);
  sendTo(call.callerUserId, { type: 'call:accepted', callId: msg.callId });
  // Any other open tab the callee has should stop ringing -- this one just took the call.
  sendToOthers(call.calleeUserId, { type: 'call:dismiss', callId: msg.callId }, ws);
}

async function handleDecline(ws, user, msg) {
  const call = activeCalls.get(msg.callId);
  if (!call || call.calleeUserId !== user.id || call.status !== 'ringing') return;
  clearTimeout(call.ringTimer);
  activeCalls.delete(msg.callId);
  await query(`UPDATE calls SET status = 'declined', ended_at = now() WHERE id = $1`, [msg.callId]);
  await withTransaction((client) =>
    logCallToConversation(client, {
      conversationId: call.conversationId,
      body: `📞 Call declined`,
      metadata: { callId: msg.callId, outcome: 'declined' },
    })
  );
  sendTo(call.callerUserId, { type: 'call:declined', callId: msg.callId });
}

async function handleCancel(ws, user, msg) {
  const call = activeCalls.get(msg.callId);
  if (!call || call.callerUserId !== user.id || call.status !== 'ringing') return;
  clearTimeout(call.ringTimer);
  activeCalls.delete(msg.callId);
  await query(`UPDATE calls SET status = 'missed', ended_at = now() WHERE id = $1`, [msg.callId]);
  await withTransaction((client) =>
    logCallToConversation(client, {
      conversationId: call.conversationId,
      body: `📞 Missed call`,
      metadata: { callId: msg.callId, outcome: 'missed' },
    })
  );
  await notify(call.calleeUserId, {
    type: 'missed_call',
    title: 'Missed call',
    body: 'You missed a call.',
    data: { conversationId: call.conversationId, callId: msg.callId },
  });
  sendTo(call.calleeUserId, { type: 'call:cancelled', callId: msg.callId });
}

function handleSignal(ws, user, msg) {
  const call = activeCalls.get(msg.callId);
  if (!call) return;
  if (call.callerUserId !== user.id && call.calleeUserId !== user.id) return;
  const otherUserId = call.callerUserId === user.id ? call.calleeUserId : call.callerUserId;
  sendTo(otherUserId, { type: 'call:signal', callId: msg.callId, data: msg.data });
}

async function handleHangup(ws, user, msg) {
  const call = activeCalls.get(msg.callId);
  if (!call) return;
  if (call.callerUserId !== user.id && call.calleeUserId !== user.id) return;
  clearTimeout(call.ringTimer);
  activeCalls.delete(msg.callId);

  const { rows } = await query(
    `UPDATE calls SET status = 'ended', ended_at = now(),
            duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(connected_at, started_at)))::int)
      WHERE id = $1 RETURNING duration_seconds`,
    [msg.callId]
  );
  const durationSeconds = rows[0]?.duration_seconds ?? 0;
  const wasConnected = call.status === 'accepted';

  await withTransaction((client) =>
    logCallToConversation(client, {
      conversationId: call.conversationId,
      body: wasConnected ? `📞 Call ended · ${formatDuration(durationSeconds)}` : `📞 Missed call`,
      metadata: { callId: msg.callId, outcome: wasConnected ? 'ended' : 'missed', durationSeconds },
    })
  );

  const otherUserId = call.callerUserId === user.id ? call.calleeUserId : call.callerUserId;
  sendTo(otherUserId, { type: 'call:ended', callId: msg.callId, durationSeconds });
  send(ws, { type: 'call:ended', callId: msg.callId, durationSeconds });
}

const HANDLERS = {
  'call:invite': handleInvite,
  'call:accept': handleAccept,
  'call:decline': handleDecline,
  'call:cancel': handleCancel,
  'call:signal': handleSignal,
  'call:hangup': handleHangup,
};

/**
 * Ends every call a socket was part of when it disconnects mid-call (tab
 * closed, network drop) so the other side isn't left waiting on a peer that
 * will never respond -- same cleanup as an explicit hangup, minus the
 * initiating socket's own ack (there's nothing left to send it to).
 */
async function cleanupSocketCalls(userId) {
  for (const [callId, call] of activeCalls) {
    if (call.callerUserId !== userId && call.calleeUserId !== userId) continue;
    if (call.status === 'ringing') {
      clearTimeout(call.ringTimer);
      activeCalls.delete(callId);
      await query(`UPDATE calls SET status = 'missed', ended_at = now() WHERE id = $1`, [callId]);
      const otherUserId = call.callerUserId === userId ? call.calleeUserId : call.callerUserId;
      sendTo(otherUserId, { type: 'call:cancelled', callId });
      continue;
    }
    activeCalls.delete(callId);
    const { rows } = await query(
      `UPDATE calls SET status = 'ended', ended_at = now(),
              duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(connected_at, started_at)))::int)
        WHERE id = $1 RETURNING duration_seconds`,
      [callId]
    );
    const durationSeconds = rows[0]?.duration_seconds ?? 0;
    await withTransaction((client) =>
      logCallToConversation(client, {
        conversationId: call.conversationId,
        body: `📞 Call ended · ${formatDuration(durationSeconds)}`,
        metadata: { callId, outcome: 'ended', durationSeconds },
      })
    );
    const otherUserId = call.callerUserId === userId ? call.calleeUserId : call.callerUserId;
    sendTo(otherUserId, { type: 'call:ended', callId, durationSeconds });
  }
}

/** Attaches the calling signaling WebSocket server to an existing http.Server. */
export function attachCallSignaling(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname !== WS_PATH) return; // leave any other upgrade alone

    sessionMiddleware(req, {}, async () => {
      const userId = req.session?.userId;
      if (!userId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      const { rows } = await query(
        `SELECT id, first_name, last_name, status FROM users WHERE id = $1`,
        [userId]
      );
      const user = rows[0];
      if (!user || user.status !== 'active') {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, user);
      });
    });
  });

  wss.on('connection', (ws, req, user) => {
    addPresence(user.id, ws);
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return send(ws, { type: 'error', message: 'Malformed message.' });
      }
      const handler = HANDLERS[msg?.type];
      if (!handler) return send(ws, { type: 'error', message: 'Unknown message type.' });
      Promise.resolve(handler(ws, user, msg)).catch((err) => {
        console.error('Call signaling handler failed:', err);
        send(ws, { type: 'error', message: 'Something went wrong on our end.' });
      });
    });

    ws.on('close', () => {
      removePresence(user.id, ws);
      cleanupSocketCalls(user.id).catch((err) => console.error('Call cleanup on disconnect failed:', err));
    });
  });

  // Idle connections behind some proxies get silently dropped without a
  // close event ever firing; a periodic ping/terminate keeps `presence`
  // (and therefore "is this person actually reachable for a call") honest.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  wss.on('close', () => clearInterval(heartbeat));

  return wss;
}
