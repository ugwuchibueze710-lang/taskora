// A tiny generic key/value store backing the level-2-only "Site Settings"
// admin panel (see admin.routes.js's /admin/site-settings and the public
// GET /api/site-settings route) -- one JSONB column means every future
// setting this panel grows into needs no further migration, just a new
// key. No row for a key means "the app's hardcoded default applies" -- this
// module and the public route never fabricate a default themselves, the
// client does, so there is exactly one place (the client) that needs to
// change if a default copy/value changes later.
import { query } from '../lib/db.js';

const CACHE_TTL_MS = 15_000;
let cache = null;
let cacheAt = 0;

export async function getSiteSettings() {
  if (cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache;
  const { rows } = await query('SELECT key, value FROM site_settings');
  const out = {};
  for (const row of rows) out[row.key] = row.value;
  cache = out;
  cacheAt = Date.now();
  return out;
}

export async function getSiteSetting(key) {
  const all = await getSiteSettings();
  return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : null;
}

export async function setSiteSetting(key, value, userId) {
  await query(
    `INSERT INTO site_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_by = $3, updated_at = now()`,
    [key, JSON.stringify(value), userId]
  );
  cache = null; // next read repopulates -- simpler and safer than patching the cache in place
}
