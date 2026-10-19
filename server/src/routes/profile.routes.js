import { Router } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, badRequest } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { uploader, uploadToStorage } from '../middleware/upload.js';

const router = Router();
const avatarUpload = uploader('avatars', { maxSizeMb: 5 });
const coverUpload = uploader('covers', { maxSizeMb: 8 });

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.current_mode, u.created_at,
              p.avatar_url, p.cover_url, p.bio, p.headline, p.education,
              p.location_label, p.location_lat, p.location_lng,
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

// One entry of the (optional, repeatable) Education section. `school` is
// the only thing that actually identifies an entry -- the client filters
// out any entry typed in and then abandoned without a school name before
// ever sending this, but the server re-checks, since this body is
// untrusted input like any other.
const educationEntrySchema = z.object({
  school: z.string().trim().min(1).max(160),
  degree: z.string().trim().max(160).optional().default(''),
  field: z.string().trim().max(160).optional().default(''),
  startYear: z.string().trim().max(4).optional().default(''),
  endYear: z.string().trim().max(4).optional().default(''),
});

const updateSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  // Empty string is a deliberate "clear the bio" -- distinct from omitting
  // the field entirely (COALESCE below leaves it untouched either way,
  // since both still pass this schema as a defined string); the client
  // always sends the full current text on save, never a partial patch, so
  // there is no real ambiguity in practice.
  bio: z.string().trim().max(500, 'Bio must be 500 characters or fewer.').optional(),
  // Same "empty string clears it" shape as bio, for the one-line role/
  // tagline shown under the name (e.g. "Full-stack developer, Louisville").
  headline: z.string().trim().max(160, 'Headline must be 160 characters or fewer.').optional(),
  education: z.array(educationEntrySchema).max(10, 'Up to 10 education entries.').optional(),
});

router.patch(
  '/',
  requireAuth,
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const { firstName, lastName, bio, headline, education } = req.body;
    const { rows } = await query(
      `UPDATE users SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name), updated_at = now()
       WHERE id = $3 RETURNING id, first_name, last_name, email`,
      [firstName, lastName, req.user.id]
    );
    if (bio !== undefined) {
      await query(`UPDATE profiles SET bio = $1, updated_at = now() WHERE user_id = $2`, [bio || null, req.user.id]);
    }
    if (headline !== undefined) {
      await query(`UPDATE profiles SET headline = $1, updated_at = now() WHERE user_id = $2`, [headline || null, req.user.id]);
    }
    if (education !== undefined) {
      await query(`UPDATE profiles SET education = $1::jsonb, updated_at = now() WHERE user_id = $2`, [
        JSON.stringify(education),
        req.user.id,
      ]);
    }
    res.json({ user: rows[0] });
  })
);

router.post(
  '/avatar',
  requireAuth,
  avatarUpload.single('avatar'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('No image uploaded.');
    const url = await uploadToStorage('avatars', req.file);
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

// ---- Cover photo (the banner above the avatar on the profile wall) ----
// Mirrors the avatar upload/remove pair exactly -- same multer setup, same
// Supabase Storage bucket (just a different subfolder), same shape of
// response -- so AvatarUploader's sibling component on the client can reuse
// the same upload-then-animate pattern instead of inventing a new one.
router.post(
  '/cover',
  requireAuth,
  coverUpload.single('cover'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('No image uploaded.');
    const url = await uploadToStorage('covers', req.file);
    await query(`UPDATE profiles SET cover_url = $1, updated_at = now() WHERE user_id = $2`, [url, req.user.id]);
    res.json({ coverUrl: url });
  })
);

router.delete(
  '/cover',
  requireAuth,
  asyncHandler(async (req, res) => {
    await query(`UPDATE profiles SET cover_url = NULL, updated_at = now() WHERE user_id = $1`, [req.user.id]);
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
