import { Router } from 'express';
import { requireAuth, requireProvider } from '../middleware/auth.js';
import { asyncHandler } from '../lib/errors.js';
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
  asyncHandler(async (req, res) => {
    const origin = process.env.CLIENT_ORIGIN?.split(',')[0] || 'http://localhost:5173';
    const url = await SubscriptionService.startCheckout('pro', {
      providerId: req.user.provider_id,
      providerEmail: req.user.email,
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
