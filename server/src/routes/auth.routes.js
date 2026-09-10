import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../lib/db.js';
import { asyncHandler, unauthorized } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { logAudit } from '../services/audit.service.js';

const router = Router();

const bootstrapSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.').max(80),
  lastName: z.string().trim().min(1, 'Last name is required.').max(80),
});

// Called once, right after a successful supabase.auth.signUp() on the
// client. Supabase Auth now owns the credential entirely (and with email
// confirmation turned off in the project settings, signUp() already returns
// a ready-to-use session) -- this endpoint's only job is to create the
// app-side row (users/profiles/user_settings) the rest of the app has
// always kept per user, keyed by the new Supabase identity instead of a
// password hash.
router.post(
  '/bootstrap',
  validateBody(bootstrapSchema),
  asyncHandler(async (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) throw unauthorized('Missing access token.');
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) throw unauthorized('Invalid or expired session.');
    const supaUser = data.user;

    // Idempotent: a retried bootstrap call (flaky network, a double-click)
    // must not create a second row. If this Supabase identity -- or, for a
    // migrated legacy account linking up for the first time, this email --
    // already has a users row, just return/link it instead of erroring.
    const existing = await query(
      `SELECT id, first_name, last_name, email, role, current_mode, status, created_at, supabase_user_id
         FROM users WHERE supabase_user_id = $1 OR email = $2`,
      [supaUser.id, supaUser.email]
    );
    if (existing.rows.length) {
      const row = existing.rows[0];
      if (!row.supabase_user_id) {
        await query('UPDATE users SET supabase_user_id = $1, updated_at = now() WHERE id = $2', [supaUser.id, row.id]);
      }
      delete row.supabase_user_id;
      return res.status(200).json({ user: row });
    }

    const { firstName, lastName } = req.body;
    const user = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO users (first_name, last_name, email, supabase_user_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, first_name, last_name, email, role, current_mode, status, created_at`,
        [firstName, lastName, supaUser.email, supaUser.id]
      );
      const newUser = rows[0];
      await client.query('INSERT INTO profiles (user_id) VALUES ($1)', [newUser.id]);
      await client.query(
        `INSERT INTO user_settings (user_id, default_approach_message)
         VALUES ($1, $2)`,
        [newUser.id, "Hi, I'm interested in your services and would like to discuss a project with you."]
      );
      return newUser;
    });

    await logAudit({ userId: user.id, eventType: 'signup', req });
    res.status(201).json({ user });
  })
);

router.post('/logout', (req, res) => {
  // Sessions now live entirely client-side (Supabase's own SDK, in the
  // browser's local storage) -- there is no server-side session left to
  // destroy. Kept as a no-op 200 so nothing breaks if any stray client code
  // still calls it during rollout.
  res.json({ success: true });
});

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  })
);

export default router;
