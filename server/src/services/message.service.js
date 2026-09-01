import { query, withTransaction } from '../lib/db.js';
import { notFound, forbidden } from '../lib/errors.js';
import { notify } from './notification.service.js';

/**
 * Finds or creates the single conversation between a customer and a provider.
 * Pass `client` when calling from inside a withTransaction() block so this
 * participates in that transaction instead of auto-committing independently
 * on its own pooled connection.
 */
export async function getOrCreateConversation(customerId, providerId, client = null) {
  const runner = client ? (text, params) => client.query(text, params) : query;
  const existing = await runner('SELECT * FROM conversations WHERE customer_id = $1 AND provider_id = $2', [
    customerId,
    providerId,
  ]);
  if (existing.rows[0]) return existing.rows[0];
  const { rows } = await runner(
    'INSERT INTO conversations (customer_id, provider_id) VALUES ($1, $2) RETURNING *',
    [customerId, providerId]
  );
  return rows[0];
}

/** Loads a conversation and verifies the requesting user is a participant (customer or the provider owner). */
export async function loadConversationForUser(conversationId, user) {
  const { rows } = await query(
    `SELECT conv.*, pr.user_id AS provider_user_id
       FROM conversations conv JOIN providers pr ON pr.id = conv.provider_id
      WHERE conv.id = $1`,
    [conversationId]
  );
  const conv = rows[0];
  if (!conv) throw notFound('Conversation not found.');
  const isCustomer = conv.customer_id === user.id;
  const isProviderOwner = conv.provider_user_id === user.id;
  if (!isCustomer && !isProviderOwner) throw forbidden('You do not have access to this conversation.');
  return { conv, role: isCustomer ? 'customer' : 'provider' };
}

/**
 * Sends a message into a conversation as `senderUserId` and fires the
 * recipient's auto-reply (if enabled) exactly once per customer inquiry.
 */
export async function sendMessage({ conversationId, senderUserId, senderRole = 'user', type = 'text', body, metadata = null }) {
  return withTransaction(async (client) => {
    const { rows: convRows } = await client.query(
      `SELECT conv.*, pr.user_id AS provider_user_id, pr.auto_reply_enabled, pr.auto_reply_message
         FROM conversations conv JOIN providers pr ON pr.id = conv.provider_id
        WHERE conv.id = $1 FOR UPDATE`,
      [conversationId]
    );
    const conv = convRows[0];
    if (!conv) throw notFound('Conversation not found.');

    const { rows: msgRows } = await client.query(
      `INSERT INTO messages (conversation_id, sender_user_id, sender_role, type, body, metadata)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [conversationId, senderUserId, senderRole, type, body, metadata ? JSON.stringify(metadata) : null]
    );
    await client.query('UPDATE conversations SET last_message_at = now() WHERE id = $1', [conversationId]);

    const message = msgRows[0];

    // Notify + maybe fire the provider's auto-reply, only for a genuine
    // customer -> provider message (never for the provider's own messages,
    // and never more than once by checking there isn't already an auto_reply
    // in this conversation).
    const isFromCustomer = senderUserId === conv.customer_id;
    if (isFromCustomer && conv.provider_user_id) {
      await notify(conv.provider_user_id, {
        type: 'new_message',
        title: 'New message',
        body: body?.slice(0, 140) || 'You have a new message.',
        data: { conversationId },
        client,
      });

      if (conv.auto_reply_enabled && conv.auto_reply_message && type !== 'auto_reply') {
        const { rows: existingAuto } = await client.query(
          `SELECT 1 FROM messages WHERE conversation_id = $1 AND type = 'auto_reply' LIMIT 1`,
          [conversationId]
        );
        if (!existingAuto.length) {
          await client.query(
            `INSERT INTO messages (conversation_id, sender_user_id, sender_role, type, body)
             VALUES ($1, $2, 'system', 'auto_reply', $3)`,
            [conversationId, conv.provider_user_id, conv.auto_reply_message]
          );
          await client.query('UPDATE conversations SET last_message_at = now() WHERE id = $1', [conversationId]);
        }
      }
    } else if (!isFromCustomer) {
      await notify(conv.customer_id, {
        type: 'new_message',
        title: 'New message from your provider',
        body: body?.slice(0, 140) || 'You have a new message.',
        data: { conversationId },
        client,
      });
    }

    return message;
  });
}
