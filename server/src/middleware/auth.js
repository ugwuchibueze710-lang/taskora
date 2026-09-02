import { query } from '../lib/db.js';
import { unauthorized, forbidden } from '../lib/errors.js';

/**
 * Requires a valid session. Loads the full user row onto req.user.
 * This is the ONLY source of truth for identity/authorization on the server;
 * nothing about permissions is ever trusted from the client body.
 */
export async function requireAuth(req, res, next) {
  try {
    const userId = req.session?.userId;
    if (!userId) return next(unauthorized('Please log in to continue.'));
    const { rows } = await query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.current_mode, u.status, u.created_at,
              p.avatar_url, p.location_label, p.location_lat, p.location_lng, p.location_city,
              pr.id AS provider_id, pr.status AS provider_status
         FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id
         LEFT JOIN providers pr ON pr.user_id = u.id
        WHERE u.id = $1`,
      [userId]
    );
    const user = rows[0];
    if (!user) return next(unauthorized('Session is no longer valid.'));
    if (user.status !== 'active') return next(forbidden('This account is not active.'));
    req.user = user;
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

/** Attaches req.user if a session exists, but does not fail if not. */
export async function attachUserIfPresent(req, res, next) {
  try {
    const userId = req.session?.userId;
    if (!userId) return next();
    const { rows } = await query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.current_mode, u.status,
              p.location_lat, p.location_lng, p.location_label, p.location_city,
              pr.id AS provider_id
         FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id
         LEFT JOIN providers pr ON pr.user_id = u.id
        WHERE u.id = $1`,
      [userId]
    );
    if (rows[0] && rows[0].status === 'active') req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}
