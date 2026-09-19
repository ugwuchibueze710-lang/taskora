import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler, notFound, badRequest } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import {
  listAgencyItems,
  getAgencyCounts,
  approveAgencyItem,
  rejectAgencyItem,
  dismissAgencyItem,
} from '../services/agency.service.js';
import { diagnoseWithAI } from '../services/error-monitor.service.js';
import { isAgencyEnabled, isAutoScanEnabled, setSetting } from '../services/settings.service.js';
import { runAdminCommand } from '../services/agent-command.service.js';
import { logAdminAction } from '../services/audit.service.js';
import { query } from '../lib/db.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// Two independent switches now (see settings.service.js): "Auto-reply"
// (agency_enabled -- the original key name, kept as-is so no migration is
// needed) answers support messages as they arrive, "Auto-scan" is the
// continuous backlog sweep that catches anything that slipped through
// (Groq hiccup, Agency was briefly off, etc.). GET reads both, POST accepts
// either or both keys so the two dashboard toggles can flip independently
// without one clobbering the other.
router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    res.json({ enabled: await isAgencyEnabled(), autoScanEnabled: await isAutoScanEnabled() });
  })
);

router.post(
  '/settings',
  validateBody(z.object({ enabled: z.boolean().optional(), autoScanEnabled: z.boolean().optional() })),
  asyncHandler(async (req, res) => {
    if (typeof req.body.enabled === 'boolean') {
      await setSetting('agency_enabled', req.body.enabled, req.user.id);
      await logAdminAction({ adminUserId: req.user.id, actionType: req.body.enabled ? 'agency_enabled' : 'agency_disabled' });
    }
    if (typeof req.body.autoScanEnabled === 'boolean') {
      await setSetting('agency_auto_scan_enabled', req.body.autoScanEnabled, req.user.id);
      await logAdminAction({ adminUserId: req.user.id, actionType: req.body.autoScanEnabled ? 'agency_auto_scan_enabled' : 'agency_auto_scan_disabled' });
    }
    res.json({ enabled: await isAgencyEnabled(), autoScanEnabled: await isAutoScanEnabled() });
  })
);

// The admin command box (see agent-command.service.js) -- free text in,
// a plain-language reply out, with anything risky queued as an ordinary
// agency_item rather than applied straight away. `history` lets the client
// keep a short back-and-forth going within one open command panel session
// (e.g. "yes, do it" referring to the previous turn).
router.post(
  '/command',
  validateBody(
    z.object({
      text: z.string().trim().min(1).max(2000),
      history: z
        .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
        .max(20)
        .optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const result = await runAdminCommand({ text: req.body.text, adminUser: req.user, history: req.body.history || [] });
    res.json(result);
  })
);

router.get(
  '/items',
  asyncHandler(async (req, res) => {
    const items = await listAgencyItems({
      status: req.query.status?.toString(),
      kind: req.query.kind?.toString(),
    });
    res.json({ items });
  })
);

router.get(
  '/counts',
  asyncHandler(async (req, res) => {
    res.json(await getAgencyCounts());
  })
);

router.post(
  '/items/:id/approve',
  asyncHandler(async (req, res) => {
    const item = await approveAgencyItem(req.params.id, req.user.id);
    res.json({ item });
  })
);

router.post(
  '/items/:id/reject',
  asyncHandler(async (req, res) => {
    const item = await rejectAgencyItem(req.params.id, req.user.id);
    res.json({ item });
  })
);

router.post(
  '/items/:id/dismiss',
  asyncHandler(async (req, res) => {
    const item = await dismissAgencyItem(req.params.id, req.user.id);
    res.json({ item });
  })
);

// On-demand only (see error-monitor.service.js) -- an admin explicitly
// asking for AI to look deeper at one specific captured error.
router.post(
  '/items/:id/diagnose',
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM agency_items WHERE id = $1', [req.params.id]);
    const item = rows[0];
    if (!item) throw notFound('Agency item not found.');
    if (item.kind !== 'error_diagnosis') throw badRequest('AI diagnosis is only available for error items.');
    const result = await diagnoseWithAI(item);
    res.json(result);
  })
);

export default router;
