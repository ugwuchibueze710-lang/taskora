import { Router } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// General "Contact Taskora" support channel -- always available to every
// logged-in user regardless of customer/provider mode or job history. This
// is deliberately separate from /api/disputes, which is job-scoped and
// requires an active/completed job with a specific provider (see
// dispute.routes.js). One linear thread per user; both the user's own
// messages and Taskora's replies land in the same table, ordered by time.
router.get(
  '/messages/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'SELECT * FROM support_messages WHERE user_id = $1 ORDER BY created_at ASC',
      [req.user.id]
    );
    // Opening the thread marks the admin's replies as read -- mirrors how
    // the messages/notifications features already treat "viewed" as "read".
    await query(
      `UPDATE support_messages SET read_at = now() WHERE user_id = $1 AND sender = 'admin' AND read_at IS NULL`,
      [req.user.id]
    );
    res.json({ messages: rows });
  })
);

router.post(
  '/messages',
  requireAuth,
  validateBody(z.object({ body: z.string().trim().min(1).max(3000) })),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `INSERT INTO support_messages (user_id, sender, body) VALUES ($1, 'user', $2) RETURNING *`,
      [req.user.id, req.body.body]
    );
    res.status(201).json({ message: rows[0] });
  })
);

export default router;
