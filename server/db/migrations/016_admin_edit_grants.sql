-- Admin "help finish setup" consent flow.
--
-- An admin can ask to edit a provider's profile on their behalf, but nothing
-- lets them actually touch it until the provider approves from their own
-- dashboard. One row here tracks the whole lifecycle of a single request:
-- pending (waiting on the provider) -> approved (admin has a time-boxed
-- editing window) -> completed (admin finished and closed it out) -- or
-- declined / expired / revoked if it never turns into real access.
--
-- There is no background job in this app (Render free tier, no worker
-- process), so 'pending' and 'approved' are lazily flipped to 'expired' by
-- the service layer on read (see admin-edit-grant.service.js) rather than by
-- a scheduled sweep -- request_expires_at/access_expires_at are the source
-- of truth either way.
CREATE TABLE admin_edit_grants (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id           UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  requested_by_admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status                VARCHAR(20) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','declined','expired','revoked','completed')),
  requested_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at          TIMESTAMPTZ,
  request_expires_at    TIMESTAMPTZ NOT NULL,
  access_expires_at     TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_edit_grants_provider ON admin_edit_grants(provider_id, status);
