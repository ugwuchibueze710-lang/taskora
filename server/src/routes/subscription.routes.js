import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireProvider } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import * as SubscriptionService from '../services/subscription.service.js';

const router = Router();

// Launch decision (Oct 2026): Taskora Pro and Boost are hidden from the
// UI for the free launch period (hidden, not removed -- the pages, Stripe
// wiring, and ranking logic all still exist, see provider-tier.service.js).
// This blocks the checkout endpoints too, so a stray bookmark or direct
// API call can't start billing someone while the feature is supposed to
// be off. Flip to true to bring Pro/Boost back.
const PRO_BOOST_ENABLED = false;

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
    if (!PRO_BOOST_ENABLED) throw new AppError('Taskora Pro is not available right now -- Taskora is free for everyone during launch.', 503, 'FEATURE_DISABLED');
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
    if (!PRO_BOOST_ENABLED) throw new AppError('Taskora Boost is not available right now -- Taskora is free for everyone during launch.', 503, 'FEATURE_DISABLED');
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
