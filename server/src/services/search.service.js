import { query } from '../lib/db.js';
import { distanceMiles } from './mapbox.service.js';
import { computeProviderTier, TIER_LABEL } from './provider-tier.service.js';

/**
 * Core provider search + ranking. This is the single source of truth for
 * "who shows up" — used by both the plain category/keyword search and the
 * Groq natural-language search (Groq only ever produces the *filters*
 * passed in here; it never invents or reorders results itself).
 *
 * filters: {
 *   categoryId, keywords: string[], lat, lng, dayOfWeek (0-6), budgetMax,
 *   limit, offset
 * }
 *
 * RANKING RULE (see provider-tier.service.js for the shared tier logic used
 * identically here and in the admin dashboard):
 *   1. Eligibility first — category/keyword relevance, location radius,
 *      availability, and budget all gate whether a provider appears at all.
 *   2. Among eligible providers, PRIORITY TIER always wins over a lower tier,
 *      regardless of score: an active-Pro provider outranks every provider
 *      still in their free window, who in turn outranks every provider whose
 *      free window has expired without subscribing.
 *   3. Within the same tier, providers are ordered by a rating-weighted score
 *      (plus relevance/distance/completeness/etc. as secondary signals) — a
 *      lower-rated Pro provider never jumps ahead of a higher-rated Pro
 *      provider just because both are paying.
 */
export async function searchProviders(filters = {}) {
  const { categoryId, keywords = [], lat, lng, dayOfWeek, budgetMax, limit = 20, offset = 0 } = filters;

  const { rows: candidates } = await query(
    `SELECT p.*, u.first_name, u.last_name,
        COALESCE(array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL), '{}') AS category_names,
        COALESCE(array_agg(DISTINCT c.id) FILTER (WHERE c.id IS NOT NULL), '{}') AS category_ids,
        COALESCE(array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL), '{}') AS service_names,
        COALESCE(
          (SELECT array_agg(DISTINCT kw) FROM categories c2
             JOIN provider_categories pc2 ON pc2.category_id = c2.id
             CROSS JOIN LATERAL unnest(c2.keywords) AS kw
            WHERE pc2.provider_id = p.id),
          '{}'
        ) AS category_keywords,
        EXISTS (
          SELECT 1 FROM subscriptions sub
           WHERE sub.provider_id = p.id AND sub.status = 'active'
             AND (sub.current_period_end IS NULL OR sub.current_period_end > now())
        ) AS has_active_pro
      FROM providers p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN provider_categories pc ON pc.provider_id = p.id
      LEFT JOIN categories c ON c.id = pc.category_id
      LEFT JOIN provider_services ps ON ps.provider_id = p.id
      LEFT JOIN services s ON s.id = ps.service_id
     WHERE p.status = 'active'
     GROUP BY p.id, u.first_name, u.last_name`
  );

  const kw = keywords.map((k) => k.toLowerCase().trim()).filter(Boolean);

  // Prefetch availability once (avoids N+1 queries against the candidate set).
  let availableProviderDaySet = null;
  if (dayOfWeek != null) {
    const { rows: availRows } = await query(
      'SELECT DISTINCT provider_id FROM provider_availability WHERE day_of_week = $1',
      [dayOfWeek]
    );
    availableProviderDaySet = new Set(availRows.map((r) => r.provider_id));
  }

  const scored = [];
  for (const p of candidates) {
    if (categoryId && !p.category_ids.includes(categoryId)) continue;

    // Two haystacks, scored separately: a provider's own business name +
    // description is what THEY say they do (the strongest, most trustworthy
    // signal for "does this provider actually offer what the customer asked
    // for" — e.g. a description mentioning "clogged toilets" for a plumbing
    // request), while the catalog haystack (assigned categories/services/
    // category keyword aliases) is the structured, curated signal. Both
    // count toward eligibility; business name/description gets extra weight
    // on top so a provider who explicitly describes the requested job ranks
    // above one who merely shares an incidental word with the query.
    const nameDescHaystack = [p.business_name, p.display_name, p.description]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const catalogHaystack = [...(p.category_names || []), ...(p.service_names || []), ...(p.category_keywords || [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    let relevance = 0;
    if (kw.length) {
      const nameDescMatches = kw.filter((k) => nameDescHaystack.includes(k)).length;
      const catalogMatches = kw.filter((k) => catalogHaystack.includes(k)).length;
      const anyMatches = kw.filter((k) => nameDescHaystack.includes(k) || catalogHaystack.includes(k)).length;
      if (anyMatches === 0) continue; // no keyword relevance at all -> not a match
      relevance = (catalogMatches / kw.length) * 30 + (nameDescMatches / kw.length) * 25;
    } else {
      relevance = categoryId ? 30 : 15; // category-only or browse search
    }

    let distance = null;
    if (lat != null && lng != null) {
      // The customer has a real location to filter by. A provider who never
      // configured a base location/service area has no coordinates to compute
      // a distance against -- treating that as "skip the filter" (the previous
      // behavior) let such providers match every search nationwide regardless
      // of where the customer is, which defeats the entire point of
      // location-based matching (found via a real production report: a
      // provider based in Evansville, IN was showing up for a Texas search).
      // Fail closed instead: no configured location means not eligible for a
      // location-scoped search. A customer with no location set is unaffected
      // (nothing to filter against either way), same as before.
      if (p.base_lat == null || p.base_lng == null) continue;
      distance = distanceMiles(lat, lng, p.base_lat, p.base_lng);
      if (distance > (p.service_radius_miles || 15)) continue; // outside their travel radius
    }
    const distanceScore = distance == null ? 7 : Math.max(0, 15 - (distance / (p.service_radius_miles || 15)) * 15);

    if (dayOfWeek != null && p.availability_mode === 'custom' && !availableProviderDaySet.has(p.id)) {
      continue; // customer needs this day and provider isn't available
    }

    if (budgetMax != null && p.pricing_mode !== 'hidden' && p.price_amount != null && Number(p.price_amount) > budgetMax) {
      continue;
    }

    const ratingScore = (Number(p.rating_avg) / 5) * 15 * Math.min(1, p.rating_count / 5 + 0.3);
    const completenessScore = (p.profile_completeness / 100) * 5;
    const jobsScore = Math.min(5, Math.log2((p.completed_jobs_count || 0) + 1));
    const recentActivityScore = p.last_active_at && Date.now() - new Date(p.last_active_at).getTime() < 1000 * 60 * 60 * 24 * 14 ? 5 : 0;
    const boostBonus = p.is_boosted ? 12 : 0;

    // Tier is a hard priority gate (see provider-tier.service.js): a provider
    // in a higher tier always outranks every provider in a lower tier,
    // regardless of score. Score only breaks ties *within* the same tier —
    // it must never be large enough to let a lower tier out-rank a higher
    // one, which is why tier is sorted as a separate, primary key below
    // rather than folded into the score as a bonus.
    const tier = computeProviderTier(p);
    const withinTierScore = relevance + distanceScore + ratingScore + completenessScore + jobsScore + recentActivityScore + boostBonus;

    scored.push({ provider: p, distance, tier, score: withinTierScore });
  }

  scored.sort((a, b) => a.tier - b.tier || b.score - a.score);
  const page = scored.slice(offset, offset + limit);

  return {
    total: scored.length,
    results: page.map(({ provider, distance, tier, score }) => formatCard(provider, distance, tier, score)),
  };
}

function formatCard(p, distance, tier, score) {
  return {
    id: p.id,
    name: p.business_name || p.display_name || `${p.first_name} ${p.last_name}`,
    imageUrl: p.image_url,
    description: p.description,
    categories: p.category_names,
    services: p.service_names,
    rating: Number(p.rating_avg),
    reviewCount: p.rating_count,
    distanceMiles: distance != null ? Math.round(distance * 10) / 10 : null,
    availabilityMode: p.availability_mode,
    isPro: p.has_active_pro,
    tier: TIER_LABEL[tier],
    isSponsored: p.is_boosted,
    pricingMode: p.pricing_mode,
    priceAmount: p.pricing_mode === 'hidden' ? null : p.price_amount,
    completedJobs: p.completed_jobs_count,
    matchScore: Math.round(score),
  };
}
