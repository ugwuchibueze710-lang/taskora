import { Router } from 'express';
import { query } from '../lib/db.js';
import { asyncHandler } from '../lib/errors.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, slug, name, icon, sort_order FROM categories WHERE is_active = true ORDER BY sort_order, name`
    );
    res.json({ categories: rows });
  })
);

router.get(
  '/:id/services',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, name, slug, is_custom FROM services WHERE category_id = $1 AND is_active = true ORDER BY name`,
      [req.params.id]
    );
    res.json({ services: rows });
  })
);

export default router;
