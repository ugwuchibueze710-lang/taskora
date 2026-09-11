import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../lib/db.js';
import { asyncHandler, badRequest } from '../lib/errors.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

const router = Router();

// ---- One-time, unauthenticated platform reset ----
// Deliberately NOT mounted under /api/admin (requireAuth/requireAdmin would
// be a chicken-and-egg problem the instant every admin account is wiped)
// and deliberately NOT a database migration (migrate.js auto-runs every
// unapplied migration on every deploy, with no distinct moment where a
// human actually chose to pull the trigger -- see db/migrate.js). Instead
// this sits behind a literal confirmation phrase that must be sent in the
// request body; nothing in the app's own UI ever calls it, so it only ever
// fires when someone deliberately visits/POSTs to this exact URL on
// purpose. Meant to be triggered once, then removed.
//
// Wipes every account and everything tied to one -- providers, jobs,
// messages, payments, reviews, support threads, disputes, subscriptions,
// audit history, everything -- via a single `TRUNCATE users CASCADE`. Every
// table in 001_init.sql that references users.id (directly, or transitively
// through providers.id) hangs off that one truncate; Postgres's CASCADE
// truncates every referencing table regardless of whether its own FK says
// ON DELETE CASCADE or ON DELETE SET NULL (it can't partially null a row
// mid-truncate, so it truncates the whole table instead), which is exactly
// the full reset being asked for here. The service catalog (categories,
// services, category_groups) and anonymous per-city search-demand stats
// (category_search_events, keyed by category + city, never by a user) are
// deliberately untouched -- that's product configuration and analytics, not
// an account.
//
// Ends by forging exactly one fresh admin: the Supabase Auth identity first
// (via the admin SDK -- the same createUser() pattern server/db/seed.js and
// POST /api/admin/migrate-users-to-supabase already use for real, working
// logins), then the matching `users` row linked to it directly by the id
// Supabase just assigned. The generated password is returned exactly once,
// in this response, and never logged or stored anywhere in plaintext.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const CONFIRM_PHRASE = 'WIPE-TASKORA-EVERYTHING';
    if (req.body?.confirm !== CONFIRM_PHRASE) {
      throw badRequest(
        `Send { "confirm": "${CONFIRM_PHRASE}" } as the JSON body of a POST to this URL to proceed. This permanently deletes every account and cannot be undone.`
      );
    }

    // 1. Delete every Supabase Auth identity first (paginated -- a real user
    //    base can span more than one page of the admin list).
    let page = 1;
    let deletedAuthUsers = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      if (!data.users.length) break;
      for (const u of data.users) {
        const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(u.id);
        if (!delErr) deletedAuthUsers++;
      }
      if (data.users.length < 1000) break;
      page++;
    }

    // 2. Wipe every app-side account and everything tied to one.
    await query('TRUNCATE TABLE users CASCADE');

    // 3. Forge exactly one fresh admin. Supabase assigns the identity's id,
    //    so create that first and link the app row to it directly -- no
    //    need for the email-match bootstrap dance /auth/bootstrap normally
    //    does, since there's no ambiguity about which row this is.
    const adminEmail = (req.body.adminEmail || 'admin@taskora.com').toLowerCase().trim();
    const adminPassword = req.body.adminPassword || crypto.randomBytes(15).toString('base64url');

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
    });
    if (createErr) throw createErr;

    const { rows } = await query(
      `INSERT INTO users (first_name, last_name, email, role, status, supabase_user_id)
       VALUES ('Taskora', 'Admin', $1, 'admin', 'active', $2)
       RETURNING id`,
      [adminEmail, created.user.id]
    );
    const adminUserId = rows[0].id;
    await query('INSERT INTO profiles (user_id) VALUES ($1)', [adminUserId]);
    await query(
      `INSERT INTO user_settings (user_id, default_approach_message) VALUES ($1, $2)`,
      [adminUserId, "Hi, I'm interested in your services and would like to discuss a project with you."]
    );

    console.log(
      `Platform reset complete: deleted ${deletedAuthUsers} Supabase Auth user(s), truncated all app data, created new admin ${adminEmail}.`
    );

    res.json({
      success: true,
      deletedAuthUsers,
      admin: { email: adminEmail, password: adminPassword },
      note: 'Save this password now -- it is shown exactly once and never logged anywhere. Log in at /login with these credentials.',
    });
  })
);

export default router;
