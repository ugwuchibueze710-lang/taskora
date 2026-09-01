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
    const { rows } = await query(
      `SELECT p.*, u.email, u.first_name, u.last_name FROM providers p JOIN users u ON u.id = p.user_id ${where} ORDER BY p.created_at DESC LIMIT 200`,
      params
    );
    res.json({ providers: rows });
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
      `SELECT j.*, cu.email AS customer_email, COALESCE(pr.business_name, pr.display_name) AS provider_name
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
    const { rows } = await query(
      status ? 'SELECT * FROM disputes WHERE status = $1 ORDER BY created_at DESC' : 'SELECT * FROM disputes ORDER BY created_at DESC',
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
    await query(
      `UPDATE disputes SET status = $1, resolution_notes = $2, resolved_by_admin_id = $3, resolved_at = now() WHERE id = $4`,
      [resolution, notes || null, req.user.id, dispute.id]
    );

    if (resolution === 'resolved_refund') {
      await refundPayment(dispute.job_id, 'Dispute resolved with refund');
      await transitionJob(dispute.job_id, 'refunded', { byUserId: req.user.id, reason: notes });
    } else {
      await transitionJob(dispute.job_id, 'completed', { byUserId: req.user.id, reason: 'Dispute resolved, no refund' });
    }

    await notify(dispute.raised_by_user_id, {
      type: 'dispute_resolved',
      title: 'Your dispute has been resolved',
      body: notes || `Resolution: ${resolution.replace('resolved_', '')}`,
    });
    if (dispute.against_user_id) {
      await notify(dispute.against_user_id, {
        type: 'dispute_resolved',
        title: 'A dispute involving you was resolved',
        body: notes || `Resolution: ${resolution.replace('resolved_', '')}`,
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
    const [pro, boost] = await Promise.all([
      query('SELECT * FROM subscriptions ORDER BY created_at DESC LIMIT 200'),
      query('SELECT * FROM boosts ORDER BY created_at DESC LIMIT 200'),
    ]);
    res.json({ pro: pro.rows, boost: boost.rows });
  })
);

// ---- Analytics ----
router.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    const [users, providers, jobs, completedJobs, revenue, activeProviders, searches] = await Promise.all([
      query('SELECT count(*) FROM users'),
      query('SELECT count(*) FROM providers'),
      query('SELECT count(*) FROM jobs'),
      query("SELECT count(*) FROM jobs WHERE status = 'completed'"),
      query("SELECT COALESCE(sum(platform_fee), 0) AS platform_revenue, COALESCE(sum(amount_total), 0) AS gmv FROM payments WHERE status = 'succeeded'"),
      query("SELECT count(*) FROM providers WHERE status = 'active'"),
      query('SELECT count(*) FROM search_history'),
    ]);
    res.json({
      totalUsers: Number(users.rows[0].count),
      totalProviders: Number(providers.rows[0].count),
      activeProviders: Number(activeProviders.rows[0].count),
      totalJobs: Number(jobs.rows[0].count),
      completedJobs: Number(completedJobs.rows[0].count),
      platformRevenue: Number(revenue.rows[0].platform_revenue),
      grossMerchandiseValue: Number(revenue.rows[0].gmv),
      totalSearches: Number(searches.rows[0].count),
    });
  })
);

export default router;
