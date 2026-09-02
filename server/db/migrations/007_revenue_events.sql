-- Historical revenue ledger for subscription-driven income (Pro monthly,
-- Pro yearly, Boost), so the admin analytics view can report actual money
-- taken over time broken out by source -- something `subscriptions`/`boosts`
-- alone can't do, since they only track current status/period-end, not a
-- record of each billing cycle actually paid. Job-commission revenue does
-- NOT need a parallel entry here: the existing `payments` table already is
-- that ledger (real amount_total/platform_fee per job, with created_at), and
-- stays the single source of truth for it -- the admin analytics query
-- reads job-commission numbers straight from `payments` and only reads this
-- table for subscription/boost income.
--
-- Starts recording from whenever this migration deploys forward (populated
-- by a new `invoice.paid` Stripe webhook handler) -- it cannot retroactively
-- backfill revenue from before this existed, since Stripe subscription
-- objects don't carry a full invoice history without a separate API call
-- this app doesn't make. In practice this is a non-issue today: the
-- platform has only a handful of users and no confirmed historical
-- subscription revenue yet.
CREATE TABLE revenue_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source            VARCHAR(20) NOT NULL CHECK (source IN ('pro_monthly', 'pro_yearly', 'boost')),
  provider_id       UUID REFERENCES providers(id) ON DELETE SET NULL,
  amount            NUMERIC(10,2) NOT NULL,
  stripe_invoice_id VARCHAR(160) UNIQUE,
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_revenue_events_occurred ON revenue_events(occurred_at);
