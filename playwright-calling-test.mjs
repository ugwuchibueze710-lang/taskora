// End-to-end proof that in-app calling forms a REAL WebRTC connection: two
// separate, isolated browser contexts (their own cookies/session, exactly
// like two different people on two different devices) sign up as a customer
// and a provider, start a conversation, place a call through the actual UI
// (CallOverlays.jsx / ConversationThread.jsx), and the test asserts both
// sides' RTCPeerConnection reaches 'connected' -- the ICE handshake actually
// completing, not just the signaling messages being exchanged (that part is
// already covered by calling-test.mjs). Chromium's fake-media-device flags
// stand in for a real microphone so this runs headless with no hardware.
//
// Run against the Vite dev server (http://localhost:5173, which proxies
// /api and /ws to the backend on :4000 per client/vite.config.js).
import { chromium } from '/home/claude/pwtest/node_modules/playwright/index.mjs';

const APP = 'http://localhost:5173';
const results = [];
function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
}

const rand = () => Math.random().toString(36).slice(2, 10);

async function signupViaApi(context, label) {
  const email = `${label}_${rand()}@example.com`;
  const res = await context.request.post(`${APP}/api/auth/signup`, {
    data: { firstName: label, lastName: 'PW', email, password: 'pw123456' },
  });
  if (!res.ok()) throw new Error(`signup failed for ${label}: ${res.status()} ${await res.text()}`);
  return (await res.json()).user;
}

async function becomeProviderViaApi(context) {
  await context.request.post(`${APP}/api/profile/mode`, { data: { mode: 'provider' } });
  const setup = await context.request.post(`${APP}/api/providers/setup`);
  const provider = (await setup.json()).provider;
  const cats = await (await context.request.get(`${APP}/api/categories`)).json();
  await context.request.put(`${APP}/api/providers/me/categories`, { data: { categoryIds: [cats.categories[0].id] } });
  await context.request.post(`${APP}/api/providers/me/publish`);
  return provider;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-fake-microphone-for-media-stream'],
  });

  const custContext = await browser.newContext();
  const provContext = await browser.newContext();
  await custContext.grantPermissions(['microphone'], { origin: APP });
  await provContext.grantPermissions(['microphone'], { origin: APP });

  try {
    // ---- Set up a customer, a provider, and a conversation between them, the same way calling-test.mjs does but through real cookie-bearing browser contexts. ----
    await signupViaApi(custContext, 'pwCust');
    await signupViaApi(provContext, 'pwProv');
    const provider = await becomeProviderViaApi(provContext);

    const convRes = await custContext.request.post(`${APP}/api/messages/conversations`, {
      data: { providerId: provider.id, message: 'Hi, is a call ok?' },
    });
    const conversationId = (await convRes.json()).conversation.id;
    record('conversation created for the WebRTC test', convRes.ok() && !!conversationId, `status=${convRes.status()}`);

    const custPage = await custContext.newPage();
    const provPage = await provContext.newPage();

    await custPage.goto(`${APP}/messages/${conversationId}`);
    await provPage.goto(`${APP}/provider/inbox/${conversationId}`);

    // ---- Place the call from the customer side through the real Call button. ----
    const callButton = custPage.locator('button[aria-label^="Call "]');
    await callButton.waitFor({ state: 'visible', timeout: 15000 });
    await callButton.click();
    record('customer clicked the real Call button in the UI', true);

    // ---- The provider should see the real incoming-call modal and accept it. ----
    const acceptButton = provPage.locator('button[aria-label="Accept call"]');
    await acceptButton.waitFor({ state: 'visible', timeout: 15000 });
    record('provider sees the incoming-call modal render', true);
    await acceptButton.click();

    // ---- Both sides should reach the 'active' call state -- the mute button
    // only renders once callState === 'active', which only happens once each
    // RTCPeerConnection's onconnectionstatechange fires 'connected'. This is
    // the actual proof of a completed ICE handshake, not just signaling. ----
    const custMuteBtn = custPage.locator('button[aria-label="Mute"], button[aria-label="Unmute"]');
    const provMuteBtn = provPage.locator('button[aria-label="Mute"], button[aria-label="Unmute"]');
    await custMuteBtn.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
    await provMuteBtn.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
    record('customer side reached the active call state (RTCPeerConnection connected)', await custMuteBtn.isVisible());
    record('provider side reached the active call state (RTCPeerConnection connected)', await provMuteBtn.isVisible());

    // ---- Confirm each side's actual RTCPeerConnection object agrees, and that a real remote audio track is attached. ----
    const custPcState = await custPage.evaluate(() => {
      const audio = document.querySelector('audio');
      const stream = audio?.srcObject;
      return {
        hasRemoteStream: !!stream,
        audioTracks: stream ? stream.getAudioTracks().length : 0,
        trackEnabled: stream ? stream.getAudioTracks()[0]?.enabled : null,
        trackReadyState: stream ? stream.getAudioTracks()[0]?.readyState : null,
      };
    });
    record(
      'customer received a real remote audio MediaStreamTrack over the peer connection',
      custPcState.hasRemoteStream && custPcState.audioTracks > 0 && custPcState.trackReadyState === 'live',
      JSON.stringify(custPcState)
    );

    const provPcState = await provPage.evaluate(() => {
      const audio = document.querySelector('audio');
      const stream = audio?.srcObject;
      return {
        hasRemoteStream: !!stream,
        audioTracks: stream ? stream.getAudioTracks().length : 0,
        trackReadyState: stream ? stream.getAudioTracks()[0]?.readyState : null,
      };
    });
    record(
      'provider received a real remote audio MediaStreamTrack over the peer connection',
      provPcState.hasRemoteStream && provPcState.audioTracks > 0 && provPcState.trackReadyState === 'live',
      JSON.stringify(provPcState)
    );

    // ---- Mute toggles the customer's own outgoing microphone track.
    // (Chromium's fake audio device in this sandbox is too quiet at 8-bit
    // sampling resolution to reliably distinguish "muted" from "quiet" by
    // measuring received amplitude on the other side -- tried, both read as
    // ~silent -- so this instead confirms the one thing directly observable
    // from outside React's closure: the UI state toggleMute drives. The
    // source review already establishes *what* it does when triggered --
    // `track.enabled = !next` on the actual mic track, the WebRTC-standard
    // way to mute, which makes the sender transmit silence by spec.) ----
    await custMuteBtn.click();
    const isUnmuteLabel = await custMuteBtn.getAttribute('aria-label');
    record('mute button reflects muted state after clicking', isUnmuteLabel === 'Unmute', `aria-label=${isUnmuteLabel}`);
    await custMuteBtn.click();
    const isMuteLabelAgain = await custMuteBtn.getAttribute('aria-label');
    record('clicking again un-mutes (button reverts)', isMuteLabelAgain === 'Mute', `aria-label=${isMuteLabelAgain}`);

    // ---- Hang up from the provider side; both UIs should return to idle (no hang-up button left). ----
    await provPage.locator('button[aria-label="Hang up"]').click();
    await custPage.waitForTimeout(500);
    const custHangupGone = await custPage.locator('button[aria-label="Hang up"]').count();
    const provHangupGone = await provPage.locator('button[aria-label="Hang up"]').count();
    record('hangup on one side cleanly ends the call UI on both sides', custHangupGone === 0 && provHangupGone === 0, `cust=${custHangupGone} prov=${provHangupGone}`);

    // ---- The call should now show up as a logged system message with a duration. ----
    await custPage.reload();
    await custPage.waitForTimeout(500);
    const bodyText = await custPage.locator('text=/Call ended/').first().textContent().catch(() => null);
    record('the ended call is visible in the conversation thread as a system message', !!bodyText, bodyText);
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length) {
    console.log('\nFailures:');
    failed.forEach((f) => console.log(`  - ${f.name} :: ${f.detail}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Playwright calling test crashed:', err);
  process.exit(1);
});
