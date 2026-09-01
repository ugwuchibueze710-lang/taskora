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
    })
  ),
  asyncHandler(async (req, res) => {
    const { label, lat, lng } = req.body;
    await query(
      `UPDATE profiles SET location_label = $1, location_lat = $2, location_lng = $3, updated_at = now() WHERE user_id = $4`,
      [label, lat, lng, req.user.id]
    );
    res.json({ location: { label, lat, lng } });
  })
);

export default router;
