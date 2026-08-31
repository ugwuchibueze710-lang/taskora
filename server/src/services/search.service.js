import { query } from '../lib/db.js';
import { distanceMiles } from './mapbox.service.js';

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
 */
export async function searchProviders(filters = {}) {
  const { categoryId, keywords = [], lat, lng, dayOfWeek, budgetMax, limit = 20, offset = 0 } = filters;

  const { rows: candidates } = await query(
    `SELECT p.*, u.first_name, u.last_name,
        COALESCE(array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL), '{}') AS category_names,
        COALESCE(array_agg(DISTINCT c.id) FILTER (WHERE c.id IS NOT NULL), '{}') AS category_ids,
        COALESCE(array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL), '{}') AS service_names
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

    const haystack = [
      p.business_name,
      p.display_name,
      p.description,
      ...(p.category_names || []),
      ...(p.service_names || []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    let relevance = 0;
    if (kw.length) {
      const matches = kw.filter((k) => haystack.includes(k)).length;
      relevance = (matches / kw.length) * 40;
      if (matches === 0) continue; // no keyword relevance at all -> not a match
    } else {
      relevance = categoryId ? 30 : 15; // category-only or browse search
    }

    let distance = null;
    if (lat != null && lng != null && p.base_lat != null && p.base_lng != null) {
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
    const proBonus = p.is_pro ? 8 : 0;
    const boostBonus = p.is_boosted ? 12 : 0;

    const totalScore = relevance + distanceScore + ratingScore + completenessScore + jobsScore + recentActivityScore + proBonus + boostBonus;

    scored.push({ provider: p, distance, score: totalScore });
  }

  scored.sort((a, b) => b.score - a.score);
  const page = scored.slice(offset, offset + limit);

  return {
    total: scored.length,
    results: page.map(({ provider, distance, score }) => formatCard(provider, distance, score)),
  };
}

function formatCard(p, distance, score) {
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
    isPro: p.is_pro,
    isSponsored: p.is_boosted,
    pricingMode: p.pricing_mode,
    priceAmount: p.pricing_mode === 'hidden' ? null : p.price_amount,
    completedJobs: p.completed_jobs_count,
    matchScore: Math.round(score),
  };
}
