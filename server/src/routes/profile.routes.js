import { Router } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, badRequest } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { uploader, publicUrlFor } from '../middleware/upload.js';

const router = Router();
const avatarUpload = uploader('avatars', { maxSizeMb: 5 });

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.current_mode, u.created_at,
              p.avatar_url, p.location_label, p.location_lat, p.location_lng,
              s.default_approach_message, s.email_notifications, s.push_notifications,
              pr.id AS provider_id, pr.status AS provider_status
         FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id
         LEFT JOIN user_settings s ON s.user_id = u.id
         LEFT JOIN providers pr ON pr.user_id = u.id
        WHERE u.id = $1`,
      [req.user.id]
    );
    res.json({ profile: rows[0] });
  })
);

const updateSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
});

router.patch(
  '/',
  requireAuth,
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const { firstName, lastName } = req.body;
    const { rows } = await query(
      `UPDATE users SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name), updated_at = now()
       WHERE id = $3 RETURNING id, first_name, last_name, email`,
      [firstName, lastName, req.user.id]
    );
    res.json({ user: rows[0] });
  })
);

router.post(
  '/avatar',
  requireAuth,
  avatarUpload.single('avatar'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('No image uploaded.');
    const url = publicUrlFor('avatars', req.file.filename);
    await query(`UPDATE profiles SET avatar_url = $1, updated_at = now() WHERE user_id = $2`, [url, req.user.id]);
    res.json({ avatarUrl: url });
  })
);

router.delete(
  '/avatar',
  requireAuth,
  asyncHandler(async (req, res) => {
    await query(`UPDATE profiles SET avatar_url = NULL, updated_at = now() WHERE user_id = $1`, [req.user.id]);
    res.json({ success: true });
  })
);

const settingsSchema = z.object({
  defaultApproachMessage: z.string().max(1000).nullable().optional(),
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
});

router.patch(
  '/settings',
  requireAuth,
  validateBody(settingsSchema),
  asyncHandler(async (req, res) => {
    const { defaultApproachMessage, emailNotifications, pushNotifications } = req.body;
    const { rows } = await query(
      `UPDATE user_settings SET
         default_approach_message = COALESCE($1, default_approach_message),
         email_notifications = COALESCE($2, email_notifications),
         push_notifications = COALESCE($3, push_notifications),
         updated_at = now()
       WHERE user_id = $4 RETURNING *`,
      [defaultApproachMessage, emailNotifications, pushNotifications, req.user.id]
    );
    res.json({ settings: rows[0] });
  })
);

// ---- Mode switching: exactly two modes, same account ----
router.post(
  '/mode',
  requireAuth,
  validateBody(z.object({ mode: z.enum(['customer', 'provider']) })),
  asyncHandler(async (req, res) => {
    const { mode } = req.body;
    const { rows } = await query(
      `UPDATE users SET current_mode = $1, updated_at = now() WHERE id = $2 RETURNING id, current_mode`,
      [mode, req.user.id]
    );
    res.json({ user: rows[0] });
  })
);

export default router;
