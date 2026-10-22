-- Taskora's side of BDT's "Site Protocol v1" (bdt-website's
-- docs/SITE-PROTOCOL.md): generate one connection key here in the admin
-- IT tab, paste it once into BDT Admin -> Websites -> Add a website ->
-- Connect with API key. That single paste connects both directions --
-- BDT pulls status/issues from this site, and this site pushes crash
-- reports to BDT the moment they happen. No environment variables, no
-- redeploy.

-- The key(s) Taskora hands out. Only a hash is stored -- the plaintext key
-- is shown exactly once, right after it's generated. Only one is "live"
-- (not revoked) at a time, matching the one-key-at-a-time model in the
-- protocol doc; generating a new one revokes the previous one.
CREATE TABLE it_connection_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash     TEXT NOT NULL UNIQUE,
  key_prefix   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_at   TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);

-- Singleton row holding the credentials BDT handed back during the
-- /connect handshake (its own url/siteId/secret) -- used to sign the
-- real-time pushes to BDT's /api/connect/* endpoints. bdt_secret_enc is
-- encrypted at rest (see lib/crypto.js); nothing here is ever sent to a
-- browser.
CREATE TABLE it_bdt_link (
  id              BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  bdt_url         TEXT,
  bdt_site_id     TEXT,
  bdt_secret_enc  TEXT,
  connected_at    TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ
);
INSERT INTO it_bdt_link (id) VALUES (true);
