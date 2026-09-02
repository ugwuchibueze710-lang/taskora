import { Router } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, badRequest } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { geocode, reverseGeocode } from '../services/mapbox.service.js';

const router = Router();

router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = req.query.q?.toString() || '';
    const results = await geocode(q, { limit: 6 });
    res.json({ results });
  })
);

// Powers "Use my current location" — the client gets raw coordinates from
// the browser's Geolocation API and asks us to turn them into a label.
router.get(
  '/reverse',
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw badRequest('lat and lng query params are required.');
    }
    const location = await reverseGeocode(lat, lng);
    res.json({ location });
  })
);

router.post(
  '/lock',
  requireAuth,
  validateBody(
    z.object({
      label: z.string().min(1).max(200),
      lat: z.number(),
      lng: z.number(),
      // Comes from the same Mapbox result the client already fetched via
      // /location/search or /location/reverse (see mapbox.service.js's
      // extractCity) — trusted the same way label/lat/lng already are.
      // Optional/nullable: a small share of real geocoding results genuinely
      // have no resolvable city (rural addresses), and per-city demand
      // tracking just skips those rather than inventing a value.
      city: z.string().max(120).nullable().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const { label, lat, lng, city = null } = req.body;
    await query(
      `UPDATE profiles SET location_label = $1, location_lat = $2, location_lng = $3, location_city = $4, updated_at = now() WHERE user_id = $5`,
      [label, lat, lng, city, req.user.id]
    );
    res.json({ location: { label, lat, lng, city } });
  })
);

export default router;
