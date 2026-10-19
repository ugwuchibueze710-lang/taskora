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
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.current_mode, u.status, u.created_at,
            p.avatar_url, p.location_label, p.location_lat, p.location_lng, p.location_city,
            pr.id AS provider_id, pr.status AS provider_status
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN providers pr ON pr.user_id = u.id
      WHERE u.supabase_user_id = $1`,
    [supabaseUserId]
  );
  return rows[0] || null;
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
       RETURNING id, first_name, last_name, email, role, current_mode, status, created_at`,
      [firstName, '', email, supaUser.id]
    );
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
    const user = await loadAppUser(supaUser.id);
    if (user && user.status === 'active') {
      req.user = user;
      req.supabaseUser = supaUser;
    }
    next();
  } catch (err) {
    next(err);
  }
}
