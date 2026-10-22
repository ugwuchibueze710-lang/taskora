import crypto from 'crypto';

// Reports Servio Hub's health and errors to Black Daddy Tech's admin
// backend (bdt-website) in real time, over the same signed-request
// protocol BDT's own client-starter kit uses (HMAC-SHA256 over
// `${timestamp}.${nonce}.${body}`, verified server-side by BDT's
// src/lib/signing.ts). Entirely opt-in: with no BDT_URL/BDT_SITE_ID/
// BDT_SITE_SECRET set, every export here is a safe no-op.
//
// Set up once in BDT Admin -> Websites -> Add a website -> that site's
// Connect tab gives BDT_URL, BDT_SITE_ID and BDT_SITE_SECRET -- paste
// those into this service's environment variables on Render.

const config = {
  url: (process.env.BDT_URL || '').replace(/\/+$/, ''),
  siteId: process.env.BDT_SITE_ID || '',
  secret: process.env.BDT_SITE_SECRET || '',
  heartbeatSec: Math.max(60, Number(process.env.BDT_HEARTBEAT_SEC) || 300),
  // Render sets RENDER_GIT_COMMIT to the deployed commit SHA -- that's the
  // most useful "release" label BDT can show (New version live: <sha>).
  release: process.env.RENDER_GIT_COMMIT || process.env.npm_package_version || 'dev',
};

export function bdtConfigured() {
  return Boolean(config.url && config.siteId && config.secret);
}

async function callBdt(path, payload, timeoutMs = 15000) {
  if (!bdtConfigured()) return { ok: false, status: 0, error: 'BDT connector is not configured' };
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

/** Every 5 minutes by default: version, Node version, uptime, memory. Also
 * picks up BDT-side maintenance-mode state, though Taskora doesn't act on
 * it (yet) -- logged only if BDT ever flips it on for this site. */
export async function sendHeartbeat() {
  const mem = process.memoryUsage();
  const result = await callBdt('/api/connect/heartbeat', {
    release: config.release,
    intervalSec: config.heartbeatSec,
    runtime: {
      node: process.version,
      uptimeMin: Math.round(process.uptime() / 60),
      memoryMb: Math.round(mem.rss / 1048576),
      region: process.env.RENDER_REGION || null,
    },
  });
  if (!result.ok) {
    console.error('BDT heartbeat failed:', result.error);
  } else if (result.data?.maintenance?.on) {
    console.warn('BDT has this site marked as "maintenance" -- no local effect configured for that yet.');
  }
  return result;
}

export function startBdtConnector() {
  if (timer) return;
  if (!bdtConfigured()) {
    console.log('BDT connector not configured (set BDT_URL, BDT_SITE_ID, BDT_SITE_SECRET to enable) -- skipping.');
    return;
  }
  void sendHeartbeat();
  timer = setInterval(() => void sendHeartbeat(), config.heartbeatSec * 1000);
  timer.unref?.();
  console.log(`BDT connector started -- reporting to ${config.url} every ${config.heartbeatSec}s.`);
}

/**
 * Forwards one error to BDT Admin -> this site -> Errors. Same fields BDT's
 * own client-starter sends; BDT groups repeats of the same error/route
 * together server-side, so this is safe to call on every occurrence.
 * Never throws -- a reporting failure must never affect the caller.
 */
export async function reportErrorToBdt(e) {
  if (!bdtConfigured()) return;
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
            release: config.release,
          },
        ],
      },
      8000
    );
  } catch (err) {
    console.error('BDT error report failed:', err.message);
  }
}
