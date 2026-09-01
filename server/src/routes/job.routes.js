import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../lib/db.js';
import { asyncHandler, badRequest, conflict } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import { requireAuth, requireProvider } from '../middleware/auth.js';
import { transitionJob, getJobForUser, notifyJobParties } from '../services/job.service.js';
import { releasePayoutForJob, refundPayment } from '../services/payment.service.js';
import { generateInvoiceForJob } from '../services/invoice.service.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user.current_mode === 'provider') {
      if (!req.user.provider_id) return res.json({ jobs: [] });
      const { rows } = await query(
        `SELECT j.*, u.first_name AS customer_first_name, u.last_name AS customer_last_name
           FROM jobs j JOIN users u ON u.id = j.customer_id
          WHERE j.provider_id = $1 ORDER BY j.created_at DESC`,
        [req.user.provider_id]
      );
      return res.json({ jobs: rows });
    }
    const { rows } = await query(
      `SELECT j.*, COALESCE(pr.business_name, pr.display_name) AS provider_name, pr.image_url
         FROM jobs j JOIN providers pr ON pr.id = j.provider_id
        WHERE j.customer_id = $1 ORDER BY j.created_at DESC`,
      [req.user.id]
    );
    res.json({ jobs: rows });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { job } = await getJobForUser(req.params.id, req.user);
    const history = await query('SELECT * FROM job_state_history WHERE job_id = $1 ORDER BY created_at', [job.id]);
    res.json({ job, history: history.rows });
  })
);

// ---- Provider accepts/declines a paid job ----
router.post(
  '/:id/accept',
  requireAuth,
  requireProvider,
  asyncHandler(async (req, res) => {
    const { job, isProvider } = await getJobForUser(req.params.id, req.user);
    if (!isProvider) throw badRequest('Only the assigned provider can accept this job.');
    const updated = await transitionJob(job.id, 'provider_accepted', { byUserId: req.user.id });
    await notifyJobParties(updated, {
      type: 'job_accepted',
      customerTitle: 'Provider accepted your job',
      customerBody: 'Your provider accepted the job and will be in touch about scheduling.',
    });
    res.json({ job: updated });
  })
);

router.post(
  '/:id/decline',
  requireAuth,
  requireProvider,
  validateBody(z.object({ reason: z.string().max(500).optional() })),
  asyncHandler(async (req, res) => {
    const { job, isProvider } = await getJobForUser(req.params.id, req.user);
    if (!isProvider) throw badRequest('Only the assigned provider can decline this job.');
    // Attempt the refund BEFORE committing the cancellation. If the refund call fails
    // (Stripe error, network issue, etc.), the job must stay in its current status —
    // never leave a job "cancelled" while its payment is silently stuck in "holding"
    // with no refund and no audit record (see job.routes.js /cancel for the same fix).
    const refund = await refundPayment(job.id, 'Provider declined the job');
    const updated = await transitionJob(job.id, 'cancelled', { byUserId: req.user.id, reason: req.body.reason || 'Declined by provider' });
    await query(
      `INSERT INTO cancellations (job_id, cancelled_by_user_id, reason, job_status_before, job_status_after, refund_status)
       VALUES ($1, $2, $3, $4, 'cancelled', $5)`,
      [job.id, req.user.id, req.body.reason || 'Declined by provider', job.status, refund?.status === 'refunded' ? 'refunded' : 'none']
    );
    await notifyJobParties(updated, {
      type: 'job_declined',
      customerTitle: 'Your job was declined',
      customerBody: "Your provider declined this job. You've been refunded in full.",
    });
    res.json({ job: updated });
  })
);

router.post(
  '/:id/start',
  requireAuth,
  requireProvider,
  asyncHandler(async (req, res) => {
    const { job, isProvider } = await getJobForUser(req.params.id, req.user);
    if (!isProvider) throw badRequest('Only the assigned provider can start this job.');
    const updated = await transitionJob(job.id, 'in_progress', { byUserId: req.user.id });
    res.json({ job: updated });
  })
);

// ---- Provider marks the job done ----
router.post(
  '/:id/mark-complete',
  requireAuth,
  requireProvider,
  asyncHandler(async (req, res) => {
    const { job, isProvider } = await getJobForUser(req.params.id, req.user);
    if (!isProvider) throw badRequest('Only the assigned provider can mark this job complete.');
    const updated = await transitionJob(job.id, 'provider_marked_complete', { byUserId: req.user.id });
    await notifyJobParties(updated, {
      type: 'completion_request',
      customerTitle: 'Your provider marked this job complete',
      customerBody: 'Please confirm the job is done so your provider can be paid.',
    });
    res.json({ job: updated });
  })
);

// ---- Customer confirms completion -> releases payout + generates invoice ----
router.post(
  '/:id/confirm',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { job, isCustomer } = await getJobForUser(req.params.id, req.user);
    if (!isCustomer) throw badRequest('Only the customer can confirm completion.');

    await transitionJob(job.id, 'customer_confirmed', { byUserId: req.user.id });

    let payout = null;
    let invoice = null;
    try {
      payout = await releasePayoutForJob(job.id);
    } catch (err) {
      // Job still moves toward "completed" in the DB conceptually, but if payout
      // truly cannot be released (provider onboarding incomplete) we surface that
      // clearly instead of pretending money moved.
      await query('UPDATE job_state_history SET reason = $1 WHERE job_id = $2 AND to_status = $3', [
        `Payout hold: ${err.message}`,
        job.id,
        'customer_confirmed',
      ]);
      const updated = await transitionJob(job.id, 'completed', { byUserId: req.user.id, reason: 'Confirmed; payout pending provider setup' });
      invoice = await generateInvoiceForJob(job.id);
      return res.json({ job: updated, payout: null, invoice, warning: err.message });
    }

    const updated = await transitionJob(job.id, 'completed', { byUserId: req.user.id });
    invoice = await generateInvoiceForJob(job.id);
    await query('UPDATE providers SET completed_jobs_count = completed_jobs_count + 1 WHERE id = $1', [job.provider_id]);

    await notifyJobParties(updated, {
      type: 'payment_update',
      providerTitle: 'Payment released!',
      providerBody: `$${job.provider_amount} has been sent to your Stripe account.`,
      customerTitle: 'Job completed',
      customerBody: 'Thanks for confirming! Your invoice is ready and you can leave a review.',
    });

    res.json({ job: updated, payout, invoice });
  })
);

// ---- Cancellation (allowed while funds are still held) ----
router.post(
  '/:id/cancel',
  requireAuth,
  validateBody(z.object({ reason: z.string().max(500).optional() })),
  asyncHandler(async (req, res) => {
    const { job } = await getJobForUser(req.params.id, req.user);
    const before = job.status;
    // Refund first, cancel second (see the same fix in /:id/decline above): if the
    // refund call throws, the job must NOT be transitioned to the terminal "cancelled"
    // state, otherwise held funds get stranded with no way to retry the refund.
    const refund = await refundPayment(job.id, req.body.reason || 'Job cancelled');
    const updated = await transitionJob(job.id, 'cancelled', { byUserId: req.user.id, reason: req.body.reason });
    await query(
      `INSERT INTO cancellations (job_id, cancelled_by_user_id, reason, job_status_before, job_status_after, refund_status)
       VALUES ($1, $2, $3, $4, 'cancelled', $5)`,
      [job.id, req.user.id, req.body.reason || null, before, refund?.status === 'refunded' ? 'refunded' : 'none']
    );
    await notifyJobParties(updated, {
      type: 'job_cancelled',
      customerTitle: 'Job cancelled',
      customerBody: refund?.status === 'refunded' ? 'This job was cancelled and you have been refunded.' : 'This job was cancelled.',
      providerTitle: 'Job cancelled',
      providerBody: 'This job was cancelled by the customer.',
    });
    res.json({ job: updated, refunded: refund?.status === 'refunded' });
  })
);

export default router;
