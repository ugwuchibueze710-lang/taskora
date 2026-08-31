import { query } from '../lib/db.js';

/**
 * Creates a real, persisted in-app notification. This is the single place
 * notifications get written so unread counts and the notification feed are
 * always backed by actual rows — never a fake "toast only" state.
 */
export async function notify(userId, { type, title, body = null, data = null }) {
  const { rows } = await query(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, type, title, body, data ? JSON.stringify(data) : null]
  );
  return rows[0];
}
