-- The "Agency" system: an AI-assisted layer, surfaced in a new admin
-- dashboard tab, that (a) auto-answers simple customer-support questions,
-- (b) captures server errors and drafts a diagnosis, (c) proposes
-- one-click admin actions for clearly-safe cases, and (d) queues anything
-- it can't safely resolve itself -- as either an admin approval or a full
-- breakdown for the human software engineer to paste to Claude.
--
-- Deliberately its own table rather than overloading admin_actions/
-- audit_events: those are flat "this already happened" logs. Agency items
-- have a lifecycle (open -> approved/rejected/resolved/auto_resolved) and
-- carry fields (engineer_prompt, proposed_action) neither existing table
-- has a column for.
CREATE TABLE agency_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'support_auto_reply' | 'support_escalation' | 'error_diagnosis' |
  -- 'action_suggestion'
  kind             VARCHAR(40) NOT NULL,
  -- 'open' | 'approved' | 'rejected' | 'resolved' | 'auto_resolved'
  status           VARCHAR(20) NOT NULL DEFAULT 'open',
  -- 'info' | 'warning' | 'critical'
  severity         VARCHAR(10) NOT NULL DEFAULT 'info',
  title            TEXT NOT NULL,
  -- Short human-readable explanation of what happened / what's proposed.
  summary          TEXT,
  -- Structured payload: stack trace, request context, classification, etc.
  detail           JSONB,
  -- A fully-formed prompt ready to paste to Claude, populated whenever this
  -- item needs a human software engineer rather than an admin-panel click.
  engineer_prompt  TEXT,
  related_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  -- {actionType, targetType, targetId, params} -- present only for items an
  -- admin can resolve with a single Approve click via a fixed, reversible
  -- allowlist (see agency.service.js applyProposedAction). Never contains
  -- anything that moves money or edits source code -- those always go
  -- through engineer_prompt / manual admin flows instead.
  proposed_action  JSONB,
  -- Error capture is deduplicated by this signature (route + error message)
  -- so one repeating failure produces one growing item, not a flood.
  dedupe_key       TEXT,
  occurrence_count INT NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at      TIMESTAMPTZ,
  resolved_by      UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_agency_items_status ON agency_items(status, created_at DESC);
CREATE INDEX idx_agency_items_kind ON agency_items(kind, created_at DESC);
-- Partial + unique so an open error keeps bumping the same row; once
-- resolved, the same signature recurring later opens a fresh item instead
-- of silently reopening a closed one an admin already dealt with.
CREATE UNIQUE INDEX idx_agency_items_open_dedupe ON agency_items(dedupe_key) WHERE status = 'open' AND dedupe_key IS NOT NULL;

-- A tiny, generic key/value store for app-wide toggles -- starting with the
-- Agency master switch (see settings.service.js). Deliberately its own
-- table rather than an env var: an env var needs a Render redeploy to
-- change, while this needs to flip instantly from the admin dashboard with
-- no deploy at all.
CREATE TABLE app_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Defaults OFF: this account's Groq key is on the Free plan (30 req/min,
-- 8,000 tokens/min, shared with Smart Search and the AI assistant), so the
-- agents should only start spending that budget once a human deliberately
-- flips the switch in the Agency tab -- never silently the moment this
-- migration runs.
INSERT INTO app_settings (key, value) VALUES ('agency_enabled', 'false'::jsonb);
