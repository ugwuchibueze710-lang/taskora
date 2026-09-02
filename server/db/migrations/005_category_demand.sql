-- Adds the minimum schema needed for a real, per-city featured-category
-- system: a place to store the city a customer's locked location resolves
-- to, and an append-only log of "a category was searched in this city"
-- events to compute genuine local demand from.
--
-- This is intentionally NOT the existing search_history table: that table
-- is a user-facing "my past searches" feature (a customer can view and
-- delete their own rows there), so repurposing it for platform-wide demand
-- analytics would let a user's deletion silently corrupt real demand data,
-- and it would also miss anonymous searches entirely. category_search_events
-- is a separate, additive, analytics-only log — nothing about the existing
-- search_history feature changes.
ALTER TABLE profiles ADD COLUMN location_city VARCHAR(120);

CREATE TABLE category_search_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id  INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  city         VARCHAR(120) NOT NULL,
  searched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Serves the rolling-window aggregation query directly: "top categories for
-- city X within the last N days" filters on (city, searched_at) then groups
-- by category_id — this index covers exactly that access path.
CREATE INDEX idx_category_search_events_city_time ON category_search_events(city, searched_at DESC);
