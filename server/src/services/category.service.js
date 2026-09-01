// Central category catalog logic. Every route that needs to list, search, or
// resolve a category by free text goes through this file — there is no
// second copy of this logic anywhere else in the server.
import { query, withTransaction } from '../lib/db.js';
import { CATEGORY_GROUPS, CATEGORIES } from '../data/categories.data.js';

const GROUP_ICONS = {
  'home-services': '🛠️',
  'yard-outdoor': '🌳',
  automotive: '🚗',
  'delivery-errands': '📦',
  'personal-assistance': '🙋',
  technology: '💻',
  'beauty-personal-care': '💇',
  events: '🎉',
  pets: '🐾',
  family: '🍼',
  'senior-care': '🦯',
  business: '📈',
  'moving-transport': '🚚',
  other: '✨',
};

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Upserts CATEGORY_GROUPS and CATEGORIES from the central data file into the
 * database. Safe to run on every server boot: it's a pure upsert keyed by
 * slug, it never deletes a category (so it can never orphan a provider's
 * existing selections), and it never touches user/provider data. This is
 * what "releases" the category system in a fresh (or newly migrated)
 * database with zero manual steps — no npm run seed, no admin console, no
 * direct DB access required.
 */
export async function syncCategoryCatalog() {
  await withTransaction(async (client) => {
    const groupIds = {};
    for (const [i, g] of CATEGORY_GROUPS.entries()) {
      const { rows } = await client.query(
        `INSERT INTO category_groups (slug, name, sort_order) VALUES ($1, $2, $3)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order
         RETURNING id`,
        [g.slug, g.name, i]
      );
      groupIds[g.slug] = rows[0].id;
    }

    for (const [i, c] of CATEGORIES.entries()) {
      const slug = c.id || slugify(c.name);
      const groupId = groupIds[c.group] || null;
      const icon = GROUP_ICONS[c.group] || '🛠️';
      await client.query(
        `INSERT INTO categories (slug, name, icon, sort_order, group_id, description, image_url, keywords, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           group_id = EXCLUDED.group_id,
           description = EXCLUDED.description,
           image_url = COALESCE(EXCLUDED.image_url, categories.image_url),
           keywords = EXCLUDED.keywords,
           sort_order = EXCLUDED.sort_order,
           is_active = true`,
        [slug, c.name, icon, i, groupId, c.description || null, c.image || null, c.keywords || []]
      );
    }
  });

  const { rows } = await query('SELECT count(*)::int AS count FROM categories WHERE is_active = true');
  return { groups: CATEGORY_GROUPS.length, categories: CATEGORIES.length, activeInDb: rows[0].count };
}

/**
 * Resolves free text (a typed category name, an AI-extracted category
 * guess, an alias like "locked out") to a single best-matching active
 * category id, or null. Matches on name first (exact, then substring), then
 * falls back to the keyword alias list. Used by: the AI search assistant's
 * category resolution, and the plain-text "did you mean this category"
 * lookup.
 */
export async function resolveCategoryByText(text) {
  const needle = (text || '').trim().toLowerCase();
  if (!needle) return null;

  const exact = await query(
    `SELECT id, name, slug FROM categories WHERE is_active = true AND lower(name) = $1 LIMIT 1`,
    [needle]
  );
  if (exact.rows[0]) return exact.rows[0];

  const byName = await query(
    `SELECT id, name, slug FROM categories WHERE is_active = true AND lower(name) LIKE $1
     ORDER BY length(name) ASC LIMIT 1`,
    [`%${needle}%`]
  );
  if (byName.rows[0]) return byName.rows[0];

  const byKeyword = await query(
    `SELECT id, name, slug FROM categories
      WHERE is_active = true AND EXISTS (
        SELECT 1 FROM unnest(keywords) k WHERE lower(k) = $1 OR $1 LIKE '%' || lower(k) || '%' OR lower(k) LIKE '%' || $1 || '%'
      )
      ORDER BY length(name) ASC LIMIT 1`,
    [needle]
  );
  return byKeyword.rows[0] || null;
}

/**
 * Text search across category name + keyword aliases, for the category
 * search box (home page, provider setup picker, category directory).
 */
export async function searchCategories(text, { limit = 200 } = {}) {
  const needle = (text || '').trim().toLowerCase();
  if (!needle) {
    const { rows } = await query(
      `SELECT c.*, g.slug AS group_slug, g.name AS group_name
         FROM categories c LEFT JOIN category_groups g ON g.id = c.group_id
        WHERE c.is_active = true ORDER BY g.sort_order NULLS LAST, c.sort_order, c.name LIMIT $1`,
      [limit]
    );
    return rows;
  }
  const { rows } = await query(
    `SELECT c.*, g.slug AS group_slug, g.name AS group_name
       FROM categories c LEFT JOIN category_groups g ON g.id = c.group_id
      WHERE c.is_active = true
        AND (lower(c.name) LIKE $1 OR EXISTS (SELECT 1 FROM unnest(c.keywords) k WHERE lower(k) LIKE $1))
      ORDER BY g.sort_order NULLS LAST, c.sort_order, c.name LIMIT $2`,
    [`%${needle}%`, limit]
  );
  return rows;
}

/** Full directory grouped by section, for the home page and "See All Services". */
export async function listCategoryGroupsWithCategories() {
  const { rows } = await query(
    `SELECT c.*, g.id AS group_id_resolved, g.slug AS group_slug, g.name AS group_name, g.sort_order AS group_sort_order
       FROM categories c LEFT JOIN category_groups g ON g.id = c.group_id
      WHERE c.is_active = true
      ORDER BY g.sort_order NULLS LAST, c.sort_order, c.name`
  );
  const groups = new Map();
  for (const row of rows) {
    const key = row.group_slug || 'other';
    if (!groups.has(key)) {
      groups.set(key, { slug: key, name: row.group_name || 'Other', sortOrder: row.group_sort_order ?? 999, categories: [] });
    }
    groups.get(key).categories.push({
      id: row.id,
      slug: row.slug,
      name: row.name,
      icon: row.icon,
      description: row.description,
      imageUrl: row.image_url,
      keywords: row.keywords,
    });
  }
  return [...groups.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}
