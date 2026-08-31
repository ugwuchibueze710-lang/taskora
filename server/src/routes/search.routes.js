import { Router } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import { requireAuth, attachUserIfPresent } from '../middleware/auth.js';
import { searchProviders } from '../services/search.service.js';

const router = Router();

const searchSchema = z.object({
  categoryId: z.number().int().optional(),
  keywords: z.array(z.string()).default([]),
  lat: z.number().optional(),
  lng: z.number().optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  budgetMax: z.number().positive().optional(),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
  rawQuery: z.string().max(300).optional(),
});

router.post(
  '/',
  attachUserIfPresent,
  validateBody(searchSchema),
  asyncHandler(async (req, res) => {
    const { rawQuery, ...filters } = req.body;
    const result = await searchProviders(filters);

    if (req.user && rawQuery) {
      await query(
        `INSERT INTO search_history (user_id, query_text, parsed_filters, result_count) VALUES ($1, $2, $3, $4)`,
        [req.user.id, rawQuery, JSON.stringify(filters), result.total]
      );
    }

    res.json(result);
  })
);

router.get(
  '/history',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, query_text, parsed_filters, result_count, created_at FROM search_history
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 15`,
      [req.user.id]
    );
    res.json({ history: rows });
  })
);

router.delete(
  '/history/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    await query('DELETE FROM search_history WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ success: true });
  })
);

router.delete(
  '/history',
  requireAuth,
  asyncHandler(async (req, res) => {
    await query('DELETE FROM search_history WHERE user_id = $1', [req.user.id]);
    res.json({ success: true });
  })
);

export default router;
