import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../lib/db.js';
import { asyncHandler, badRequest, notFound, forbidden } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import { requireAuth, requireProvider } from '../middleware/auth.js';
import { uploader, publicUrlFor } from '../middleware/upload.js';
import { ensureProviderRecord, recomputeCompleteness } from '../services/provider.service.js';
import { distanceMiles } from '../services/mapbox.service.js';

const router = Router();
const providerImageUpload = uploader('providers', { maxSizeMb: 6 });
const portfolioUpload = uploader('portfolio', { maxSizeMb: 8 });

// ---- Start / continue onboarding ----
router.post(
  '/setup',
  requireAuth,
  asyncHandler(async (req, res) => {
    const providerId = await ensureProviderRecord(req.user.id);
    await query('INSERT INTO provider_service_areas (provider_id) VALUES ($1) ON CONFLICT DO NOTHING', [providerId]);
    const { rows } = await query('SELECT * FROM providers WHERE id = $1', [providerId]);
    res.status(201).json({ provider: rows[0] });
  })
);

// ---- Full self view for the provider dashboard ----
router.get(
  '/me',
  requireAuth,
  requireProvider,
  asyncHandler(async (req, res) => {
    const providerId = req.user.provider_id;
    const [provider, categories, services, photos, availability, area, stripeAccount] = await Promise.all([
      query('SELECT * FROM providers WHERE id = $1', [providerId]),
      query(
        `SELECT c.id, c.name, c.slug FROM provider_categories pc JOIN categories c ON c.id = pc.category_id WHERE pc.provider_id = $1`,
        [providerId]
      ),
      query(
        `SELECT s.id, s.name, s.category_id, s.is_custom FROM provider_services ps JOIN services s ON s.id = ps.service_id WHERE ps.provider_id = $1`,
        [providerId]
      ),
      query('SELECT * FROM provider_photos WHERE provider_id = $1 ORDER BY sort_order, created_at', [providerId]),
      query('SELECT * FROM provider_availability WHERE provider_id = $1 ORDER BY day_of_week, start_time', [providerId]),
      query('SELECT * FROM provider_service_areas WHERE provider_id = $1', [providerId]),
      query('SELECT stripe_account_id, charges_enabled, payouts_enabled, details_submitted FROM provider_stripe_accounts WHERE provider_id = $1', [providerId]),
    ]);
    if (!provider.rows[0]) throw notFound('Provider profile not found.');
    res.json({
      provider: provider.rows[0],
      categories: categories.rows,
      services: services.rows,
      photos: photos.rows,
      availability: availability.rows,
      serviceArea: area.rows[0] || null,
      stripeAccount: stripeAccount.rows[0] || null,
    });
  })
);

const businessInfoSchema = z.object({
  businessName: z.string().max(160).nullable().optional(),
  displayName: z.string().max(160).nullable().optional(),
  description: z.string().max(3000).nullable().optional(),
  businessPhone: z.string().max(40).nullable().optional(),
  pricingMode: z.enum(['hidden', 'fixed', 'starting', 'hourly']).optional(),
  priceAmount: z.number().positive().nullable().optional(),
  autoReplyEnabled: z.boolean().optional(),
  autoReplyMessage: z.string().max(1000).nullable().optional(),
});

router.patch(
  '/me',
  requireAuth,
  requireProvider,
  validateBody(businessInfoSchema),
  asyncHandler(async (req, res) => {
    const { businessName, displayName, description, businessPhone, pricingMode, priceAmount, autoReplyEnabled, autoReplyMessage } = req.body;
    // COALESCE($n, column) below means "null in the request = leave this field
    // alone" -- it does NOT mean "empty string leaves it alone". A client that
    // submits '' (e.g. the onboarding wizard's "Business info (optional)" step,
    // left blank) would otherwise get business_name = '' written literally,
    // which is NOT NULL and so breaks every downstream
    // `COALESCE(business_name, display_name)` fallback -- the provider's name
    // renders blank everywhere (messages list, jobs list, admin views) instead
    // of falling back to their display name. Treat a blank string the same as
    // "not provided" for every optional text field here.
    const blankToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);
    const businessNameN = blankToNull(businessName);
    const displayNameN = blankToNull(displayName);
    const descriptionN = blankToNull(description);
    const businessPhoneN = blankToNull(businessPhone);
    const autoReplyMessageN = blankToNull(autoReplyMessage);
    const { rows } = await query(
      `UPDATE providers SET
         business_name = COALESCE($1, business_name),
         display_name = COALESCE($2, display_name),
         description = COALESCE($3, description),
         business_phone = COALESCE($4, business_phone),
         pricing_mode = COALESCE($5, pricing_mode),
         price_amount = CASE WHEN $5 = 'hidden' THEN NULL ELSE COALESCE($6, price_amount) END,
         auto_reply_enabled = COALESCE($7, auto_reply_enabled),
         auto_reply_message = COALESCE($8, auto_reply_message),
         updated_at = now()
       WHERE id = $9 RETURNING *`,
      [businessNameN, displayNameN, descriptionN, businessPhoneN, pricingMode, priceAmount, autoReplyEnabled, autoReplyMessageN, req.user.provider_id]
    );
    await recomputeCompleteness(req.user.provider_id);
    res.json({ provider: rows[0] });
  })
);

// ---- Categories ----
router.put(
  '/me/categories',
  requireAuth,
  requireProvider,
  validateBody(z.object({ categoryIds: z.array(z.number().int()).min(1, 'Choose at least one category.') })),
  asyncHandler(async (req, res) => {
    const providerId = req.user.provider_id;
    await withTransaction(async (client) => {
      await client.query('DELETE FROM provider_categories WHERE provider_id = $1', [providerId]);
      for (const categoryId of req.body.categoryIds) {
        await client.query(
          'INSERT INTO provider_categories (provider_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [providerId, categoryId]
        );
      }
    });
    await recomputeCompleteness(providerId);
    res.json({ success: true });
  })
);

// ---- Services (including custom) ----
router.put(
  '/me/services',
  requireAuth,
  requireProvider,
  validateBody(z.object({ serviceIds: z.array(z.number().int()).default([]) })),
  asyncHandler(async (req, res) => {
    const providerId = req.user.provider_id;
    await withTransaction(async (client) => {
      await client.query('DELETE FROM provider_services WHERE provider_id = $1', [providerId]);
      for (const serviceId of req.body.serviceIds) {
        await client.query(
          'INSERT INTO provider_services (provider_id, service_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [providerId, serviceId]
        );
      }
    });
    await recomputeCompleteness(providerId);
    res.json({ success: true });
  })
);

router.post(
  '/me/services/custom',
  requireAuth,
  requireProvider,
  validateBody(z.object({ categoryId: z.number().int(), name: z.string().trim().min(1).max(160) })),
  asyncHandler(async (req, res) => {
    const { categoryId, name } = req.body;
    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `custom-${Date.now()}`;
    const { rows } = await query(
      `INSERT INTO services (category_id, name, slug, is_custom, created_by_user_id)
       VALUES ($1, $2, $3, true, $4)
       ON CONFLICT (category_id, slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [categoryId, name, slug, req.user.id]
    );
    const service = rows[0];
    await query(
      'INSERT INTO provider_services (provider_id, service_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.provider_id, service.id]
    );
    res.status(201).json({ service });
  })
);

// ---- Provider image (existing avatar / logo upload / custom upload) ----
router.post(
  '/me/image',
  requireAuth,
  requireProvider,
  providerImageUpload.single('image'),
  asyncHandler(async (req, res) => {
    let imageUrl, source;
    if (req.file) {
      imageUrl = publicUrlFor('providers', req.file.filename);
      source = req.body.source === 'logo' ? 'logo' : 'custom';
    } else if (req.body.useProfilePicture === 'true' || req.body.useProfilePicture === true) {
      const { rows } = await query('SELECT avatar_url FROM profiles WHERE user_id = $1', [req.user.id]);
      if (!rows[0]?.avatar_url) throw badRequest('You do not have a profile picture to use.');
      imageUrl = rows[0].avatar_url;
      source = 'profile';
    } else {
      throw badRequest('Provide an image file or set useProfilePicture=true.');
    }
    await query('UPDATE providers SET image_url = $1, image_source = $2, updated_at = now() WHERE id = $3', [
      imageUrl,
      source,
      req.user.provider_id,
    ]);
    await recomputeCompleteness(req.user.provider_id);
    res.json({ imageUrl, source });
  })
);

// ---- Portfolio photos ----
router.post(
  '/me/photos',
  requireAuth,
  requireProvider,
  portfolioUpload.array('photos', 10),
  asyncHandler(async (req, res) => {
    if (!req.files?.length) throw badRequest('No photos uploaded.');
    const inserted = [];
    for (const [i, file] of req.files.entries()) {
      const url = publicUrlFor('portfolio', file.filename);
      const { rows } = await query(
        'INSERT INTO provider_photos (provider_id, url, sort_order) VALUES ($1, $2, $3) RETURNING *',
        [req.user.provider_id, url, i]
      );
      inserted.push(rows[0]);
    }
    await recomputeCompleteness(req.user.provider_id);
    res.status(201).json({ photos: inserted });
  })
);

router.delete(
  '/me/photos/:id',
  requireAuth,
  requireProvider,
  asyncHandler(async (req, res) => {
    const { rowCount } = await query('DELETE FROM provider_photos WHERE id = $1 AND provider_id = $2', [
      req.params.id,
      req.user.provider_id,
    ]);
    if (!rowCount) throw notFound('Photo not found.');
    res.json({ success: true });
  })
);

// ---- Availability ----
const availabilitySchema = z.object({
  mode: z.enum(['always', 'custom']),
  slots: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
      })
    )
    .default([]),
});

router.put(
  '/me/availability',
  requireAuth,
  requireProvider,
  validateBody(availabilitySchema),
  asyncHandler(async (req, res) => {
    const providerId = req.user.provider_id;
    const { mode, slots } = req.body;
    await withTransaction(async (client) => {
      await client.query('UPDATE providers SET availability_mode = $1, updated_at = now() WHERE id = $2', [mode, providerId]);
      await client.query('DELETE FROM provider_availability WHERE provider_id = $1', [providerId]);
      if (mode === 'custom') {
        for (const slot of slots) {
          await client.query(
            'INSERT INTO provider_availability (provider_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4)',
            [providerId, slot.dayOfWeek, slot.startTime, slot.endTime]
          );
        }
      }
    });
    await recomputeCompleteness(providerId);
    res.json({ success: true });
  })
);

// ---- Service area / base location ----
router.put(
  '/me/service-area',
  requireAuth,
  requireProvider,
  validateBody(
    z.object({
      radiusMiles: z.number().int().positive().max(500),
      label: z.string().max(200).optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const providerId = req.user.provider_id;
    const { radiusMiles, label, lat, lng } = req.body;
    const isCustom = ![5, 10, 25].includes(radiusMiles);
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO provider_service_areas (provider_id, radius_miles, is_custom, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (provider_id) DO UPDATE SET radius_miles = $2, is_custom = $3, updated_at = now()`,
        [providerId, radiusMiles, isCustom]
      );
      await client.query(
        `UPDATE providers SET service_radius_miles = $1,
           base_location_label = COALESCE($2, base_location_label),
           base_lat = COALESCE($3, base_lat),
           base_lng = COALESCE($4, base_lng),
           updated_at = now()
         WHERE id = $5`,
        [radiusMiles, label, lat, lng, providerId]
      );
    });
    res.json({ success: true });
  })
);

// ---- Publish ----
router.post(
  '/me/publish',
  requireAuth,
  requireProvider,
  asyncHandler(async (req, res) => {
    const providerId = req.user.provider_id;
    const { rows } = await query('SELECT provider_id FROM provider_categories WHERE provider_id = $1 LIMIT 1', [providerId]);
    if (!rows.length) throw badRequest('Choose at least one category before publishing.');
    const updated = await query(
      `UPDATE providers SET status = 'active', published_at = COALESCE(published_at, now()), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [providerId]
    );
    res.json({ provider: updated.rows[0] });
  })
);

router.post(
  '/me/pause',
  requireAuth,
  requireProvider,
  asyncHandler(async (req, res) => {
    const { rows } = await query(`UPDATE providers SET status = 'paused', updated_at = now() WHERE id = $1 RETURNING *`, [
      req.user.provider_id,
    ]);
    res.json({ provider: rows[0] });
  })
);

// ---- Analytics: profile views ----
router.get(
  '/me/analytics/views',
  requireAuth,
  requireProvider,
  asyncHandler(async (req, res) => {
    const providerId = req.user.provider_id;
    const { rows } = await query(
      `SELECT
         count(*) FILTER (WHERE viewed_on = CURRENT_DATE) AS today,
         count(*) FILTER (WHERE viewed_on >= CURRENT_DATE - INTERVAL '7 days') AS this_week,
         count(*) FILTER (WHERE viewed_on >= date_trunc('month', CURRENT_DATE)) AS this_month
       FROM profile_views WHERE provider_id = $1`,
      [providerId]
    );
    res.json({ views: rows[0] });
  })
);

// ---- Earnings summary ----
router.get(
  '/me/earnings',
  requireAuth,
  requireProvider,
  asyncHandler(async (req, res) => {
    const providerId = req.user.provider_id;
    const [summary, payouts] = await Promise.all([
      query(
        `SELECT
           COALESCE(sum(provider_amount) FILTER (WHERE payout_status = 'holding'), 0) AS pending,
           COALESCE(sum(provider_amount) FILTER (WHERE payout_status = 'released'), 0) AS released,
           COALESCE(sum(platform_fee) FILTER (WHERE status = 'succeeded'), 0) AS fees_paid,
           COALESCE(sum(amount_total) FILTER (WHERE status = 'succeeded'), 0) AS gross
         FROM payments WHERE provider_id = $1`,
        [providerId]
      ),
      query('SELECT * FROM provider_payouts WHERE provider_id = $1 ORDER BY created_at DESC LIMIT 50', [providerId]),
    ]);
    res.json({ summary: summary.rows[0], payouts: payouts.rows });
  })
);

// ---- Public: view a provider's storefront (also records a profile view) ----
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { rows } = await query(
      `SELECT p.*, u.first_name, u.last_name
         FROM providers p JOIN users u ON u.id = p.user_id
        WHERE p.id = $1 AND p.status IN ('active','paused')`,
      [id]
    );
    const provider = rows[0];
    if (!provider) throw notFound('This provider could not be found.');

    const viewerKey = req.session?.userId || req.ip || 'anon';
    await query(
      `INSERT INTO profile_views (provider_id, viewer_user_id, viewer_key)
       VALUES ($1, $2, $3) ON CONFLICT (provider_id, viewer_key, viewed_on) DO NOTHING`,
      [id, req.session?.userId || null, String(viewerKey)]
    );

    const [categories, services, photos, availability, reviews] = await Promise.all([
      query(`SELECT c.id, c.name, c.slug FROM provider_categories pc JOIN categories c ON c.id = pc.category_id WHERE pc.provider_id = $1`, [id]),
      query(`SELECT s.id, s.name FROM provider_services ps JOIN services s ON s.id = ps.service_id WHERE ps.provider_id = $1`, [id]),
      query('SELECT id, url, caption FROM provider_photos WHERE provider_id = $1 ORDER BY sort_order', [id]),
      query('SELECT day_of_week, start_time, end_time FROM provider_availability WHERE provider_id = $1 ORDER BY day_of_week', [id]),
      query(
        `SELECT r.id, r.rating, r.comment, r.created_at, u.first_name, rr.response AS provider_response
           FROM reviews r JOIN users u ON u.id = r.customer_id
           LEFT JOIN review_responses rr ON rr.review_id = r.id
          WHERE r.provider_id = $1 AND r.is_hidden = false
          ORDER BY r.created_at DESC LIMIT 20`,
        [id]
      ),
    ]);

    let distance = null;
    const lat = req.query.lat ? Number(req.query.lat) : null;
    const lng = req.query.lng ? Number(req.query.lng) : null;
    if (lat != null && lng != null) {
      distance = distanceMiles(lat, lng, provider.base_lat, provider.base_lng);
    }

    res.json({
      provider,
      distanceMiles: distance,
      categories: categories.rows,
      services: services.rows,
      photos: photos.rows,
      availability: availability.rows,
      reviews: reviews.rows,
    });
  })
);

export default router;
