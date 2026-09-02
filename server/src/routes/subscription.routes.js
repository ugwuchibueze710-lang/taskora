import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireProvider } from '../middleware/auth.js';
import { asyncHandler } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import * as SubscriptionService from '../services/subscription.service.js';

const router = Router();

router.get(
  '/status',
  requireAuth,
  requireProvider,
  asyncHandler(async (req, res) => {
    res.json(await SubscriptionService.getStatus(req.user.provider_id));
  })
);

router.post(
  '/pro/checkout',
  requireAuth,
  requireProvider,
  validateBody(z.object({ interval: z.enum(['month', 'year']).default('month') })),
  asyncHandler(async (req, res) => {
    const origin = process.env.CLIENT_ORIGIN?.split(',')[0] || 'http://localhost:5173';
    const url = await SubscriptionService.startCheckout('pro', {
      providerId: req.user.provider_id,
      providerEmail: req.user.email,
      interval: req.body.interval,
      successUrl: `${origin}/provider/pro?status=success`,
      cancelUrl: `${origin}/provider/pro?status=cancelled`,
    });
    res.json({ url });
  })
);

router.post(
  '/boost/checkout',
  requireAuth,
  requireProvider,
  asyncHandler(async (req, res) => {
    const origin = process.env.CLIENT_ORIGIN?.split(',')[0] || 'http://localhost:5173';
    const url = await SubscriptionService.startCheckout('boost', {
      providerId: req.user.provider_id,
      providerEmail: req.user.email,
      successUrl: `${origin}/provider/boost?status=success`,
      cancelUrl: `${origin}/provider/boost?status=cancelled`,
    });
    res.json({ url });
  })
);

export default router;
