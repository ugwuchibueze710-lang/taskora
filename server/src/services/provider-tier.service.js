// Single source of truth for "what priority tier is this provider in right
// now". Used by search.service.js (ranking) and the admin dashboard
// (visibility) so the business rule is defined exactly once.
//
// Tier 0 — Priority: an actually-active, currently-paid-for Stripe
//          subscription (checked against real subscription state, not a
//          denormalized flag alone — see has_active_pro in search.service.js
//          and getProviderTier() below).
// Tier 1 — Free distribution: no active subscription, but still within six
//          months of the provider's publish date. This is the free
//          algorithmic-distribution period every new provider gets.
// Tier 2 — Non-priority: no active subscription and the six-month window
//          (measured from publish date, never reset by edits/logins/category
//          changes) has passed.
export const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 182;

export const TIER = {
  PRIORITY: 0,
  FREE_DISTRIBUTION: 1,
  NON_PRIORITY: 2,
};

export const TIER_LABEL = {
  [TIER.PRIORITY]: 'priority',
  [TIER.FREE_DISTRIBUTION]: 'free_distribution',
  [TIER.NON_PRIORITY]: 'non_priority',
};

/**
 * @param {{ has_active_pro?: boolean, published_at?: string|Date|null }} provider
 *   `has_active_pro` must reflect real subscription state (see the EXISTS
 *   subquery in search.service.js, or use hasActiveProSubscription() below
 *   when you only have a plain providers row).
 */
export function computeProviderTier(provider) {
  if (provider.has_active_pro) return TIER.PRIORITY;
  const publishedAt = provider.published_at ? new Date(provider.published_at).getTime() : null;
  const inFreeWindow = publishedAt != null && Date.now() - publishedAt < SIX_MONTHS_MS;
  return inFreeWindow ? TIER.FREE_DISTRIBUTION : TIER.NON_PRIORITY;
}

export function freeDistributionEndsAt(publishedAt) {
  if (!publishedAt) return null;
  return new Date(new Date(publishedAt).getTime() + SIX_MONTHS_MS);
}

/** True if a subscription row represents currently-active, unexpired billing. */
export function isSubscriptionCurrentlyActive(subscriptionRow) {
  if (!subscriptionRow || subscriptionRow.status !== 'active') return false;
  if (!subscriptionRow.current_period_end) return true;
  return new Date(subscriptionRow.current_period_end).getTime() > Date.now();
}
