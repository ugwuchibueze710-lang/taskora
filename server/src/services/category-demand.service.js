// Single source of truth for "how much local demand does this category have
// in this city right now" — used by the home page's featured-categories
// section and the admin category-demand view (server/src/routes/admin.routes.js).
// Every category-resolving search funnels its (categoryId, city) pair
// through recordCategorySearch() below: both the plain category/keyword
// search (search.routes.js) and Groq Smart Search (ai.routes.js) call it,
// so there is exactly one place this business rule is defined, exactly like
// provider-tier.service.js for ranking.
import { query } from '../lib/db.js';

// Business rule, confirmed with the user: a category's demand score in a
// city is its search count over a rolling 30-day window, and the top 5
// categories by that score are "featured" for that city.
export const DEMAND_WINDOW_DAYS = 30;
export const FEATURED_LIMIT = 5;

/**
 * Logs one "this category was searched for in this city" event. Called for
 * both an explicit category browse and a Smart Search query that resolved
 * to a category (never for a bare keyword search with no resolved
 * category, and never for a browse with no known city) — this is the exact
 * counting rule the user confirmed.
 *
 * Fire-and-forget by design: a failure here must never break the actual
 * search response the customer is waiting on, so callers await it but it
 * swallows its own errors after logging them.
 */
export async function recordCategorySearch({ categoryId, city }) {
  if (!categoryId || !city) return;
  try {
    await query('INSERT INTO category_search_events (category_id, city) VALUES ($1, $2)', [categoryId, city]);
  } catch (err) {
    console.error('Failed to record category search demand (non-fatal):', err);
  }
}

// Lazy-recompute-on-read cache: there is no cron/job-scheduler in this
// codebase (by design — see the project notes), and re-aggregating on every
// single homepage load would mean every search subtly reorders the page
// customers are currently looking at, which the user explicitly did not
// want ("not reordering on every single search"). Instead, a city's
// featured list is recomputed at most once per CACHE_TTL_MS and reused for
// every request in between — real demand data, refreshed on a short delay
// rather than a live wire.
const CACHE_TTL_MS = 5 * 60 * 1000;
const featuredCache = new Map(); // city -> { expiresAt, categories }

/**
 * Top categories by real local search demand for a city, joined with the
 * same category fields the rest of the app already displays (icon, image,
 * group). Returns [] for a city with no demand history yet (a brand-new
 * market) rather than inventing placeholder categories — the caller (the
 * home page) falls back to the existing static "first N categories" list
 * in that case, exactly as it already does when no location is set at all.
 */
export async function getFeaturedCategoriesForCity(city, { limit = FEATURED_LIMIT, windowDays = DEMAND_WINDOW_DAYS } = {}) {
  if (!city) return [];

  const cached = featuredCache.get(city);
  if (cached && cached.expiresAt > Date.now()) return cached.categories;

  const { rows } = await query(
    `SELECT c.id, c.slug, c.name, c.icon, c.description, c.image_url, c.keywords,
            g.slug AS group_slug, g.name AS group_name, count(e.id)::int AS search_count
       FROM category_search_events e
       JOIN categories c ON c.id = e.category_id AND c.is_active = true
       LEFT JOIN category_groups g ON g.id = c.group_id
      WHERE e.city = $1 AND e.searched_at > now() - ($2 || ' days')::interval
      GROUP BY c.id, g.slug, g.name
      ORDER BY search_count DESC, c.sort_order ASC
      LIMIT $3`,
    [city, windowDays, limit]
  );

  const categories = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    icon: r.icon,
    description: r.description,
    imageUrl: r.image_url,
    keywords: r.keywords,
    group: r.group_slug ? { slug: r.group_slug, name: r.group_name } : null,
    searchCount: r.search_count,
  }));
  featuredCache.set(city, { expiresAt: Date.now() + CACHE_TTL_MS, categories });
  return categories;
}

/**
 * Per-city demand breakdown for the admin panel (server/src/routes/admin.routes.js):
 * every city with search activity in the window, each with its top
 * categories and counts. Not cached — this is a low-traffic admin-only
 * view, unlike the home page which every customer hits.
 */
export async function getCategoryDemandOverview({ windowDays = DEMAND_WINDOW_DAYS, topPerCity = FEATURED_LIMIT } = {}) {
  const { rows } = await query(
    `SELECT e.city, c.id AS category_id, c.name AS category_name, count(e.id)::int AS search_count
       FROM category_search_events e
       JOIN categories c ON c.id = e.category_id
      WHERE e.searched_at > now() - ($1 || ' days')::interval
      GROUP BY e.city, c.id, c.name
      ORDER BY e.city ASC, search_count DESC`,
    [windowDays]
  );

  const byCity = new Map();
  for (const row of rows) {
    if (!byCity.has(row.city)) byCity.set(row.city, { city: row.city, totalSearches: 0, categories: [] });
    const entry = byCity.get(row.city);
    entry.totalSearches += row.search_count;
    if (entry.categories.length < topPerCity) {
      entry.categories.push({ categoryId: row.category_id, name: row.category_name, searchCount: row.search_count });
    }
  }
  return [...byCity.values()].sort((a, b) => b.totalSearches - a.totalSearches);
}
