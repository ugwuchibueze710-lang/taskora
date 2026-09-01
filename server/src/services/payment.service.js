import { query, withTransaction } from '../lib/db.js';
import { getStripe } from '../lib/stripe.js';
import { badRequest, notFound, forbidden, conflict } from '../lib/errors.js';
import { transitionJob } from './job.service.js';
import { notify } from './notification.service.js';

function requireStripe() {
  const stripe = getStripe();
  if (!stripe) throw badRequest('Payments are not configured yet. Add your Stripe keys to enable checkout.');
  return stripe;
}

// ---------------------------------------------------------------------------
// Stripe Connect onboarding for providers (Express accounts)
// ---------------------------------------------------------------------------

export async function getOrCreateConnectAccount(providerId, providerEmail) {
  const stripe = requireStripe();
  const { rows } = await query('SELECT * FROM provider_stripe_accounts WHERE provider_id = $1', [providerId]);
  if (rows[0]) return rows[0].stripe_account_id;

  const account = await stripe.accounts.create({
    type: 'express',
    email: providerEmail,
    capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
    business_type: 'individual',
  });
  await query(
    `INSERT INTO provider_stripe_accounts (provider_id, stripe_account_id) VALUES ($1, $2)`,
    [providerId, account.id]
  );
  return account.id;
}

export async function createOnboardingLink(providerId, providerEmail, returnUrl, refreshUrl) {
  const stripe = requireStripe();
  const accountId = await getOrCreateConnectAccount(providerId, providerEmail);
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    return_url: returnUrl,
    refresh_url: refreshUrl,
  });
  return link.url;
}

export async function refreshConnectStatus(providerId) {
  const stripe = requireStripe();
  const { rows } = await query('SELECT * FROM provider_stripe_accounts WHERE provider_id = $1', [providerId]);
  if (!rows[0]) return null;
  const account = await stripe.accounts.retrieve(rows[0].stripe_account_id);
  const { rows: updated } = await query(
    `UPDATE provider_stripe_accounts SET charges_enabled = $1, payouts_enabled = $2, details_submitted = $3, updated_at = now()
     WHERE provider_id = $4 RETURNING *`,
    [account.charges_enabled, account.payouts_enabled, account.details_submitted, providerId]
  );
  return updated[0];
}

// ---------------------------------------------------------------------------
// Checkout for a job (customer pays; Taskora holds funds; 10% platform fee)
// ---------------------------------------------------------------------------

export async function createCheckoutForJob({ jobId, customerId, successUrl, cancelUrl }) {
  const stripe = requireStripe();
  const { rows: jobRows } = await query('SELECT * FROM jobs WHERE id = $1', [jobId]);
  const job = jobRows[0];
  if (!job) throw notFound('Job not found.');
  if (job.customer_id !== customerId) throw forbidden('This is not your job.');
  if (job.status !== 'quote_accepted') throw conflict(`This job is not ready for payment (status: ${job.status}).`);

  const existingPayment = await query('SELECT * FROM payments WHERE job_id = $1', [jobId]);
  let payment = existingPayment.rows[0];
  if (!payment) {
    const { rows } = await query(
      `INSERT INTO payments (job_id, customer_id, provider_id, amount_total, platform_fee, provider_amount)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [job.id, job.customer_id, job.provider_id, job.price, job.platform_fee, job.provider_amount]
    );
    payment = rows[0];
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(Number(job.price) * 100),
          product_data: {
            name: 'Taskora service payment',
            description: job.service_description?.slice(0, 200) || 'Service job payment',
          },
        },
        quantity: 1,
      },
    ],
    metadata: { jobId: job.id, paymentId: payment.id, kind: 'job_payment' },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  await transitionJob(job.id, 'payment_pending', { byUserId: customerId, reason: 'Checkout started' });
  await query('UPDATE payments SET stripe_payment_intent_id = NULL, updated_at = now() WHERE id = $1', [payment.id]);
  await query(
    `UPDATE payments SET status = 'processing', updated_at = now() WHERE id = $1`,
    [payment.id]
  );

  return { url: session.url, sessionId: session.id, payment };
}

// ---------------------------------------------------------------------------
// Webhook handlers (idempotent — every event is recorded once in payment_events)
// ---------------------------------------------------------------------------

export async function recordEventOnce(stripeEventId) {
  try {
    await query('INSERT INTO payment_events (stripe_event_id, type, payload) VALUES ($1, $2, $3)', [
      stripeEventId,
      'pending',
      '{}',
    ]);
    return true; // first time we've seen this event
  } catch (err) {
    if (err.code === '23505') return false; // duplicate webhook delivery — ignore
    throw err;
  }
}

export async function handleCheckoutCompleted(session) {
  const paymentId = session.metadata?.paymentId;
  if (!paymentId) return;
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [paymentId]);
    const payment = rows[0];
    if (!payment || payment.status === 'succeeded') return; // already processed (idempotent)

    await client.query(
      `UPDATE payments SET status = 'succeeded', stripe_payment_intent_id = $1, updated_at = now() WHERE id = $2`,
      [session.payment_intent, paymentId]
    );
    await transitionJob(payment.job_id, 'paid', { reason: 'Payment received via Stripe', client });

    const { rows: jobRows } = await client.query(
      `SELECT j.*, pr.user_id AS provider_user_id FROM jobs j JOIN providers pr ON pr.id = j.provider_id WHERE j.id = $1`,
      [payment.job_id]
    );
    const job = jobRows[0];
    await notify(job.customer_id, {
      type: 'payment_update',
      title: 'Payment confirmed',
      body: `Your payment of $${payment.amount_total} was received. Waiting on your provider to accept the job.`,
      data: { jobId: job.id },
      client,
    });
    await notify(job.provider_user_id, {
      type: 'job_request',
      title: 'New job request',
      body: `A customer paid for a job: $${payment.provider_amount} after Taskora's fee.`,
      data: { jobId: job.id },
      client,
    });
  });
}

export async function markPaymentFailed(paymentIntentId) {
  const { rows } = await query('SELECT * FROM payments WHERE stripe_payment_intent_id = $1', [paymentIntentId]);
  const payment = rows[0];
  if (!payment) return;
  await query(`UPDATE payments SET status = 'failed', updated_at = now() WHERE id = $1`, [payment.id]);
  await transitionJob(payment.job_id, 'quote_accepted', { reason: 'Payment failed' });
  await notify(payment.customer_id, {
    type: 'payment_update',
    title: 'Payment could not be completed',
    body: 'Your card was not charged. You can try paying again from the job details page.',
    data: { jobId: payment.job_id },
  });
}

// ---------------------------------------------------------------------------
// Payout release: only after the customer explicitly confirms completion
// ---------------------------------------------------------------------------

export async function releasePayoutForJob(jobId) {
  const stripe = requireStripe();
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM payments WHERE job_id = $1 FOR UPDATE', [jobId]);
    const payment = rows[0];
    if (!payment) throw notFound('No payment found for this job.');
    if (payment.status !== 'succeeded') throw conflict('This job has not been paid for.');
    if (payment.payout_status !== 'holding') return payment; // already released — idempotent

    const { rows: acctRows } = await client.query('SELECT * FROM provider_stripe_accounts WHERE provider_id = $1', [
      payment.provider_id,
    ]);
    const account = acctRows[0];
    if (!account?.payouts_enabled) {
      // Funds stay safely held; provider must finish Connect onboarding before payout can move.
      await client.query(`UPDATE payments SET payout_status = 'failed', updated_at = now() WHERE id = $1`, [payment.id]);
      throw conflict('This provider has not finished setting up payouts yet. Funds remain held by Taskora.');
    }

    const transfer = await stripe.transfers.create({
      amount: Math.round(Number(payment.provider_amount) * 100),
      currency: 'usd',
      destination: account.stripe_account_id,
      transfer_group: `job_${jobId}`,
    });

    await client.query(
      `INSERT INTO provider_payouts (provider_id, payment_id, stripe_transfer_id, amount, status)
       VALUES ($1, $2, $3, $4, 'paid')`,
      [payment.provider_id, payment.id, transfer.id, payment.provider_amount]
    );
    const { rows: updated } = await client.query(
      `UPDATE payments SET payout_status = 'released', updated_at = now() WHERE id = $1 RETURNING *`,
      [payment.id]
    );
    return updated[0];
  });
}

export async function refundPayment(jobId, reason = 'Job cancelled') {
  const { rows } = await query('SELECT * FROM payments WHERE job_id = $1', [jobId]);
  const payment = rows[0];
  if (!payment) return null; // nothing was ever paid — nothing to refund
  if (payment.status !== 'succeeded' || payment.payout_status !== 'holding') {
    // Either never charged, or funds already moved to the provider — cannot silently refund.
    return payment;
  }
  const stripe = requireStripe();
  await stripe.refunds.create({ payment_intent: payment.stripe_payment_intent_id, reason: 'requested_by_customer' });
  const { rows: updated } = await query(
    `UPDATE payments SET status = 'refunded', payout_status = 'refunded', updated_at = now() WHERE id = $1 RETURNING *`,
    [payment.id]
  );
  return updated[0];
}
