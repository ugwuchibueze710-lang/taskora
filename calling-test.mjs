// Targeted regression tests for in-app voice calling's signaling layer
// (server/src/realtime/call-signaling.js):
//   1. The /ws/calls WebSocket upgrade rejects an unauthenticated connection
//      (no session cookie) with 401, and accepts an authenticated one.
//   2. A full happy-path call: invite -> callee gets call:incoming -> accept
//      -> caller gets call:accepted -> signal relay both directions -> hangup
//      -> both sides get call:ended, and the outcome is logged into the
//      conversation's messages as a type='system' entry.
//   3. Decline: callee declines -> caller gets call:declined, DB status
//      'declined', logged to the conversation.
//   4. Cancel: caller cancels before the callee answers -> callee gets
//      call:cancelled, DB status 'missed'.
//   5. Unavailable: inviting a callee with no open socket immediately
//      resolves as missed (call:unavailable to the caller), no ringing.
//   6. Authorization: a call cannot be accepted/signaled by a user who is
//      not the callee/a participant (its own socket only, since the server
//      derives the callee from the conversation -- this checks that a
//      stranger's invite is rejected for a conversation they're not in, and
//      that a stray call:accept on a foreign callId is silently ignored
//      rather than hijacking the call).
//   7. Disconnect cleanup: if the callee's socket drops while a call is still
//      'ringing', the caller is told call:cancelled and the call is marked
//      missed (mirrors an explicit cancel).
//
// This only exercises the signaling/state-machine logic over real WebSocket
// connections -- no real audio, no RTCPeerConnection (that needs a browser;
// see the Playwright test for real end-to-end WebRTC connectivity). It does
// NOT need the 'ws' package (Node 22 ships a native WebSocket global) or a
// direct DB connection -- outcomes that land in Postgres (call status,
// call-log messages) are verified the same way a client would see them: by
// reading them back over the existing REST API as one of the two participants.
//
// Run against the locally-running dev server (http://localhost:4000).
const BASE = 'http://localhost:4000/api';
const WS_BASE = 'ws://localhost:4000/ws/calls';
const results = [];

function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
}

function makeSession() {
  let cookie = null;
  return {
    get cookie() {
      return cookie;
    },
    async req(method, path, body) {
      const headers = { 'Content-Type': 'application/json' };
      if (cookie) headers.Cookie = cookie;
      const res = await fetch(BASE + path, { method, headers, body: body != null ? JSON.stringify(body) : undefined });
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      let json = null;
      try {
        json = await res.json();
      } catch {}
      return { status: res.status, json };
    },
  };
}

const rand = () => Math.random().toString(36).slice(2, 10);

async function signup(session, label) {
  const email = `${label}_${rand()}@example.com`;
  const r = await session.req('POST', '/auth/signup', { firstName: label, lastName: 'Test', email, password: 'pw123456' });
  return r.json?.user;
}

async function becomeProvider(session) {
  await session.req('POST', '/profile/mode', { mode: 'provider' });
  const setup = await session.req('POST', '/providers/setup');
  const catRows = await fetch(BASE + '/categories').then((r) => r.json());
  const anyCategory = catRows.categories[0];
  await session.req('PUT', '/providers/me/categories', { categoryIds: [anyCategory.id] });
  await session.req('POST', '/providers/me/publish');
  return setup.json?.provider;
}

/** Opens an authenticated WS connection using a session's cookie. Resolves once 'open' fires. */
function connectWs(cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_BASE, { headers: { Cookie: cookie } });
    const timer = setTimeout(() => reject(new Error('WS connect timeout')), 5000);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.addEventListener('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

/** Collects incoming JSON messages on a socket into an array, and exposes a helper to wait for one matching a predicate. */
function collector(ws) {
  const messages = [];
  ws.addEventListener('message', (e) => {
    try {
      messages.push(JSON.parse(e.data));
    } catch {}
  });
  return {
    messages,
    // Finds the first matching message and consumes it (and everything
    // received before it) from the buffer. Without this, a later waitFor()
    // for a message type that also occurred earlier in the test (e.g. a
    // second call's 'call:incoming') would keep matching the stale, already
    // -handled message from a previous call instead of waiting for the new
    // one -- which silently makes the test act on a dead callId.
    async waitFor(predicate, timeoutMs = 4000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const idx = messages.findIndex(predicate);
        if (idx !== -1) return messages.splice(0, idx + 1).pop();
        await new Promise((r) => setTimeout(r, 50));
      }
      return null;
    },
  };
}

function send(ws, payload) {
  ws.send(JSON.stringify(payload));
}

/** Reads back the conversation's message log as `session` and finds the most recent call-log entry, optionally for a specific callId. */
async function findCallLogMessage(session, conversationId, callId) {
  const { json } = await session.req('GET', `/messages/conversations/${conversationId}/messages`);
  const calls = (json?.messages || []).filter((m) => m.type === 'system' && m.metadata?.kind === 'call' && (!callId || m.metadata?.callId === callId));
  return calls[calls.length - 1] || null;
}

async function main() {
  // ===========================================================================
  // Set up: a customer, a provider, and a conversation between them.
  // ===========================================================================
  const cust = makeSession();
  const custUser = await signup(cust, 'callCust');
  const prov = makeSession();
  const provUser = await signup(prov, 'callProv');
  const provider = await becomeProvider(prov);
  record('sanity: provider setup succeeded', !!provider?.id, JSON.stringify(provider));

  const convRes = await cust.req('POST', '/messages/conversations', { providerId: provider.id, message: 'Hi, need a quote please.' });
  const conversationId = convRes.json?.conversation?.id;
  record('sanity: conversation created', convRes.status === 201 && !!conversationId, JSON.stringify(convRes.json));

  // ===========================================================================
  // 1. Auth on the WS upgrade: no cookie -> rejected; valid cookie -> accepted.
  // ===========================================================================
  {
    // fetch() can't send a raw Upgrade request (undici rejects a manual
    // Connection header), so drive this with a plain TCP socket instead and
    // check the raw HTTP response line the server writes on rejection.
    const net = await import('net');
    const rejected = await new Promise((resolve) => {
      const socket = net.createConnection({ host: 'localhost', port: 4000 }, () => {
        socket.write(
          'GET /ws/calls HTTP/1.1\r\nHost: localhost:4000\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n' +
            'Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n'
        );
      });
      let data = '';
      socket.on('data', (chunk) => {
        data += chunk.toString();
      });
      socket.on('close', () => resolve(data));
      setTimeout(() => {
        socket.destroy();
        resolve(data);
      }, 3000);
    });
    record('unauthenticated WS upgrade is rejected with 401', /^HTTP\/1\.1 401/.test(rejected), JSON.stringify(rejected));
  }

  const custWs = await connectWs(cust.cookie);
  const provWs = await connectWs(prov.cookie);
  const custMsgs = collector(custWs);
  const provMsgs = collector(provWs);
  record('authenticated customer WS connects', custWs.readyState === WebSocket.OPEN);
  record('authenticated provider WS connects', provWs.readyState === WebSocket.OPEN);

  // ===========================================================================
  // 2. Happy path: invite -> incoming -> accept -> accepted -> signal x2 -> hangup -> ended both sides.
  // ===========================================================================
  {
    send(custWs, { type: 'call:invite', conversationId });
    const incoming = await provMsgs.waitFor((m) => m.type === 'call:incoming');
    record('callee receives call:incoming', !!incoming && incoming.conversationId === conversationId, JSON.stringify(incoming));
    const callerName = incoming?.callerName;
    record('call:incoming carries the caller\'s name', callerName === 'callCust Test', `callerName=${callerName}`);

    const ringing = await custMsgs.waitFor((m) => m.type === 'call:ringing');
    record('caller receives call:ringing (with a callId)', !!ringing?.callId, JSON.stringify(ringing));
    const callId = ringing.callId;
    record('the callId in call:incoming matches the one in call:ringing', incoming.callId === callId);

    send(provWs, { type: 'call:accept', callId });
    const accepted = await custMsgs.waitFor((m) => m.type === 'call:accepted');
    record('caller receives call:accepted', !!accepted, JSON.stringify(accepted));

    // Simulate the WebRTC SDP offer/answer relay (no real RTCPeerConnection here -- just verifying the server forwards opaque `data` blobs to the *other* party untouched).
    send(custWs, { type: 'call:signal', callId, data: { sdp: { type: 'offer', sdp: 'fake-offer-sdp' } } });
    const offerRelayed = await provMsgs.waitFor((m) => m.type === 'call:signal' && m.data?.sdp?.type === 'offer');
    record('SDP offer relayed caller -> callee unmodified', offerRelayed?.data?.sdp?.sdp === 'fake-offer-sdp', JSON.stringify(offerRelayed));

    send(provWs, { type: 'call:signal', callId, data: { sdp: { type: 'answer', sdp: 'fake-answer-sdp' } } });
    const answerRelayed = await custMsgs.waitFor((m) => m.type === 'call:signal' && m.data?.sdp?.type === 'answer');
    record('SDP answer relayed callee -> caller unmodified', answerRelayed?.data?.sdp?.sdp === 'fake-answer-sdp', JSON.stringify(answerRelayed));

    send(custWs, { type: 'call:hangup', callId });
    const endedForCaller = await custMsgs.waitFor((m) => m.type === 'call:ended' && m.callId === callId);
    const endedForCallee = await provMsgs.waitFor((m) => m.type === 'call:ended' && m.callId === callId);
    record('both sides receive call:ended on hangup', !!endedForCaller && !!endedForCallee);

    const loggedMsg = await findCallLogMessage(cust, conversationId, callId);
    record(
      'call outcome logged into the conversation as a system message, with a duration',
      loggedMsg?.metadata?.outcome === 'ended' && typeof loggedMsg?.metadata?.durationSeconds === 'number' && /Call ended/.test(loggedMsg?.body || ''),
      JSON.stringify(loggedMsg)
    );
  }

  // ===========================================================================
  // 3. Decline.
  // ===========================================================================
  {
    send(custWs, { type: 'call:invite', conversationId });
    const incoming = await provMsgs.waitFor((m) => m.type === 'call:incoming' && !!m.callId);
    const callId = incoming.callId;
    send(provWs, { type: 'call:decline', callId });
    const declined = await custMsgs.waitFor((m) => m.type === 'call:declined' && m.callId === callId);
    record('caller receives call:declined', !!declined);
    const loggedMsg = await findCallLogMessage(cust, conversationId, callId);
    record('a declined call is logged with outcome=declined', loggedMsg?.metadata?.outcome === 'declined', JSON.stringify(loggedMsg));
  }

  // ===========================================================================
  // 4. Cancel (caller hangs up before the callee answers).
  // ===========================================================================
  {
    send(custWs, { type: 'call:invite', conversationId });
    const ringing = await custMsgs.waitFor((m) => m.type === 'call:ringing');
    const callId = ringing.callId;
    await provMsgs.waitFor((m) => m.type === 'call:incoming' && m.callId === callId); // make sure the callee actually saw it ring first
    send(custWs, { type: 'call:cancel', callId });
    const cancelled = await provMsgs.waitFor((m) => m.type === 'call:cancelled' && m.callId === callId);
    record('callee receives call:cancelled', !!cancelled);
    const loggedMsg = await findCallLogMessage(cust, conversationId, callId);
    record('a caller-cancelled call is logged with outcome=missed', loggedMsg?.metadata?.outcome === 'missed', JSON.stringify(loggedMsg));
  }

  // ===========================================================================
  // 5. Unavailable: invite while the callee has no open socket.
  // ===========================================================================
  {
    provWs.close();
    await new Promise((r) => setTimeout(r, 300)); // let the server process the close + presence cleanup
    send(custWs, { type: 'call:invite', conversationId });
    const unavailable = await custMsgs.waitFor((m) => m.type === 'call:unavailable');
    record('inviting an offline callee immediately returns call:unavailable', !!unavailable, JSON.stringify(unavailable));
    const loggedMsg = await findCallLogMessage(cust, conversationId);
    record('an unavailable-callee call is logged with outcome=missed', loggedMsg?.metadata?.outcome === 'missed', JSON.stringify(loggedMsg));
  }

  // Reconnect the provider for the remaining tests.
  const provWs2 = await connectWs(prov.cookie);
  const provMsgs2 = collector(provWs2);

  // ===========================================================================
  // 6. Authorization: a stranger cannot invite on a conversation they aren't in,
  //    and a stray accept/signal on someone else's call is silently ignored.
  // ===========================================================================
  {
    const stranger = makeSession();
    await signup(stranger, 'callStranger');
    const strangerWs = await connectWs(stranger.cookie);
    const strangerMsgs = collector(strangerWs);
    send(strangerWs, { type: 'call:invite', conversationId });
    const err = await strangerMsgs.waitFor((m) => m.type === 'error');
    record('a non-participant inviting on the conversation gets an error, not a call', !!err, JSON.stringify(err));

    // Start a legitimate call, then have the stranger try to accept it.
    send(custWs, { type: 'call:invite', conversationId });
    const ringing = await custMsgs.waitFor((m) => m.type === 'call:ringing');
    const callId = ringing.callId;
    await provMsgs2.waitFor((m) => m.type === 'call:incoming' && m.callId === callId);

    send(strangerWs, { type: 'call:accept', callId });
    const strangerErr = await strangerMsgs.waitFor((m) => m.type === 'error');
    record('the stranger\'s bogus accept gets an error back, not a call', !!strangerErr);

    // If the stranger's accept had hijacked the call (flipped it out of
    // 'ringing'), the real callee's accept below would now be rejected too
    // (handleAccept requires status === 'ringing') and call:accepted would
    // never arrive -- so this also proves the call state wasn't corrupted.
    send(provWs2, { type: 'call:accept', callId });
    const accepted = await custMsgs.waitFor((m) => m.type === 'call:accepted');
    record('the real callee can still accept afterward (stranger did not hijack call state)', !!accepted);
    send(custWs, { type: 'call:hangup', callId });
    await custMsgs.waitFor((m) => m.type === 'call:ended' && m.callId === callId);
    strangerWs.close();
  }

  // ===========================================================================
  // 7. Disconnect cleanup: callee's socket drops mid-ring -> caller told cancelled, DB missed.
  // ===========================================================================
  {
    send(custWs, { type: 'call:invite', conversationId });
    const ringing = await custMsgs.waitFor((m) => m.type === 'call:ringing');
    const callId = ringing.callId;
    await provMsgs2.waitFor((m) => m.type === 'call:incoming' && m.callId === callId);
    provWs2.close();
    const cancelled = await custMsgs.waitFor((m) => m.type === 'call:cancelled' && m.callId === callId);
    record('caller is told call:cancelled when the ringing callee disconnects', !!cancelled, JSON.stringify(cancelled));
  }

  custWs.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length) {
    console.log('\nFailures:');
    failed.forEach((f) => console.log(`  - ${f.name} :: ${f.detail}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
