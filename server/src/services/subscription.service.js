import { query } from '../lib/db.js';
import { getStripe } from '../lib/stripe.js';
import { badRequest, notFound } from '../lib/errors.js';
import { notify } from './notification.service.js';

function requireStripe() {
  const stripe = getStripe();
  if (!stripe) throw badRequest('Subscriptions are not configured yet.');
  return stripe;
}

// Taskora Pro offers monthly and yearly billing; Boost (a separate, unrelated
// feature) only ever bills monthly. Each interval maps to its own real Stripe
// Price object — created and priced entirely in the Stripe Dashboard, never
// invented here.
const PRICE_ENV = {
  pro: { month: 'STRIPE_PRO_PRICE_ID', year: 'STRIPE_PRO_YEARLY_PRICE_ID' },
  boost: { month: 'STRIPE_BOOST_PRICE_ID' },
};
const TABLE = { pro: 'subscriptions', boost: 'boosts' };

export async function startCheckout(type, { providerId, providerEmail, successUrl, cancelUrl, interval = 'month' }) {
  const stripe = requireStripe();
  const priceId = process.env[PRICE_ENV[type][interval]];
  if (!priceId) {
    const label = type === 'pro' ? 'Taskora Pro' : 'Taskora Boost';
    throw badRequest(`${label} (${interval === 'year' ? 'yearly' : 'monthly'}) is not configured yet.`);
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: providerEmail,
    line_items: [{ price: priceId, quantity: 1 }],
    // IMPORTANT: metadata on the Checkout Session does NOT automatically carry
    // over to the Subscription object Stripe creates from it — they are two
    // separate API objects. handleSubscriptionEvent() below reads metadata
    // off the *Subscription* (from customer.subscription.* webhook events),
    // so it must be set here via subscription_data.metadata, not just on the
    // session. Without this, a real successful payment would silently never
    // activate the provider's priority status.
    subscription_data: { metadata: { providerId, kind: `${type}_subscription` } },
    metadata: { providerId, kind: `${type}_subscription` },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  return session.url;
}

export async function handleSubscriptionEvent(type, subscription) {
  const table = TABLE[type];
  const providerId = subscription.metadata?.providerId;
  const status = subscription.status; // active | past_due | canceled | incomplete | ...
  const normalizedStatus = ['active', 'past_due', 'canceled', 'incomplete'].includes(status) ? status : 'incomplete';
  const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null;
  // The real billing interval, read from the actual Stripe Price on the
  // subscription — never guessed or hardcoded — so admin views and the
  // provider's own "renews monthly/yearly" display always match Stripe.
  const billingInterval = subscription.items?.data?.[0]?.price?.recurring?.interval === 'year' ? 'year' : 'month';

  const existing = await query(`SELECT * FROM ${table} WHERE stripe_subscription_id = $1`, [subscription.id]);
  if (existing.rows[0]) {
    if (type === 'pro') {
      await query(
        `UPDATE ${table} SET status = $1, current_period_end = $2, billing_interval = $3, updated_at = now() WHERE stripe_subscription_id = $4`,
        [normalizedStatus, periodEnd, billingInterval, subscription.id]
      );
    } else {
      await query(`UPDATE ${table} SET status = $1, current_period_end = $2, updated_at = now() WHERE stripe_subscription_id = $3`, [
        normalizedStatus,
        periodEnd,
        subscription.id,
      ]);
    }
  } else if (providerId) {
    if (type === 'pro') {
      await query(
        `INSERT INTO ${table} (provider_id, stripe_subscription_id, stripe_customer_id, status, current_period_end, billing_interval)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [providerId, subscription.id, subscription.customer, normalizedStatus, periodEnd, billingInterval]
      );
    } else {
      await query(
        `INSERT INTO ${table} (provider_id, stripe_subscription_id, stripe_customer_id, status, current_period_end)
         VALUES ($1, $2, $3, $4, $5)`,
        [providerId, subscription.id, subscription.customer, normalizedStatus, periodEnd]
      );
    }
  } else {
    return; // nothing we can attribute this to
  }

  const targetProviderId = providerId || existing.rows[0]?.provider_id;
  if (!targetProviderId) return;
  const isActive = normalizedStatus === 'active';
  if (type === 'pro') {
    await query('UPDATE providers SET is_pro = $1, pro_since = CASE WHEN $1 THEN COALESCE(pro_since, now()) ELSE pro_since END WHERE id = $2', [
      isActive,
      targetProviderId,
    ]);
  } else {
    await query('UPDATE providers SET is_boosted = $1, boosted_since = CASE WHEN $1 THEN COALESCE(boosted_since, now()) ELSE boosted_since END WHERE id = $2', [
      isActive,
      targetProviderId,
    ]);
  }

  const { rows: providerRows } = await query('SELECT user_id FROM providers WHERE id = $1', [targetProviderId]);
  if (providerRows[0]) {
    await notify(providerRows[0].user_id, {
      type: `${type}_status`,
      title: isActive ? `Taskora ${type === 'pro' ? 'Pro' : 'Boost'} is active` : `Taskora ${type === 'pro' ? 'Pro' : 'Boost'} status changed`,
      body: isActive ? 'Your subscription is active.' : `Subscription status: ${normalizedStatus}.`,
    });
  }
}

export async function getStatus(providerId) {
  const [pro, boost] = await Promise.all([
    query('SELECT * FROM subscriptions WHERE provider_id = $1 ORDER BY created_at DESC LIMIT 1', [providerId]),
    query('SELECT * FROM boosts WHERE provider_id = $1 ORDER BY created_at DESC LIMIT 1', [providerId]),
  ]);
  return { pro: pro.rows[0] || null, boost: boost.rows[0] || null };
}
