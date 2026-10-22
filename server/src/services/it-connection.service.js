import { query } from '../lib/db.js';
import { encrypt, decrypt, randomToken, sha256Hex, safeEqual } from '../lib/crypto.js';

const KEY_PREFIX_LEN = 10;

/**
 * Generates a new connection key, revoking whatever key was live before it
 * (one live key at a time -- matches "paste one key" in BDT's Site
 * Protocol doc; a replaced key just means the admin generates a fresh one
 * and pastes it into BDT's "Replace key" instead). Only the hash is
 * stored -- the plaintext is returned once, here, and never again.
 */
export async function createConnectionKey(adminUserId) {
  const secret = `itk_${randomToken(32)}`;
  await query(`UPDATE it_connection_keys SET revoked_at = now() WHERE revoked_at IS NULL`);
  await query(`INSERT INTO it_connection_keys (key_hash, key_prefix, created_by) VALUES ($1, $2, $3)`, [
    sha256Hex(secret),
    secret.slice(0, KEY_PREFIX_LEN),
    adminUserId,
  ]);
  return secret;
}

export async function revokeConnectionKey() {
  await query(`UPDATE it_connection_keys SET revoked_at = now() WHERE revoked_at IS NULL`);
}

/** Used by the /api/it/bdt/* protocol routes to authenticate BDT's calls. */
export async function verifyConnectionKey(secret) {
  if (!secret || !secret.startsWith('itk_')) return false;
  const { rows } = await query(
    `SELECT id, key_hash FROM it_connection_keys WHERE revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`
  );
  const row = rows[0];
  if (!row || !safeEqual(row.key_hash, sha256Hex(secret))) return false;
  await query(`UPDATE it_connection_keys SET last_used_at = now() WHERE id = $1`, [row.id]);
  return true;
}

export async function getConnectionStatus() {
  const { rows: keyRows } = await query(
    `SELECT key_prefix, created_at, last_used_at FROM it_connection_keys WHERE revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`
  );
  const { rows: linkRows } = await query(
    `SELECT bdt_url, bdt_site_id, connected_at, disconnected_at FROM it_bdt_link WHERE id = true`
  );
  const link = linkRows[0];
  const key = keyRows[0];
  return {
    hasActiveKey: Boolean(key),
    keyPrefix: key?.key_prefix || null,
    keyCreatedAt: key?.created_at || null,
    keyLastUsedAt: key?.last_used_at || null,
    connected: Boolean(link?.connected_at && !link?.disconnected_at),
    bdtUrl: link?.bdt_url || null,
    connectedAt: link?.connected_at || null,
  };
}

/** Saved during the /connect handshake (see routes/it.routes.js). */
export async function saveBdtLink({ url, siteId, secret }) {
  await query(
    `UPDATE it_bdt_link SET bdt_url = $1, bdt_site_id = $2, bdt_secret_enc = $3, connected_at = now(), disconnected_at = NULL WHERE id = true`,
    [url, siteId, encrypt(secret)]
  );
}

export async function clearBdtLink() {
  await query(`UPDATE it_bdt_link SET disconnected_at = now() WHERE id = true`);
}

/** Read by lib/bdt-connector.js to sign pushes to BDT. Null until connected. */
export async function getBdtLink() {
  const { rows } = await query(
    `SELECT bdt_url, bdt_site_id, bdt_secret_enc, connected_at, disconnected_at FROM it_bdt_link WHERE id = true`
  );
  const row = rows[0];
  if (!row || !row.bdt_url || !row.connected_at || row.disconnected_at) return null;
  return { url: row.bdt_url, siteId: row.bdt_site_id, secret: decrypt(row.bdt_secret_enc) };
}
