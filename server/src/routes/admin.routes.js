import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../lib/db.js';
import { asyncHandler, badRequest, notFound, conflict } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { logAdminAction } from '../services/audit.service.js';
import { refundPayment } from '../services/payment.service.js';
import { transitionJob, notifyJobParties } from '../services/job.service.js';
import { notify } from '../services/notification.service.js';
import { computeProviderTier, TIER_LABEL, freeDistributionEndsAt } from '../services/provider-tier.service.js';
import { getCategoryDemandOverview } from '../services/category-demand.service.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// ---- Users ----
router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const q = req.query.q?.toString().trim();
    const params = [];
    let where = '';
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      where = `WHERE lower(first_name || ' ' || last_name || ' ' || email) LIKE $1`;
    }
    const { rows } = await query(
      `SELECT id, first_name, last_name, email, role, status, current_mode, created_at FROM users ${where} ORDER BY created_at DESC LIMIT 200`,
      params
    );
    res.json({ users: rows });
  })
);

router.post(
  '/users/:id/suspend',
  asyncHandler(async (req, res) => {
    await query(`UPDATE users SET status = 'suspended', updated_at = now() WHERE id = $1`, [req.params.id]);
    await logAdminAction({ adminUserId: req.user.id, actionType: 'suspend_user', targetType: 'user', targetId: req.params.id });
    res.json({ success: true });
  })
);

router.post(
  '/users/:id/reactivate',
  asyncHandler(async (req, res) => {
    await query(`UPDATE users SET status = 'active', updated_at = now() WHERE id = $1`, [req.params.id]);
    await logAdminAction({ adminUserId: req.user.id, actionType: 'reactivate_user', targetType: 'user', targetId: req.params.id });
    res.json({ success: true });
  })
);

router.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    await query(`UPDATE users SET status = 'deleted', email = email || '.deleted.' || id, updated_at = now() WHERE id = $1`, [
      req.params.id,
    ]);
    await logAdminAction({ adminUserId: req.user.id, actionType: 'delete_user', targetType: 'user', targetId: req.params.id });
    res.json({ success: true });
  })
);

// ---- Providers ----
router.get(
  '/providers',
  asyncHandler(async (req, res) => {
    const q = req.query.q?.toString().trim();
    const params = [];
    let where = '';
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      where = `WHERE lower(coalesce(business_name,'') || ' ' || coalesce(display_name,'')) LIKE $1`;
    }
    // has_active_pro mirrors the exact EXISTS subquery search.service.js uses
    // for ranking — real, current Stripe-driven subscription state, not just
    // the denormalized is_pro flag — so this view can never show a provider
    // as "priority" when they wouldn't actually rank as one.
    const { rows } = await query(
      `SELECT p.*, u.email, u.first_name, u.last_name,
              EXISTS (
                SELECT 1 FROM subscriptions sub
                 WHERE sub.provider_id = p.id AND sub.status = 'active'
                   AND (sub.current_period_end IS NULL OR sub.current_period_end > now())
              ) AS has_active_pro
         FROM providers p JOIN users u ON u.id = p.user_id ${where} ORDER BY p.created_at DESC LIMIT 200`,
      params
    );
    const providers = rows.map((p) => {
      const tier = computeProviderTier(p);
      return { ...p, tier: TIER_LABEL[tier], freeDistributionEndsAt: freeDistributionEndsAt(p.published_at) };
    });
    res.json({ providers });
  })
);

router.post(
  '/providers/:id/verify',
  asyncHandler(async (req, res) => {
    await query('UPDATE providers SET verified = true, updated_at = now() WHERE id = $1', [req.params.id]);
    await logAdminAction({ adminUserId: req.user.id, actionType: 'verify_provider', targetType: 'provider', targetId: req.params.id });
    res.json({ success: true });
  })
);

router.post(
  '/providers/:id/suspend',
  asyncHandler(async (req, res) => {
    await query("UPDATE providers SET status = 'suspended', updated_at = now() WHERE id = $1", [req.params.id]);
    await logAdminAction({ adminUserId: req.user.id, actionType: 'suspend_provider', targetType: 'provider', targetId: req.params.id });
    res.json({ success: true });
  })
);

router.post(
  '/providers/:id/reactivate',
  asyncHandler(async (req, res) => {
    await query("UPDATE providers SET status = 'active', updated_at = now() WHERE id = $1", [req.params.id]);
    await logAdminAction({ adminUserId: req.user.id, actionType: 'reactivate_provider', targetType: 'provider', targetId: req.params.id });
    res.json({ success: true });
  })
);

// ---- Categories ----
router.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM categories ORDER BY sort_order, name');
    res.json({ categories: rows });
  })
);

router.post(
  '/categories',
  validateBody(z.object({ name: z.string().trim().min(1).max(120), icon: z.string().max(20).optional(), sortOrder: z.number().int().optional() })),
  asyncHandler(async (req, res) => {
    const { name, icon, sortOrder } = req.body;
    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const { rows } = await query(
      `INSERT INTO categories (slug, name, icon, sort_order) VALUES ($1, $2, $3, COALESCE($4, 0)) RETURNING *`,
      [slug, name, icon || '🛠️', sortOrder]
    );
    res.status(201).json({ category: rows[0] });
  })
);

router.patch(
  '/categories/:id',
  validateBody(
    z.object({
      name: z.string().max(120).optional(),
      icon: z.string().max(20).optional(),
      sortOrder: z.number().int().optional(),
      isActive: z.boolean().optional(),
      description: z.string().max(500).nullable().optional(),
      imageUrl: z.string().max(2000).nullable().optional(),
      keywords: z.array(z.string().max(60)).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const { name, icon, sortOrder, isActive, description, imageUrl, keywords } = req.body;
    const { rows } = await query(
      `UPDATE categories SET
         name = COALESCE($1, name),
         icon = COALESCE($2, icon),
         sort_order = COALESCE($3, sort_order),
         is_active = COALESCE($4, is_active),
         description = COALESCE($5, description),
         image_url = COALESCE($6, image_url),
         keywords = COALESCE($7, keywords)
       WHERE id = $8 RETURNING *`,
      [name, icon, sortOrder, isActive, description, imageUrl, keywords, req.params.id]
    );
    if (!rows[0]) throw notFound('Category not found.');
    res.json({ category: rows[0] });
  })
);

router.post(
  '/categories/reorder',
  validateBody(z.object({ order: z.array(z.object({ id: z.number().int(), sortOrder: z.number().int() })) })),
  asyncHandler(async (req, res) => {
    await withTransaction(async (client) => {
      for (const item of req.body.order) {
        await client.query('UPDATE categories SET sort_order = $1 WHERE id = $2', [item.sortOrder, item.id]);
      }
    });
    res.json({ success: true });
  })
);

// ---- Services ----
router.post(
  '/services',
  validateBody(z.object({ categoryId: z.number().int(), name: z.string().trim().min(1).max(160) })),
  asyncHandler(async (req, res) => {
    const { categoryId, name } = req.body;
    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const { rows } = await query(
      `INSERT INTO services (category_id, name, slug) VALUES ($1, $2, $3) RETURNING *`,
      [categoryId, name, slug]
    );
    res.status(201).json({ service: rows[0] });
  })
);

router.patch(
  '/services/:id',
  validateBody(z.object({ name: z.string().max(160).optional(), isActive: z.boolean().optional() })),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `UPDATE services SET name = COALESCE($1, name), is_active = COALESCE($2, is_active) WHERE id = $3 RETURNING *`,
      [req.body.name, req.body.isActive, req.params.id]
    );
    if (!rows[0]) throw notFound('Service not found.');
    res.json({ service: rows[0] });
  })
);

// ---- Jobs ----
router.get(
  '/jobs',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT j.*, cu.email AS customer_email, COALESCE(NULLIF(pr.business_name, ''), pr.display_name) AS provider_name
         FROM jobs j JOIN users cu ON cu.id = j.customer_id JOIN providers pr ON pr.id = j.provider_id
        ORDER BY j.created_at DESC LIMIT 200`
    );
    res.json({ jobs: rows });
  })
);

// ---- Payments ----
router.get(
  '/payments',
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM payments ORDER BY created_at DESC LIMIT 200');
    res.json({ payments: rows });
  })
);

// ---- Disputes ----
router.get(
  '/disputes',
  asyncHandler(async (req, res) => {
    const status = req.query.status?.toString();
    // A dispute is always tied to one job, which has exactly one customer
    // and one provider -- so "was the reporter acting as the customer or
    // the provider on THIS job" (and the same for who they're reporting) is
    // always derivable from the job itself, never ambiguous, and never both
    // parties being the same role (a customer can never dispute another
    // customer, a provider never another provider -- there's no such thing
    // as a job with two customers or two providers to report). This is why
    // dispute.routes.js's `isCustomer ? job.provider_user_id : job.customer_id`
    // was already correct; this view just surfaces that context to admins.
    const { rows } = await query(
      `SELECT d.*,
              j.customer_id AS job_customer_id, j.service_description, j.status AS job_status,
              ru.first_name AS reporter_first_name, ru.last_name AS reporter_last_name, ru.email AS reporter_email,
              CASE WHEN d.raised_by_user_id = j.customer_id THEN 'customer' ELSE 'provider' END AS reporter_role,
              au.first_name AS reportee_first_name, au.last_name AS reportee_last_name, au.email AS reportee_email,
              CASE WHEN d.against_user_id = j.customer_id THEN 'customer'
                   WHEN d.against_user_id IS NOT NULL THEN 'provider'
                   ELSE NULL END AS reportee_role
         FROM disputes d
         JOIN jobs j ON j.id = d.job_id
         JOIN users ru ON ru.id = d.raised_by_user_id
         LEFT JOIN users au ON au.id = d.against_user_id
        ${status ? 'WHERE d.status = $1' : ''}
        ORDER BY d.created_at DESC`,
      status ? [status] : []
    );
    res.json({ disputes: rows });
  })
);

const resolutionSchema = z.object({
  resolution: z.enum(['resolved_refund', 'resolved_no_refund', 'resolved_other']),
  notes: z.string().max(2000).optional(),
});

router.post(
  '/disputes/:id/resolve',
  validateBody(resolutionSchema),
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM disputes WHERE id = $1', [req.params.id]);
    const dispute = rows[0];
    if (!dispute) throw notFound('Dispute not found.');
    if (dispute.status.startsWith('resolved') || dispute.status === 'closed') throw conflict('This dispute is already resolved.');

    const { resolution, notes } = req.body;

    // Do the money-moving / job-state side effect FIRST, and only mark the dispute
    // "resolved" if it actually succeeds. If refundPayment throws (Stripe error,
    // network issue), the dispute must stay open rather than being permanently
    // marked resolved_refund for a refund that never happened — see the identical
    // fix applied to job.routes.js's /cancel and /decline handlers.
    if (resolution === 'resolved_refund') {
      await refundPayment(dispute.job_id, 'Dispute resolved with refund');
      await transitionJob(dispute.job_id, 'refunded', { byUserId: req.user.id, reason: notes });
    } else {
      await transitionJob(dispute.job_id, 'completed', { byUserId: req.user.id, reason: 'Dispute resolved, no refund' });
    }

    await query(
      `UPDATE disputes SET status = $1, resolution_notes = $2, resolved_by_admin_id = $3, resolved_at = now() WHERE id = $4`,
      [resolution, notes || null, req.user.id, dispute.id]
    );

    await notify(dispute.raised_by_user_id, {
      type: 'dispute_resolved',
      title: 'Your dispute has been resolved',
      body: notes || `Resolution: ${resolution.replace('resolved_', '')}`,
      data: { jobId: dispute.job_id },
    });
    if (dispute.against_user_id) {
      await notify(dispute.against_user_id, {
        type: 'dispute_resolved',
        title: 'A dispute involving you was resolved',
        body: notes || `Resolution: ${resolution.replace('resolved_', '')}`,
        data: { jobId: dispute.job_id },
      });
    }

    await logAdminAction({ adminUserId: req.user.id, actionType: 'resolve_dispute', targetType: 'dispute', targetId: dispute.id, details: req.body });
    res.json({ success: true });
  })
);

// ---- Reviews (moderation) ----
router.get(
  '/reviews',
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM reviews ORDER BY created_at DESC LIMIT 200');
    res.json({ reviews: rows });
  })
);

router.post(
  '/reviews/:id/hide',
  asyncHandler(async (req, res) => {
    await query('UPDATE reviews SET is_hidden = true WHERE id = $1', [req.params.id]);
    await logAdminAction({ adminUserId: req.user.id, actionType: 'hide_review', targetType: 'review', targetId: req.params.id });
    res.json({ success: true });
  })
);

// ---- Pro / Boost ----
router.get(
  '/subscriptions',
  asyncHandler(async (req, res) => {
    // Extended (not replaced) with the provider's name so this list is
    // actually readable without cross-referencing /admin/providers by id.
    const [pro, boost] = await Promise.all([
      query(
        `SELECT s.*, COALESCE(NULLIF(p.business_name, ''), p.display_name) AS provider_name
           FROM subscriptions s JOIN providers p ON p.id = s.provider_id
          ORDER BY s.created_at DESC LIMIT 200`
      ),
      query(
        `SELECT b.*, COALESCE(NULLIF(p.business_name, ''), p.display_name) AS provider_name
           FROM boosts b JOIN providers p ON p.id = b.provider_id
          ORDER BY b.created_at DESC LIMIT 200`
      ),
    ]);
    res.json({ pro: pro.rows, boost: boost.rows });
  })
);

// ---- Category demand (per-city featured-category system) ----
// Read-only view over category-demand.service.js's real search-event data —
// the same rolling window and source of truth the home page's featured
// section uses, never a separate/duplicated computation.
router.get(
  '/category-demand',
  asyncHandler(async (req, res) => {
    const windowDays = Number(req.query.windowDays) || undefined;
    const cities = await getCategoryDemandOverview(windowDays ? { windowDays } : {});
    res.json({ cities });
  })
);

// ---- Support inbox (general "Contact Taskora" messages -- see
// support.routes.js) -- distinct from Disputes below, which are job-scoped
// reports requiring an active/completed job with a specific provider.
// ----
router.get(
  '/support/threads',
  asyncHandler(async (req, res) => {
    // One row per user who has ever messaged support, with their most recent
    // message and an unread-from-user count, newest activity first -- an
    // inbox list, not a flat message dump.
    const { rows } = await query(
      `SELECT u.id AS user_id, u.first_name, u.last_name, u.email, u.current_mode,
              (SELECT body FROM support_messages sm2 WHERE sm2.user_id = u.id ORDER BY sm2.created_at DESC LIMIT 1) AS last_message,
              (SELECT created_at FROM support_messages sm3 WHERE sm3.user_id = u.id ORDER BY sm3.created_at DESC LIMIT 1) AS last_message_at,
              (SELECT count(*)::int FROM support_messages sm4 WHERE sm4.user_id = u.id AND sm4.sender = 'user' AND sm4.read_at IS NULL) AS unread_count
         FROM users u
        WHERE EXISTS (SELECT 1 FROM support_messages sm WHERE sm.user_id = u.id)
        ORDER BY last_message_at DESC`
    );
    res.json({ threads: rows });
  })
);

router.get(
  '/support/threads/:userId',
  asyncHandler(async (req, res) => {
    const { rows: userRows } = await query('SELECT id, first_name, last_name, email FROM users WHERE id = $1', [req.params.userId]);
    if (!userRows[0]) throw notFound('User not found.');
    const { rows: messages } = await query(
      'SELECT * FROM support_messages WHERE user_id = $1 ORDER BY created_at ASC',
      [req.params.userId]
    );
    res.json({ user: userRows[0], messages });
  })
);

router.post(
  '/support/threads/:userId/reply',
  validateBody(z.object({ body: z.string().trim().min(1).max(3000) })),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `INSERT INTO support_messages (user_id, sender, body) VALUES ($1, 'admin', $2) RETURNING *`,
      [req.params.userId, req.body.body]
    );
    await notify(req.params.userId, {
      type: 'support_reply',
      title: 'Taskora Support replied',
      body: req.body.body.slice(0, 140),
      data: {},
    });
    await logAdminAction({ adminUserId: req.user.id, actionType: 'support_reply', targetType: 'user', targetId: req.params.userId });
    res.status(201).json({ message: rows[0] });
  })
);

// ---- Analytics ----
// Revenue has two genuinely different sources, tracked in two different
// tables (see migration 007's comment for why): job-commission money comes
// straight from `payments` (the real, existing per-job ledger), while
// Pro-monthly / Pro-yearly / Boost income comes from `revenue_events` (a new
// ledger populated by the `invoice.paid` webhook going forward -- it has no
// pre-migration history to backfill from). Both are combined here so the
// admin gets one honest "how much did we actually make" answer, broken out
// by source and, optionally, by day or month.
const REVENUE_UNION_SQL = `
  SELECT created_at AS occurred_at, 'commission' AS source, platform_fee AS amount FROM payments WHERE status = 'succeeded'
  UNION ALL
  SELECT occurred_at, source, amount FROM revenue_events
`;

router.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    const granularity = req.query.granularity === 'month' ? 'month' : 'day';
    const periods = Math.min(Number(req.query.periods) || (granularity === 'month' ? 12 : 30), 366);
    const since = new Date();
    if (granularity === 'month') since.setMonth(since.getMonth() - (periods - 1));
    else since.setDate(since.getDate() - (periods - 1));

    const [users, providers, jobs, completedJobs, activeProviders, searches, lifetimeBySource, seriesRows, gmv] = await Promise.all([
      query('SELECT count(*) FROM users'),
      query('SELECT count(*) FROM providers'),
      query('SELECT count(*) FROM jobs'),
      query("SELECT count(*) FROM jobs WHERE status = 'completed'"),
      query("SELECT count(*) FROM providers WHERE status = 'active'"),
      query('SELECT count(*) FROM search_history'),
      query(`SELECT source, COALESCE(sum(amount), 0) AS amount FROM (${REVENUE_UNION_SQL}) c GROUP BY source`),
      query(
        `SELECT date_trunc($1, occurred_at) AS period, source, COALESCE(sum(amount), 0) AS amount
           FROM (${REVENUE_UNION_SQL}) c
          WHERE occurred_at >= $2
          GROUP BY 1, 2
          ORDER BY 1`,
        [granularity, since]
      ),
      query("SELECT COALESCE(sum(amount_total), 0) AS gmv FROM payments WHERE status = 'succeeded'"),
    ]);

    const bySource = { commission: 0, pro_monthly: 0, pro_yearly: 0, boost: 0 };
    for (const r of lifetimeBySource.rows) bySource[r.source] = Number(r.amount);
    const platformRevenue = bySource.commission; // kept for backward compat with any existing callers

    // Build a dense period map (zero-filled) so a quiet day/month still shows
    // up as $0 rather than silently disappearing from the series.
    const periodMap = new Map();
    const cursor = new Date(since);
    for (let i = 0; i < periods; i++) {
      const key = granularity === 'month' ? cursor.toISOString().slice(0, 7) : cursor.toISOString().slice(0, 10);
      periodMap.set(key, { period: key, commission: 0, pro_monthly: 0, pro_yearly: 0, boost: 0 });
      if (granularity === 'month') cursor.setMonth(cursor.getMonth() + 1);
      else cursor.setDate(cursor.getDate() + 1);
    }
    for (const r of seriesRows.rows) {
      const key = granularity === 'month' ? r.period.toISOString().slice(0, 7) : r.period.toISOString().slice(0, 10);
      const entry = periodMap.get(key);
      if (entry) entry[r.source] = Number(r.amount);
    }
    const revenueSeries = Array.from(periodMap.values()).map((p) => ({
      ...p,
      total: p.commission + p.pro_monthly + p.pro_yearly + p.boost,
    }));

    res.json({
      totalUsers: Number(users.rows[0].count),
      totalProviders: Number(providers.rows[0].count),
      activeProviders: Number(activeProviders.rows[0].count),
      totalJobs: Number(jobs.rows[0].count),
      completedJobs: Number(completedJobs.rows[0].count),
      platformRevenue,
      grossMerchandiseValue: Number(gmv.rows[0].gmv),
      totalSearches: Number(searches.rows[0].count),
      revenueBreakdown: {
        platformCommission: bySource.commission,
        proMonthly: bySource.pro_monthly,
        proYearly: bySource.pro_yearly,
        boost: bySource.boost,
        total: bySource.commission + bySource.pro_monthly + bySource.pro_yearly + bySource.boost,
      },
      revenueSeries,
      granularity,
    });
  })
);

export default router;
