-- Migration 006's admin bootstrap used `ON CONFLICT (email) DO NOTHING`
-- keyed on 'admin@taskora.com'. In production that email was already taken
-- by a pre-existing (non-admin) account from earlier testing, so the whole
-- insert silently no-op'd -- production ended up with ZERO users with
-- role = 'admin', which meant the admin panel, the admin@taskora.com login,
-- and the admin/1996 login shortcut (auth.routes.js's adminBypass, which
-- looks up `WHERE role = 'admin'`) all had nothing to authenticate as.
--
-- This checks the actual invariant we care about -- "does an admin exist at
-- all" -- rather than keying off a specific email that might collide with
-- an unrelated real account, and deliberately does NOT touch whatever
-- already owns admin@taskora.com.
DO $$
DECLARE
  new_user_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin') THEN
    INSERT INTO users (first_name, last_name, email, password_hash, role)
    VALUES ('Taskora', 'Owner', 'owner@taskora-admin.internal', '$2a$12$xX9C7J1.i2SIkvqeo6eLQeBrfHDPAfvju.Xdioy1axu/5XfdPrnEu', 'admin')
    RETURNING id INTO new_user_id;

    INSERT INTO profiles (user_id) VALUES (new_user_id);
    INSERT INTO user_settings (user_id, default_approach_message)
    VALUES (new_user_id, 'Hi, I''m interested in your services and would like to discuss a project with you.');
  END IF;
END $$;
