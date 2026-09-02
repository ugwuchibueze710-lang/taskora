-- Migration 009 shipped assuming production had ZERO users with role =
-- 'admin' (true at the time it was written). But when 009 actually ran in
-- production, its `IF NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')`
-- guard came back FALSE -- an admin-role row already existed -- so 009
-- correctly skipped inserting a second one. The problem: that existing
-- admin row's status isn't 'active' (most likely suspended from earlier
-- admin-panel testing), and both login paths require status = 'active'
-- (auth.routes.js's normal login, and the adminBypass shortcut's own
-- `user.status !== 'active'` check), so the admin login stayed completely
-- broken even after 009 shipped.
--
-- First, clean up a one-off side effect of diagnosing this: while checking
-- whether 009's insert had run, a probe signup was made against
-- owner@taskora-admin.internal (the email 009 would have used) to see if it
-- was already taken. It wasn't, which is exactly what proved 009 never
-- inserted -- but the probe signup itself created a real, empty, throwaway
-- account under that email. Remove that one specific row (matched by email
-- AND name so this can never touch anything else) before it can collide
-- with anything below.
DELETE FROM users
 WHERE email = 'owner@taskora-admin.internal'
   AND first_name = 'Probe'
   AND last_name = 'Test';

-- Reactivate whichever admin-role account already exists, whatever its
-- email, rather than fighting over a specific address again.
UPDATE users SET status = 'active' WHERE role = 'admin' AND status <> 'active';

-- Safety net: if it turns out there's genuinely no admin-role row at all
-- (e.g. this runs against a fresh database where 009 already did its job),
-- create one the same way 009 does.
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
