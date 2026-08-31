import Stripe from 'stripe';
import 'dotenv/config';

let stripeClient = null;

/** Lazily constructs the Stripe client so the app can boot without a key
 * configured yet (payments routes will return a clear error instead of a crash). */
export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  }
  return stripeClient;
}
