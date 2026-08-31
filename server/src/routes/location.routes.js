import { Router } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { geocode } from '../services/mapbox.service.js';

const router = Router();

router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = req.query.q?.toString() || '';
    const results = await geocode(q, { limit: 6 });
    res.json({ results });
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
