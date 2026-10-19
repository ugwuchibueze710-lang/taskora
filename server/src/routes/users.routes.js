// Public-safe read of someone else's profile for the new profile "wall"
// page (client: /u/:id). Deliberately a separate, narrow SELECT -- never
// just reusing requireAuth's loadAppUser or the admin user-detail query --
// so a field added to this app's internal user model later (email,
// location, admin_level, etc.) doesn't silently leak to every other user
// just because it exists on the users/profiles tables. Still behind
// requireAuth like every other route in this app (the whole client is
// wrapped in RequireAuth -- there is no logged-out browsing state to design
// for), it's just not scoped to req.user.id the way /api/profile is.
import { Router } from 'express';
import { query } from '../lib/db.js';
import { asyncHandler, notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT u.id, u.first_name, u.last_name, u.created_at,
              p.avatar_url, p.cover_url, p.bio, p.headline, p.education,
              pr.id AS provider_id, pr.status AS provider_status
         FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id
         LEFT JOIN providers pr ON pr.user_id = u.id
        WHERE u.id = $1 AND u.status = 'active'`,
      [req.params.id]
    );
    const user = rows[0];
    if (!user) throw notFound('User not found.');
    res.json({ user });
  })
);

export default router;
