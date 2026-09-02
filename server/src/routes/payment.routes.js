import { Router } from 'express';
import express from 'express';
import { query } from '../lib/db.js';
import { getStripe } from '../lib/stripe.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../lib/errors.js';
import { requireAuth, requireProvider } from '../middleware/auth.js';
import * as PaymentService from '../services/payment.service.js';
import * as SubscriptionService from '../services/subscription.service.js';

const router = Router();

router.post(
  '/connect/onboard',
  requireAuth,
  requireProvider,
  asyncHandler(async (req, res) => {
    const origin = process.env.CLIENT_ORIGIN?.split(',')[0] || 'http://localhost:5173';
    const url = await PaymentService.createOnboardingLink(
      req.user.provider_id,
      req.user.email,
      `${origin}/provider/earnings?connect=return`,
      `${origin}/provider/earnings?connect=refresh`
    );
    res.json({ url });
  })
);

router.get(
  '/connect/status',
  requireAuth,
  requireProvider,
  asyncHandler(async (req, res) => {
    const status = await PaymentService.refreshConnectStatus(req.user.provider_id);
    res.json({ account: status });
  })
);

router.post(
  '/checkout/:jobId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const origin = process.env.CLIENT_ORIGIN?.split(',')[0] || 'http://localhost:5173';
    const result = await PaymentService.createCheckoutForJob({
      jobId: req.params.jobId,
      customerId: req.user.id,
      successUrl: `${origin}/jobs/${req.params.jobId}?payment=success`,
      cancelUrl: `${origin}/jobs/${req.params.jobId}?payment=cancelled`,
    });
    res.json(result);
  })
);

router.get(
  '/job/:jobId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM payments WHERE job_id = $1', [req.params.jobId]);
    const payment = rows[0];
    if (!payment) throw notFound('No payment found for this job.');
    if (payment.customer_id !== req.user.id && req.user.provider_id !== payment.provider_id && req.user.role !== 'admin') {
      throw forbidden('You do not have access to this payment.');
    }
    res.json({ payment });
  })
);

export default router;

// ---------------------------------------------------------------------------
// Webhook router — mounted BEFORE express.json() in index.js so we get the
// raw body Stripe's signature verification requires. Every event is verified
// and recorded exactly once (payment_events.stripe_event_id is UNIQUE), so a
// retried delivery can never double-apply a payment or payout.
// ---------------------------------------------------------------------------
export const webhookRouter = Router();

webhookRouter.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return res.status(503).send('Webhook not configured.');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const isNew = await PaymentService.recordEventOnce(event.id);
  if (!isNew) return res.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.metadata?.kind === 'job_payment') {
          await PaymentService.handleCheckoutCompleted(session);
        }
        // Subscription checkouts complete via customer.subscription.created below.
        break;
      }
      case 'payment_intent.payment_failed': {
        await PaymentService.markPaymentFailed(event.data.object.id);
        break;
      }
      case 'account.updated': {
        const account = event.data.object;
        await query(
          `UPDATE provider_stripe_accounts SET charges_enabled = $1, payouts_enabled = $2, details_submitted = $3, updated_at = now()
           WHERE stripe_account_id = $4`,
          [account.charges_enabled, account.payouts_enabled, account.details_submitted, account.id]
        );
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const kind = sub.metadata?.kind;
        if (kind === 'pro_subscription') await SubscriptionService.handleSubscriptionEvent('pro', sub);
        if (kind === 'boost_subscription') await SubscriptionService.handleSubscriptionEvent('boost', sub);
        break;
      }
      case 'invoice.paid': {
        // Every successful subscription charge (the first one and every
        // renewal) -- feeds the admin analytics revenue-by-source/by-time
        // breakdown. See subscription.service.js's recordInvoicePaid() and
        // migration 007 for why this can't just be read off `subscriptions`/
        // `boosts` directly.
        await SubscriptionService.recordInvoicePaid(event.data.object);
        break;
      }
      default:
        break; // ignore event types we don't act on
    }
  } catch (err) {
    console.error(`Error handling Stripe webhook ${event.type}:`, err);
    // Still 200 so Stripe doesn't hammer retries for a bug on our side while
    // the event is already durably recorded in payment_events for replay/debug.
  }

  res.json({ received: true });
});
