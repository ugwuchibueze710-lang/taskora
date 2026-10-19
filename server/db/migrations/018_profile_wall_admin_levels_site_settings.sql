-- Three independent additions, bundled in one migration since they shipped
-- together:
--
-- 1. profiles.bio -- a short freeform "about me" shown on the new public
--    profile wall page (client: /u/:id). Separate from providers.description
--    (a provider's *business* blurb, shown on their storefront) -- a person
--    can have both a personal bio and, if they're also a provider, a
--    business description; they serve different audiences and pages.
--
-- 2. users.admin_level -- the app's single flat role check (role = 'admin',
--    see migration 017 and middleware/auth.js) grows a second dimension.
--    NULL for a non-admin (and, going forward, newly-promoted admins get 1
--    by default -- see admin.routes.js's /promote). 1 = "basic admin": the
--    existing day-to-day support/moderation actions every admin already had
--    (suspend/reactivate users & providers, disputes, support threads,
--    reviews, etc). 2 = everything level 1 can do, PLUS deleting a user
--    account, the new Site Settings panel, and exclusive rights to grant or
--    revoke admin status and level-2 status itself (see requireLevel2Admin
--    in middleware/auth.js) -- so a level-1 admin can never hand out more
--    power than they themselves have.
--
--    CHECK allows NULL (a non-admin has no level) or exactly 1/2; it does
--    NOT enforce "admin_level is set whenever role = 'admin'" at the DB
--    layer -- middleware/auth.js's requireLevel2Admin treats a NULL level on
--    an admin account as level 1 (the safe default), so a legacy admin row
--    from before this migration (taskora@admin1.com, migration 017, and any
--    account promoted via the old /promote route before this change) simply
--    starts out as level 1 rather than erroring or needing a backfill.
--
-- 3. site_settings -- a tiny generic key/value store (JSONB value, so one
--    table serves every future setting without another migration) backing
--    the level-2-only "Site Settings" admin panel: homepage hero
--    headline/subtitle, an optional site-wide announcement banner, and a
--    manual "pin these categories as featured" override for the home page
--    (see services/category-demand.service.js and services/site-settings.service.js).
--    No row for a key means "use the app's hardcoded default" -- the public
--    GET /api/site-settings endpoint only ever returns what's actually been
--    set, and the client applies its own fallback for anything missing.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;

ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_level SMALLINT CHECK (admin_level IN (1, 2));

CREATE TABLE IF NOT EXISTS site_settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The one explicitly-requested bootstrap promotion for this migration:
-- israelhugo636@gmail.com becomes a level-2 admin the moment a users row
-- for that email exists -- whether that row already existed before this
-- migration ran, or is created later by a normal signup. This UPDATE
-- handles "already exists" right now; requireAuth's bootstrap-promotion
-- check (middleware/auth.js) handles "signs up later", so this works
-- regardless of signup order. No-op (touches 0 rows) if the email hasn't
-- signed up yet at migration time, which is expected and fine.
UPDATE users SET role = 'admin', admin_level = 2, updated_at = now() WHERE email = 'israelhugo636@gmail.com';
