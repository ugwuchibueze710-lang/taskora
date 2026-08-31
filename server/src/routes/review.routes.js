import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../lib/db.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import { requireAuth, requireProvider } from '../middleware/auth.js';
import { notify } from '../services/notification.service.js';

const router = Router();

router.post(
  '/',
  requireAuth,
  validateBody(
    z.object({
      jobId: z.string().uuid(),
      rating: z.number().int().min(1).max(5),
      comment: z.string().max(2000).optional(),
      photoUrls: z.array(z.string().url()).max(6).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const { jobId, rating, comment, photoUrls = [] } = req.body;
    const { rows: jobRows } = await query('SELECT * FROM jobs WHERE id = $1', [jobId]);
    const job = jobRows[0];
    if (!job) throw notFound('Job not found.');
    if (job.customer_id !== req.user.id) throw forbidden('Only the customer on this job can leave a review.');
    if (job.status !== 'completed') throw badRequest('You can only review a job after it has been completed.');
    // customer cannot review themselves: providers are separate provider profiles owned by other users,
    // but guard anyway in case a provider somehow booked their own listing.
    const { rows: providerRows } = await query('SELECT user_id FROM providers WHERE id = $1', [job.provider_id]);
    if (providerRows[0]?.user_id === req.user.id) throw forbidden('You cannot review your own provider profile.');

    const review = await withTransaction(async (client) => {
      const existing = await client.query('SELECT id FROM reviews WHERE job_id = $1', [jobId]);
      if (existing.rows[0]) throw conflict('You already reviewed this job.');

      const { rows } = await client.query(
        `INSERT INTO reviews (job_id, customer_id, provider_id, rating, comment) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [jobId, req.user.id, job.provider_id, rating, comment || null]
      );
      const created = rows[0];
      for (const url of photoUrls) {
        await client.query('INSERT INTO review_photos (review_id, url) VALUES ($1, $2)', [created.id, url]);
      }
      const agg = await client.query(
        'SELECT avg(rating)::numeric(3,2) AS avg, count(*) AS count FROM reviews WHERE provider_id = $1 AND is_hidden = false',
        [job.provider_id]
      );
      await client.query('UPDATE providers SET rating_avg = $1, rating_count = $2 WHERE id = $3', [
        agg.rows[0].avg || 0,
        agg.rows[0].count,
        job.provider_id,
      ]);
      return created;
    });

    if (providerRows[0]) {
      await notify(providerRows[0].user_id, {
        type: 'new_review',
        title: 'New review received',
        body: `You received a ${rating}-star review.`,
        data: { reviewId: review.id },
      });
    }

    res.status(201).json({ review });
  })
);

router.get(
  '/provider/:providerId',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT r.*, u.first_name, u.last_name, rr.response AS provider_response,
              (SELECT array_agg(url) FROM review_photos WHERE review_id = r.id) AS photo_urls
         FROM reviews r JOIN users u ON u.id = r.customer_id
         LEFT JOIN review_responses rr ON rr.review_id = r.id
        WHERE r.provider_id = $1 AND r.is_hidden = false
        ORDER BY r.created_at DESC`,
      [req.params.providerId]
    );
    res.json({ reviews: rows });
  })
);

router.post(
  '/:id/response',
  requireAuth,
  requireProvider,
  validateBody(z.object({ response: z.string().trim().min(1).max(2000) })),
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM reviews WHERE id = $1', [req.params.id]);
    const review = rows[0];
    if (!review) throw notFound('Review not found.');
    if (review.provider_id !== req.user.provider_id) throw forbidden('This is not your review to respond to.');
    const existing = await query('SELECT id FROM review_responses WHERE review_id = $1', [review.id]);
    if (existing.rows[0]) throw conflict('You already responded to this review.');
    const { rows: inserted } = await query(
      'INSERT INTO review_responses (review_id, provider_id, response) VALUES ($1, $2, $3) RETURNING *',
      [review.id, req.user.provider_id, req.body.response]
    );
    res.status(201).json({ response: inserted[0] });
  })
);

export default router;
