import { Router } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, badRequest } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { getOrCreateConversation, loadConversationForUser, sendMessage } from '../services/message.service.js';

const router = Router();

// ---- List conversations for whichever mode the user is currently in ----
router.get(
  '/conversations',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user.current_mode === 'provider') {
      if (!req.user.provider_id) return res.json({ conversations: [] });
      const { rows } = await query(
        `SELECT conv.id, conv.last_message_at, u.first_name, u.last_name, p.avatar_url,
                (SELECT body FROM messages m WHERE m.conversation_id = conv.id ORDER BY created_at DESC LIMIT 1) AS last_message,
                (SELECT count(*) FROM messages m WHERE m.conversation_id = conv.id AND m.read_at IS NULL AND m.sender_user_id != $1) AS unread_count
           FROM conversations conv
           JOIN users u ON u.id = conv.customer_id
           LEFT JOIN profiles p ON p.user_id = u.id
          WHERE conv.provider_id = $2
          ORDER BY conv.last_message_at DESC`,
        [req.user.id, req.user.provider_id]
      );
      return res.json({ conversations: rows });
    }
    const { rows } = await query(
      `SELECT conv.id, conv.last_message_at, pr.id AS provider_id,
              COALESCE(NULLIF(pr.business_name, ''), pr.display_name) AS provider_name, pr.image_url,
              (SELECT body FROM messages m WHERE m.conversation_id = conv.id ORDER BY created_at DESC LIMIT 1) AS last_message,
              (SELECT count(*) FROM messages m WHERE m.conversation_id = conv.id AND m.read_at IS NULL AND m.sender_user_id != $1) AS unread_count
         FROM conversations conv JOIN providers pr ON pr.id = conv.provider_id
        WHERE conv.customer_id = $1
        ORDER BY conv.last_message_at DESC`,
      [req.user.id]
    );
    res.json({ conversations: rows });
  })
);

router.get(
  '/conversations/:id/messages',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { conv } = await loadConversationForUser(req.params.id, req.user);
    const { rows } = await query('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC', [conv.id]);
    await query(
      `UPDATE messages SET read_at = now() WHERE conversation_id = $1 AND sender_user_id != $2 AND read_at IS NULL`,
      [conv.id, req.user.id]
    );
    res.json({ messages: rows });
  })
);

// ---- Start (or reuse) a conversation with a provider, optionally sending the first message ----
router.post(
  '/conversations',
  requireAuth,
  validateBody(z.object({ providerId: z.string().uuid(), message: z.string().max(2000).optional() })),
  asyncHandler(async (req, res) => {
    const { rows: providerRows } = await query("SELECT id, user_id FROM providers WHERE id = $1 AND status = 'active'", [
      req.body.providerId,
    ]);
    if (!providerRows[0]) throw badRequest('This provider is not available right now.');
    if (providerRows[0].user_id === req.user.id) throw badRequest('You cannot message your own provider profile.');

    const conv = await getOrCreateConversation(req.user.id, req.body.providerId);
    let message = null;
    if (req.body.message?.trim()) {
      message = await sendMessage({ conversationId: conv.id, senderUserId: req.user.id, body: req.body.message.trim() });
    }
    res.status(201).json({ conversation: conv, message });
  })
);

router.post(
  '/conversations/:id/messages',
  requireAuth,
  validateBody(z.object({ body: z.string().trim().min(1).max(2000) })),
  asyncHandler(async (req, res) => {
    const { conv } = await loadConversationForUser(req.params.id, req.user);
    const message = await sendMessage({ conversationId: conv.id, senderUserId: req.user.id, body: req.body.body });
    res.status(201).json({ message });
  })
);

export default router;
