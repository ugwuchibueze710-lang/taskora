import { query, withTransaction } from '../lib/db.js';
import { unauthorized, forbidden } from '../lib/errors.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

// Every authenticated request now carries a Supabase access token instead of
// a session cookie: `Authorization: Bearer <access_token>`. This verifies
// that token against Supabase (which also confirms it hasn't expired/been
// revoked) and returns the Supabase auth user it belongs to, or null if
// there's no usable token at all -- never throws, so both requireAuth
// (must be logged in) and attachUserIfPresent (fine either way) can share it.
async function resolveSupabaseUser(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

// Loads our own app-side user row (profile, role, provider link -- exactly
// what every route already expects on req.user) keyed by the Supabase
// identity, not by users.id directly. See migration 014 for why these are
// two separate columns instead of one.
async function loadAppUser(supabaseUserId) {
  const { rows } = await query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.admin_level, u.current_mode, u.status, u.created_at,
            p.avatar_url, p.bio, p.location_label, p.location_lat, p.location_lng, p.location_city,
            pr.id AS provider_id, pr.status AS provider_status
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN providers pr ON pr.user_id = u.id
      WHERE u.supabase_user_id = $1`,
    [supabaseUserId]
  );
  return rows[0] || null;
}

// A tiny, hardcoded allowlist of emails that should always be a level-2
// admin, enforced idempotently on every authenticated request rather than
// as a one-time migration UPDATE (migration 018 covers "already has a
// users row at migration time"; this covers "signs up later", or has their
// level changed back some other way) -- so granting this belongs here, in
// code, by explicit request, rather than only in a SQL migration that only
// runs once. Deliberately tiny and hardcoded (not a DB-editable list) --
// this is the one level of admin access that genuinely needs a code change
// to alter, exactly as asked: every other admin-management action (who
// else is admin, who is level 2) goes through the UI from here on.
const SUPER_ADMIN_EMAILS = ['israelhugo636@gmail.com'];

async function ensureSuperAdmin(user) {
  if (!user?.email || !SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase())) return user;
  if (user.role === 'admin' && user.admin_level === 2) return user;
  await query(`UPDATE users SET role = 'admin', admin_level = 2, updated_at = now() WHERE id = $1`, [user.id]);
  return { ...user, role: 'admin', admin_level: 2 };
}

// Creates a fresh app-side row (users/profiles/user_settings) for a Supabase
// identity that authenticated successfully but has no matching `users` row
// -- the same shape auth.routes.js's /bootstrap creates for a brand-new
// signup. This situation is expected, not an error: Supabase Auth and our
// own Postgres database are two separate stores, so an account can keep a
// valid Supabase login (e.g. after our database was reset, as happened in
// October 2026) with nothing left on our side. Rather than rejecting that
// session and leaving the person stuck bouncing back to the login page with
// no explanation, this transparently gives them a brand-new, empty profile
// under the same email/password -- exactly what re-signing-up would
// produce, minus the extra step. None of their old data is recoverable this
// way (it no longer exists anywhere), only their ability to sign back in.
// Deliberately a plain INSERT (no ON CONFLICT email takeover): if the email
// already belongs to a different, unlinked row -- e.g. an admin account
// created outside Supabase -- this throws instead of silently handing that
// identity (and whatever role it has) to whoever just authenticated.
async function createAppUserForSupabaseIdentity(supaUser) {
  const email = supaUser.email;
  const localPart = (email || '').split('@')[0] || 'Member';
  const firstName = localPart.charAt(0).toUpperCase() + localPart.slice(1);
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO users (first_name, last_name, email, supabase_user_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (supabase_user_id) DO NOTHING
       RETURNING id, first_name, last_name, email, role, current_mode, status, created_at`,
      [firstName, '', email, supaUser.id]
    );
    if (!rows.length) {
      // Lost the race against /auth/bootstrap's own insert for this exact
      // identity (see the comment above) -- it already created everything
      // (row, profile, settings, with the name the person actually typed
      // into the signup form), so just read that back instead of erroring.
      const { rows: existing } = await client.query(
        `SELECT id, first_name, last_name, email, role, current_mode, status, created_at
           FROM users WHERE supabase_user_id = $1`,
        [supaUser.id]
      );
      return existing[0];
    }
    const user = rows[0];
    await client.query('INSERT INTO profiles (user_id) VALUES ($1)', [user.id]);
    await client.query(
      `INSERT INTO user_settings (user_id, default_approach_message)
       VALUES ($1, $2)`,
      [user.id, "Hi, I'm interested in your services and would like to discuss a project with you."]
    );
    return user;
  });
}

export async function requireAuth(req, res, next) {
  try {
    const supaUser = await resolveSupabaseUser(req);
    if (!supaUser) return next(unauthorized('Please log in to continue.'));
    let user = await loadAppUser(supaUser.id);
    if (!user) {
      user = await createAppUserForSupabaseIdentity(supaUser);
    }
    if (user.status !== 'active') return next(forbidden('This account is not active.'));
    user = await ensureSuperAdmin(user);
    req.user = user;
    req.supabaseUser = supaUser;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return next(forbidden('Admin access required.'));
  next();
}

// Level 2 is "full control": everything level 1 (the plain requireAdmin
// check above) can already do, plus deleting a user account, the Site
// Settings panel, and exclusive rights to grant/revoke admin status and
// level-2 status itself (see admin.routes.js's promote/demote/admin-level
// routes). A legacy admin row with no admin_level set yet (NULL -- any
// admin promoted before migration 018) is treated as level 1, the safe
// default, never silently upgraded.
export function requireLevel2Admin(req, res, next) {
  if (!req.user || req.user.role !== 'admin' || req.user.admin_level !== 2) {
    return next(forbidden('Level 2 admin access required.'));
  }
  next();
}

/** Requires the caller to have an active/published provider profile. */
export function requireProvider(req, res, next) {
  if (!req.user?.provider_id) return next(forbidden('A provider profile is required for this action.'));
  next();
}

/** Attaches req.user if a valid token is present, but does not fail if not. */
export async function attachUserIfPresent(req, res, next) {
  try {
    const supaUser = await resolveSupabaseUser(req);
    if (!supaUser) return next();
    let user = await loadAppUser(supaUser.id);
    if (user && user.status === 'active') {
      user = await ensureSuperAdmin(user);
      req.user = user;
      req.supabaseUser = supaUser;
    }
    next();
  } catch (err) {
    next(err);
  }
}
