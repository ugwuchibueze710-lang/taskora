-- General "Contact Taskora" support messaging: one running, linear thread per
-- user (both directions -- the user's messages and Taskora's replies -- live
-- in the same table, ordered by created_at). This is deliberately separate
-- from the existing `disputes` table: disputes are job-scoped reports that
-- require an active/completed job with a specific provider (see
-- dispute.routes.js's getJobForUser gate and JobDetailPage.jsx's canDispute),
-- while this channel is always available to every logged-in user regardless
-- of mode or job history, for general customer-service questions.
CREATE TABLE support_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender        VARCHAR(10) NOT NULL CHECK (sender IN ('user', 'admin')),
  body          TEXT NOT NULL,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_messages_user_time ON support_messages(user_id, created_at);

-- One-time admin bootstrap account, per explicit owner request (no admin
-- account existed on production yet). Hashed with the same bcryptjs
-- cost-12 scheme auth.routes.js's signup handler uses. ON CONFLICT DO
-- NOTHING makes this idempotent across re-deploys/re-runs, and it never
-- touches the row again after creation -- if the owner changes this
-- account's password through the app, a later deploy will not reset it.
--
-- Login: admin@taskora.com / 1996 -- change this password after first
-- login; it was chosen by the owner and is not a strong password.
-- Mirrors auth.routes.js's signup handler exactly (users + profiles +
-- user_settings rows) so this account behaves like any normal account
-- everywhere else in the app (e.g. GET /profile) rather than 500ing on a
-- missing row -- gated in a DO block so the profiles/user_settings inserts
-- are skipped too when the account already exists (re-deploys, or the
-- email was already taken by a real signup).
DO $$
DECLARE
  new_user_id UUID;
BEGIN
  INSERT INTO users (first_name, last_name, email, password_hash, role)
  VALUES ('Taskora', 'Admin', 'admin@taskora.com', '$2a$12$xX9C7J1.i2SIkvqeo6eLQeBrfHDPAfvju.Xdioy1axu/5XfdPrnEu', 'admin')
  ON CONFLICT (email) DO NOTHING
  RETURNING id INTO new_user_id;

  IF new_user_id IS NOT NULL THEN
    INSERT INTO profiles (user_id) VALUES (new_user_id);
    INSERT INTO user_settings (user_id, default_approach_message)
    VALUES (new_user_id, 'Hi, I''m interested in your services and would like to discuss a project with you.');
  END IF;
END $$;
