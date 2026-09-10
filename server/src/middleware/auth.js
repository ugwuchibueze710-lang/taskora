import { query } from '../lib/db.js';
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

export async function requireAuth(req, res, next) {
  try {
    const supaUser = await resolveSupabaseUser(req);
    if (!supaUser) return next(unauthorized('Please log in to continue.'));
    const user = await loadAppUser(supaUser.id);
    if (!user) return next(unauthorized('Session is no longer valid.'));
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
