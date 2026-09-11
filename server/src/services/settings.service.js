import { query } from '../lib/db.js';

/** Tiny generic app-settings store -- see migration 015_agency.sql. */
export async function getSetting(key, fallback = null) {
  const { rows } = await query('SELECT value FROM app_settings WHERE key = $1', [key]);
  return rows[0] ? rows[0].value : fallback;
}

export async function setSetting(key, value, adminUserId = null) {
  const { rows } = await query(
    `INSERT INTO app_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = now()
     RETURNING *`,
    [key, JSON.stringify(value), adminUserId]
  );
  return rows[0];
}

// The Agency master switch -- checked at the top of every automatic agent
// entry point (support auto-triage, error capture) so flipping it off stops
// all of it instantly, with no deploy and no further Groq usage. Defaults
// to false (see migration) if the row is somehow missing.
export async function isAgencyEnabled() {
  return (await getSetting('agency_enabled', false)) === true;
}
