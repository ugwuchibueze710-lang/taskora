-- "Instant Match" -- a customer posts one project description instead of
-- messaging providers one at a time, and it's auto-broadcast to the top
-- matching providers (search.service.js's existing searchProviders ranking,
-- completely unchanged) as real quote requests. This is a NEW, parallel
-- entry point alongside the existing "message a specific provider" flow --
-- nothing about that flow changes. Every quote_request this creates is a
-- perfectly normal row created by quote.service.js's existing
-- createQuoteRequest() (also unchanged), so providers see it in their
-- existing inbox with zero changes to any provider-facing code.
CREATE TABLE project_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id     INT REFERENCES categories(id) ON DELETE SET NULL,
  description     TEXT NOT NULL,
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  location_label  VARCHAR(200),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_project_posts_customer ON project_posts(customer_id, created_at DESC);

-- Nullable, additive tag linking a quote_request back to the project post
-- that auto-generated it. NULL for every quote_request created the normal
-- way (the existing single-provider "message + request a quote" flow) --
-- that flow's INSERT never sets this column, so its behavior is completely
-- untouched. Only used to group a project's quote_requests together for the
-- new side-by-side quote comparison view.
ALTER TABLE quote_requests ADD COLUMN project_post_id UUID REFERENCES project_posts(id) ON DELETE SET NULL;
CREATE INDEX idx_quote_requests_project_post ON quote_requests(project_post_id);
