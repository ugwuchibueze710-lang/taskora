import { Router } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, forbidden, notFound } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import { requireAuth, requireProvider } from '../middleware/auth.js';
import * as QuoteService from '../services/quote.service.js';

const router = Router();

router.post(
  '/requests',
  requireAuth,
  validateBody(
    z.object({
      providerId: z.string().uuid(),
      serviceId: z.number().int().optional(),
      message: z.string().max(2000).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const qr = await QuoteService.createQuoteRequest({ customerId: req.user.id, ...req.body });
    res.status(201).json({ quoteRequest: qr });
  })
);

router.get(
  '/requests/incoming',
  requireAuth,
  requireProvider,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT qr.*, u.first_name, u.last_name FROM quote_requests qr JOIN users u ON u.id = qr.customer_id
        WHERE qr.provider_id = $1 ORDER BY qr.created_at DESC`,
      [req.user.provider_id]
    );
    res.json({ quoteRequests: rows });
  })
);

router.get(
  '/requests/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT qr.*, COALESCE(pr.business_name, pr.display_name) AS provider_name, pr.image_url
         FROM quote_requests qr JOIN providers pr ON pr.id = qr.provider_id
        WHERE qr.customer_id = $1 ORDER BY qr.created_at DESC`,
      [req.user.id]
    );
    res.json({ quoteRequests: rows });
  })
);

router.post(
  '/requests/:id/quote',
  requireAuth,
  requireProvider,
  validateBody(
    z.object({
      price: z.number().positive(),
      description: z.string().max(2000).optional(),
      scheduledDate: z.string().optional(),
      scheduledTime: z.string().optional(),
      notes: z.string().max(1000).optional(),
      expiresInHours: z.number().positive().max(720).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const quote = await QuoteService.sendQuote({ quoteRequestId: req.params.id, providerId: req.user.provider_id, ...req.body });
    res.status(201).json({ quote });
  })
);

router.post(
  '/requests/:id/decline',
  requireAuth,
  requireProvider,
  validateBody(z.object({ reason: z.string().max(500).optional() })),
  asyncHandler(async (req, res) => {
    await QuoteService.declineQuoteRequest({ quoteRequestId: req.params.id, providerId: req.user.provider_id, reason: req.body.reason });
    res.json({ success: true });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM quotes WHERE id = $1', [req.params.id]);
    const quote = rows[0];
    if (!quote) throw notFound('Quote not found.');
    const isCustomer = quote.customer_id === req.user.id;
    const isProvider = quote.provider_id === req.user.provider_id;
    if (!isCustomer && !isProvider) throw forbidden('You do not have access to this quote.');
    res.json({ quote });
  })
);

router.post(
  '/:id/accept',
  requireAuth,
  asyncHandler(async (req, res) => {
    const job = await QuoteService.acceptQuote({ quoteId: req.params.id, customerId: req.user.id });
    res.status(201).json({ job });
  })
);

router.post(
  '/:id/decline',
  requireAuth,
  asyncHandler(async (req, res) => {
    await QuoteService.declineQuote({ quoteId: req.params.id, customerId: req.user.id });
    res.json({ success: true });
  })
);

router.post(
  '/:id/request-changes',
  requireAuth,
  validateBody(z.object({ message: z.string().max(1000).optional() })),
  asyncHandler(async (req, res) => {
    await QuoteService.requestQuoteChanges({ quoteId: req.params.id, customerId: req.user.id, message: req.body.message });
    res.json({ success: true });
  })
);

export default router;
