import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireLevel2Admin } from '../middleware/auth.js';
import { asyncHandler, badRequest } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import { query } from '../lib/db.js';
import { getSetting, setSetting } from '../services/settings.service.js';
import {
  createConnectionKey,
  revokeConnectionKey,
  verifyConnectionKey,
  getConnectionStatus,
  saveBdtLink,
  clearBdtLink,
} from '../services/it-connection.service.js';
import { sendHeartbeat, invalidateBdtLinkCache, currentRelease } from '../lib/bdt-connector.js';
import { logAdminAction } from '../services/audit.service.js';

const BOOT_TIME = new Date().toISOString();

// ---------------------------------------------------------------------
// Admin-session routes -- mounted at /api/admin/it. These are what the
// admin IT tab calls: generate/revoke the connection key, see whether BDT
// is actually connected, and browse the same issues BDT sees.
// ---------------------------------------------------------------------
export const itAdminRouter = Router();
itAdminRouter.use(requireAuth, requireLevel2Admin);

itAdminRouter.get(
  '/status',
  asyncHandler(async (req, res) => {
    res.json(await getConnectionStatus());
  })
);

// Generating a key shows it exactly once -- it's a plaintext secret, never
// stored, never retrievable again. The BDT connection string is
// bdtc1_<base64url(JSON({u,k}))> per BDT's Site Protocol v1 (that's the
// one string to paste into BDT Admin -> Websites -> Add a website ->
// Connect with API key).
itAdminRouter.post(
  '/connection-key',
  asyncHandler(async (req, res) => {
    const secret = await createConnectionKey(req.user.id);
    const base = `${req.protocol}://${req.get('host')}/api/it/bdt`;
    const code = `bdtc1_${Buffer.from(JSON.stringify({ u: base, k: secret })).toString('base64url')}`;
    await logAdminAction({ adminUserId: req.user.id, actionType: 'it_connection_key_created' });
    res.json({ connectionKey: code, base });
  })
);

itAdminRouter.post(
  '/revoke-key',
  asyncHandler(async (req, res) => {
    await revokeConnectionKey();
    await logAdminAction({ adminUserId: req.user.id, actionType: 'it_connection_key_revoked' });
    res.json(await getConnectionStatus());
  })
);

// Local-only "forget BDT" -- doesn't call BDT (BDT calls our /disconnect
// when *it* disconnects; this is the reverse direction for when BDT isn't
// reachable or the admin just wants to stop pushing from this side).
itAdminRouter.post(
  '/disconnect',
  asyncHandler(async (req, res) => {
    await clearBdtLink();
    invalidateBdtLinkCache();
    await logAdminAction({ adminUserId: req.user.id, actionType: 'it_bdt_disconnected' });
    res.json(await getConnectionStatus());
  })
);

itAdminRouter.get(
  '/issues',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, severity, title, summary, detail, occurrence_count, status, created_at, last_seen_at
         FROM agency_items WHERE kind = 'error_diagnosis' ORDER BY last_seen_at DESC LIMIT 100`
    );
    res.json({ issues: rows });
  })
);

// ---------------------------------------------------------------------
// Protocol routes -- mounted at /api/it/bdt, called by BDT itself per
// docs/SITE-PROTOCOL.md in bdt-website. Authenticated by the connection
// key as a Bearer token, NOT by an admin session.
// ---------------------------------------------------------------------
export const itProtocolRouter = Router();

async function requireConnectionKey(req, res, next) {
  const header = req.headers.authorization || '';
  const key = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!(await verifyConnectionKey(key))) {
    return res.status(401).json({ error: 'Missing or invalid API key.' });
  }
  next();
}

itProtocolRouter.use(requireConnectionKey);

itProtocolRouter.post(
  '/connect',
  validateBody(
    z.object({
      protocol: z.number(),
      bdt: z.object({
        url: z.string().url(),
        siteId: z.string().min(1).max(100),
        secret: z.string().min(1).max(200),
        ssoPublicKey: z.string().optional().nullable(),
      }),
    })
  ),
  asyncHandler(async (req, res) => {
    if (req.body.protocol !== 1) throw badRequest('Unsupported protocol version.');
    const { bdt } = req.body;
    await saveBdtLink({ url: bdt.url, siteId: bdt.siteId, secret: bdt.secret });
    invalidateBdtLinkCache();
    void sendHeartbeat();

    const origin = `${req.protocol}://${req.get('host')}`;
    res.json({
      protocol: 1,
      site: {
        name: 'Servio Hub',
        url: process.env.CLIENT_ORIGIN?.split(',')[0] || origin,
        adminUrl: `${process.env.CLIENT_ORIGIN?.split(',')[0] || origin}/admin`,
        description: 'Local services marketplace -- customer, provider and admin in one app.',
      },
      version: currentRelease(),
      capabilities: ['summary', 'info', 'issues', 'commands'],
    });
  })
);

itProtocolRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const mem = process.memoryUsage();
    const t0 = Date.now();
    let dbOk = true;
    try {
      await query('SELECT 1');
    } catch {
      dbOk = false;
    }
    const maintenanceOn = (await getSetting('it_maintenance_enabled', false)) === true;
    const maintenanceMessage = await getSetting('it_maintenance_message', null);
    res.json({
      status: dbOk ? 'ok' : 'down',
      version: currentRelease(),
      startedAt: BOOT_TIME,
      maintenance: { on: maintenanceOn, message: maintenanceMessage },
      runtime: {
        node: process.version,
        memoryMb: Math.round(mem.rss / 1048576),
        uptimeMin: Math.round(process.uptime() / 60),
        region: process.env.RENDER_REGION || null,
      },
      checks: [{ name: 'database', ok: dbOk, ms: Date.now() - t0 }],
    });
  })
);

itProtocolRouter.get(
  '/info',
  asyncHandler(async (req, res) => {
    const { rows: counts } = await query(
      `SELECT (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM providers)::int AS providers, (SELECT count(*) FROM jobs)::int AS jobs`
    );
    res.json({
      app: { name: 'Servio Hub', description: 'Local services marketplace', framework: 'Express + React' },
      versions: { node: process.version },
      integrations: [
        { name: 'Supabase', configured: Boolean(process.env.SUPABASE_URL) },
        { name: 'Stripe', configured: Boolean(process.env.STRIPE_SECRET_KEY) },
        { name: 'Mapbox', configured: Boolean(process.env.MAPBOX_TOKEN) },
        { name: 'Groq (AI)', configured: Boolean(process.env.GROQ_API_KEY) },
      ],
      counts: counts[0] || {},
    });
  })
);

itProtocolRouter.get(
  '/issues',
  asyncHandler(async (req, res) => {
    const since = req.query.since ? new Date(req.query.since.toString()) : null;
    const limit = Math.min(200, Number(req.query.limit) || 200);
    const params = [];
    let where = `kind = 'error_diagnosis'`;
    if (since && !Number.isNaN(since.getTime())) {
      params.push(since.toISOString());
      where += ` AND last_seen_at > $${params.length}`;
    }
    params.push(limit);
    const { rows } = await query(
      `SELECT id, severity, title, summary, detail, occurrence_count, created_at, last_seen_at
         FROM agency_items WHERE ${where} ORDER BY last_seen_at ASC LIMIT $${params.length}`,
      params
    );
    const issues = rows.map((r) => ({
      id: r.id,
      kind: 'server_error',
      level: r.severity === 'critical' ? 'error' : 'warning',
      title: r.title,
      message: r.detail?.message || r.summary || r.title,
      stack: r.detail?.stack || null,
      route: r.detail?.route || null,
      source: 'server',
      count: r.occurrence_count,
      firstSeen: r.created_at,
      lastSeen: r.last_seen_at,
    }));
    const cursor = issues.length ? issues[issues.length - 1].lastSeen : req.query.since?.toString() || null;
    res.json({ issues, cursor });
  })
);

itProtocolRouter.post(
  '/commands',
  validateBody(z.object({ command: z.string(), args: z.record(z.any()).optional().default({}) })),
  asyncHandler(async (req, res) => {
    const { command, args } = req.body;
    if (command === 'ping') {
      return res.json({ ok: true, result: { version: currentRelease() } });
    }
    if (command === 'revalidate') {
      // Servio Hub has no server-side page cache to clear right now --
      // acknowledged as a no-op rather than rejected, so BDT's "Refresh
      // cache" button doesn't show an error for something that isn't
      // actually broken.
      return res.json({ ok: true, result: { note: 'No server-side cache to clear.' } });
    }
    if (command === 'maintenance') {
      const on = Boolean(args?.on);
      const message = typeof args?.message === 'string' ? args.message.slice(0, 300) : null;
      await setSetting('it_maintenance_enabled', on);
      await setSetting('it_maintenance_message', message);
      return res.json({ ok: true, result: { on, message } });
    }
    res.status(400).json({ error: `Unknown command "${command}".` });
  })
);

itProtocolRouter.post(
  '/disconnect',
  asyncHandler(async (req, res) => {
    await clearBdtLink();
    invalidateBdtLinkCache();
    res.json({ ok: true });
  })
);

export default itAdminRouter;
