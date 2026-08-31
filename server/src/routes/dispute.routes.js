import { Router } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, badRequest, forbidden } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { transitionJob, getJobForUser, notifyJobParties } from '../services/job.service.js';

const router = Router();

const reasonEnum = z.enum(['not_completed', 'incomplete', 'wrong_service', 'payment_problem', 'provider_unavailable', 'other']);

router.post(
  '/',
  requireAuth,
  validateBody(
    z.object({
      jobId: z.string().uuid(),
      reason: reasonEnum,
      description: z.string().max(3000).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const { job, isCustomer, isProvider } = await getJobForUser(req.body.jobId, req.user);
    if (!isCustomer && !isProvider) throw forbidden('You are not part of this job.');

    const againstUserId = isCustomer ? job.provider_user_id : job.customer_id;
    const updated = await transitionJob(job.id, 'disputed', { byUserId: req.user.id, reason: req.body.reason });

    const { rows } = await query(
      `INSERT INTO disputes (job_id, raised_by_user_id, against_user_id, reason, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [job.id, req.user.id, againstUserId, req.body.reason, req.body.description || null]
    );

    await notifyJobParties(updated, {
      type: 'dispute_opened',
      customerTitle: 'A dispute was opened on your job',
      customerBody: 'Our team will review this and get back to you.',
      providerTitle: 'A dispute was opened on your job',
      providerBody: 'Our team will review this and get back to you.',
    });

    res.status(201).json({ dispute: rows[0] });
  })
);

router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT * FROM disputes WHERE raised_by_user_id = $1 OR against_user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ disputes: rows });
  })
);

export default router;
