import { query } from '../lib/db.js';

/**
 * Creates a real, persisted in-app notification. This is the single place
 * notifications get written so unread counts and the notification feed are
 * always backed by actual rows — never a fake "toast only" state.
 *
 * IMPORTANT: when called from inside a withTransaction(async (client) => {...})
 * block, pass that `client` so the notification INSERT is part of the same
 * transaction as the message/job/payment row it announces. Without this, the
 * notification would use its own separate pooled connection and commit
 * immediately and independently — so if anything later in that same
 * transaction throws and the transaction rolls back, the notification would
 * survive while the thing it announced (a message, a job, a payment) would
 * be undone. That exact split caused a real bug: customers seeing "New
 * message" notifications for messages that never actually landed in the
 * conversation. Always pass `client` when one is available.
 */
export async function notify(userId, { type, title, body = null, data = null, client = null }) {
  const runner = client ? (text, params) => client.query(text, params) : query;
  const { rows } = await runner(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, type, title, body, data ? JSON.stringify(data) : null]
  );
  return rows[0];
}
