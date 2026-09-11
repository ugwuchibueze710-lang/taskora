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
import { isAgencyEnabled, setSetting } from '../services/settings.service.js';
import { logAdminAction } from '../services/audit.service.js';
import { query } from '../lib/db.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// The master switch (see settings.service.js) -- GET reads current state,
// POST flips it. Any admin can flip it, same as every other admin action.
router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    res.json({ enabled: await isAgencyEnabled() });
  })
);

router.post(
  '/settings',
  validateBody(z.object({ enabled: z.boolean() })),
  asyncHandler(async (req, res) => {
    await setSetting('agency_enabled', req.body.enabled, req.user.id);
    await logAdminAction({
      adminUserId: req.user.id,
      actionType: req.body.enabled ? 'agency_enabled' : 'agency_disabled',
    });
    res.json({ enabled: req.body.enabled });
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
