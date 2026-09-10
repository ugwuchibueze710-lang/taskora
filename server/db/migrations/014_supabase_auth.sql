-- Supabase Auth migration: credentials move out of our own `users` table and
-- into Supabase Auth's own store. Two changes:
--
-- 1. `supabase_user_id` links a `users` row to its Supabase Auth identity
--    (auth.users.id, a UUID). It's a separate column rather than reusing
--    `users.id` as the join key because Supabase's admin "create user" API
--    always assigns its own id -- it does not accept a caller-supplied one --
--    so a brand-new signup and a migrated legacy account both end up
--    identified by whatever Supabase assigned, looked up via this column.
--    Nullable: a `users` row with no `supabase_user_id` yet is a legacy
--    account that hasn't been linked by the one-time migration script, or
--    (transiently) one that failed to link.
--
-- 2. `password_hash` becomes optional. Supabase Auth now owns password
--    storage entirely; new signups never write this column, so it can no
--    longer be NOT NULL. Left in place (not dropped) as a harmless record of
--    what a legacy account's password hash used to be, in case that history
--    ever matters -- nothing reads it anymore going forward.
ALTER TABLE users ADD COLUMN IF NOT EXISTS supabase_user_id UUID UNIQUE;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
