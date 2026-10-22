import crypto from 'crypto';

// Small, dependency-free helpers for the IT/BDT connector: encrypting
// BDT's push secret at rest (lib/bdt-connector.js, services/it-connection
// .service.js) and hashing/comparing the connection keys Taskora hands
// out. Deliberately requires no new environment variable -- the
// encryption key is derived from a secret this app already has
// configured, so the whole IT-connector feature really does need "no
// environment variables, no redeploy" as the protocol doc promises.
function deriveKey() {
  const material =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.DATABASE_URL || process.env.STRIPE_SECRET_KEY || 'taskora-it-connector-fallback';
  return crypto.createHash('sha256').update(`taskora-it-encryption-v1:${material}`).digest();
}

export function encrypt(text) {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decrypt(payload) {
  const key = deriveKey();
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function hmacHex(secret, input) {
  return crypto.createHmac('sha256', secret).update(input).digest('hex');
}

export function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
