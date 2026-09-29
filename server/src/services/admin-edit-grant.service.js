import { query } from '../lib/db.js';
import { forbidden } from '../lib/errors.js';

// How long a provider has to approve or decline before the request goes
// stale on its own, and how long the admin's editing window lasts once they
// do approve. Both are enforced server-side (see below), not just displayed
// as a countdown on the client.
export const REQUEST_TTL_INTERVAL = '1 hour';
export const ACCESS_TTL_INTERVAL = '2 hours';

// There's no background worker in this app to sweep expired rows on a
// schedule, so every read of a grant first brings its own status up to date
// against its deadline. Cheap (two indexed UPDATEs scoped to one provider)
// and means "pending"/"approved" in the database is never stale by more than
// the time since the last read.
async function expireStale(providerId) {
  await query(
    `UPDATE admin_edit_grants SET status = 'expired', updated_at = now()
      WHERE provider_id = $1 AND status = 'pending' AND request_expires_at < now()`,
    [providerId]
  );
  await query(
    `UPDATE admin_edit_grants SET status = 'expired', updated_at = now()
      WHERE provider_id = $1 AND status = 'approved' AND access_expires_at < now()`,
    [providerId]
  );
}

/**
 * The most recent grant that's still "live" for this provider -- either
 * waiting on their answer, or an active, unexpired editing window -- or null
 * if there's nothing currently in flight. Used by both sides: the admin
 * panel polls this to drive its standby timer, and the provider dashboard
 * polls it to know whether to show an approve/decline banner.
 */
export async function getLatestGrant(providerId) {
  await expireStale(providerId);
  const { rows } = await query(
    `SELECT g.*, u.first_name AS admin_first_name, u.last_name AS admin_last_name
       FROM admin_edit_grants g JOIN users u ON u.id = g.requested_by_admin_id
      WHERE g.provider_id = $1 AND g.status IN ('pending','approved')
      ORDER BY g.requested_at DESC LIMIT 1`,
    [providerId]
  );
  return rows[0] || null;
}

/**
 * Guards every admin write to a provider's setup. Throws unless this
 * provider currently has a live, approved, unexpired grant -- so none of the
 * admin edit endpoints can be reached just by being an admin; a real
 * approval has to be on record first.
 */
export async function assertApprovedAccess(providerId) {
  await expireStale(providerId);
  const { rows } = await query(
    `SELECT * FROM admin_edit_grants
      WHERE provider_id = $1 AND status = 'approved' AND access_expires_at > now()
      ORDER BY responded_at DESC LIMIT 1`,
    [providerId]
  );
  if (!rows[0]) {
    throw forbidden(
      'No active, approved edit-access grant for this provider. Request access and wait for them to approve it first.'
    );
  }
  return rows[0];
}
