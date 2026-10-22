import crypto from 'crypto';
import { getBdtLink } from '../services/it-connection.service.js';

// Pushes Servio Hub's heartbeat and errors to Black Daddy Tech's admin
// backend (bdt-website) in real time, over the signed-request protocol
// BDT's Site Protocol v1 defines (docs/SITE-PROTOCOL.md section 3). The
// credentials used here (bdt.url/siteId/secret) are whatever BDT handed
// back during the /connect handshake (see routes/it.routes.js and
// services/it-connection.service.js) -- set from the admin IT tab, not
// from environment variables. BDT_URL/BDT_SITE_ID/BDT_SITE_SECRET env vars
// still work too, as a manual override, if ever needed.
//
// Entirely opt-in: until a connection key has been generated in the IT tab
// and pasted into BDT (or those three env vars are set), every export here
// is a safe no-op.

let cachedLink = null;
let cachedAt = 0;
const CACHE_MS = 30_000; // one admin DB read per heartbeat interval at most

async function resolveConfig() {
  if (process.env.BDT_URL && process.env.BDT_SITE_ID && process.env.BDT_SITE_SECRET) {
    return { url: process.env.BDT_URL.replace(/\/+$/, ''), siteId: process.env.BDT_SITE_ID, secret: process.env.BDT_SITE_SECRET };
  }
  const now = Date.now();
  if (cachedLink !== null && now - cachedAt < CACHE_MS) return cachedLink || null;
  let link = null;
  try {
    link = await getBdtLink();
  } catch (err) {
    console.error('BDT connector: failed to read connection state:', err.message);
  }
  cachedLink = link ? { url: link.url.replace(/\/+$/, ''), siteId: link.siteId, secret: link.secret } : false;
  cachedAt = now;
  return cachedLink || null;
}

/** Call right after a fresh /connect handshake so the first heartbeat doesn't wait for the cache to expire. */
export function invalidateBdtLinkCache() {
  cachedLink = null;
  cachedAt = 0;
}

// Render sets RENDER_GIT_COMMIT to the deployed commit SHA -- the most
// useful "release" label BDT can show.
const RELEASE = process.env.RENDER_GIT_COMMIT || process.env.npm_package_version || 'dev';
const HEARTBEAT_SEC = Math.max(60, Number(process.env.BDT_HEARTBEAT_SEC) || 300);

export async function bdtConfigured() {
  return Boolean(await resolveConfig());
}

async function callBdt(path, payload, timeoutMs = 15000) {
  const config = await resolveConfig();
  if (!config) return { ok: false, status: 0, error: 'BDT connector is not configured' };
  const body = JSON.stringify(payload ?? {});
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString('base64url');
  const signature = crypto.createHmac('sha256', config.secret).update(`${ts}.${nonce}.${body}`).digest('hex');
  try {
    const res = await fetch(`${config.url}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-bdt-site': config.siteId,
        'x-bdt-timestamp': ts,
        'x-bdt-nonce': nonce,
        'x-bdt-signature': signature,
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => null);
    const error = !res.ok ? data?.error || `HTTP ${res.status}` : undefined;
    return { ok: res.ok, status: res.status, data, error };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

let timer = null;
let loggedUnconfigured = false;

/** Every 5 minutes by default: version, Node version, uptime, memory. */
export async function sendHeartbeat() {
  const mem = process.memoryUsage();
  const result = await callBdt('/api/connect/heartbeat', {
    release: RELEASE,
    intervalSec: HEARTBEAT_SEC,
    runtime: {
      node: process.version,
      uptimeMin: Math.round(process.uptime() / 60),
      memoryMb: Math.round(mem.rss / 1048576),
      region: process.env.RENDER_REGION || null,
    },
  });
  if (!result.ok) {
    if (result.error !== 'BDT connector is not configured') console.error('BDT heartbeat failed:', result.error);
    else if (!loggedUnconfigured) {
      loggedUnconfigured = true;
      console.log('BDT connector idle -- no connection key generated/connected yet (Admin -> IT tab).');
    }
  } else {
    loggedUnconfigured = false;
  }
  return result;
}

/** Always runs the timer (cheap no-op ticks until a connection exists) so
 * connecting later, from the admin IT tab, starts reporting immediately
 * without a redeploy or restart. */
export function startBdtConnector() {
  if (timer) return;
  void sendHeartbeat();
  timer = setInterval(() => void sendHeartbeat(), HEARTBEAT_SEC * 1000);
  timer.unref?.();
}

/**
 * Forwards one error to BDT Admin -> this site -> Errors (or Issues, on
 * newer BDT builds). Never throws -- a reporting failure must never affect
 * the caller.
 */
export async function reportErrorToBdt(e) {
  try {
    await callBdt(
      '/api/connect/errors',
      {
        errors: [
          {
            message: String(e.message || 'Unknown error').slice(0, 2000),
            stack: e.stack ? String(e.stack).slice(0, 12000) : null,
            path: e.path || null,
            routePath: e.routePath || null,
            routeType: e.routeType || 'http',
            level: e.level || 'error',
            release: RELEASE,
          },
        ],
      },
      8000
    );
  } catch (err) {
    console.error('BDT error report failed:', err.message);
  }
}

export function currentRelease() {
  return RELEASE;
}
