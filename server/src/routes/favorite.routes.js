import { Router } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, badRequest } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT p.*, u.first_name, u.last_name, f.created_at AS favorited_at
         FROM favorites f
         JOIN providers p ON p.id = f.provider_id
         JOIN users u ON u.id = p.user_id
        WHERE f.user_id = $1
        ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json({ favorites: rows });
  })
);

router.post(
  '/',
  requireAuth,
  validateBody(z.object({ providerId: z.string().uuid() })),
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT user_id FROM providers WHERE id = $1', [req.body.providerId]);
    if (!rows[0]) throw badRequest('Provider not found.');
    if (rows[0].user_id === req.user.id) throw badRequest('You cannot favorite your own provider profile.');
    await query('INSERT INTO favorites (user_id, provider_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
      req.user.id,
      req.body.providerId,
    ]);
    res.status(201).json({ success: true });
  })
);

router.delete(
  '/:providerId',
  requireAuth,
  asyncHandler(async (req, res) => {
    await query('DELETE FROM favorites WHERE user_id = $1 AND provider_id = $2', [req.user.id, req.params.providerId]);
    res.json({ success: true });
  })
);

export default router;
