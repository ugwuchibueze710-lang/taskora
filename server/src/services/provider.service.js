import { query } from '../lib/db.js';

/** Ensures a (draft) provider row exists for this user and returns its id. */
export async function ensureProviderRecord(userId) {
  const existing = await query('SELECT id FROM providers WHERE user_id = $1', [userId]);
  if (existing.rows[0]) return existing.rows[0].id;
  const { rows } = await query(
    `INSERT INTO providers (user_id, display_name)
     SELECT $1, first_name || ' ' || last_name FROM users WHERE id = $1
     RETURNING id`,
    [userId]
  );
  return rows[0].id;
}

/** Computes a 0-100 profile completeness score used in search ranking. */
export async function recomputeCompleteness(providerId) {
  const { rows } = await query(
    `SELECT p.*,
            (SELECT count(*) FROM provider_categories WHERE provider_id = p.id) AS cat_count,
            (SELECT count(*) FROM provider_services WHERE provider_id = p.id) AS svc_count,
            (SELECT count(*) FROM provider_photos WHERE provider_id = p.id) AS photo_count
       FROM providers p WHERE p.id = $1`,
    [providerId]
  );
  const p = rows[0];
  if (!p) return 0;
  let score = 0;
  if (p.cat_count > 0) score += 25;
  if (p.svc_count > 0) score += 20;
  if (p.description && p.description.trim().length > 10) score += 15;
  if (p.image_url) score += 15;
  if (p.photo_count > 0) score += 10;
  if (p.business_phone) score += 5;
  if (p.availability_mode === 'custom' || p.availability_mode === 'always') score += 10;
  score = Math.min(100, score);
  await query('UPDATE providers SET profile_completeness = $1, updated_at = now() WHERE id = $2', [score, providerId]);
  return score;
}
