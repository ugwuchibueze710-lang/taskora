-- Adds yearly billing support to Taskora Pro. Existing monthly subscriptions
-- are unaffected: this column is nullable and defaults to 'month' so every
-- existing row is correctly interpreted as a monthly plan without a backfill.
ALTER TABLE subscriptions
  ADD COLUMN billing_interval VARCHAR(10) NOT NULL DEFAULT 'month'
    CHECK (billing_interval IN ('month', 'year'));
