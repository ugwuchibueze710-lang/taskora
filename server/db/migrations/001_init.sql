-- Taskora initial schema
-- PostgreSQL. Independent design (no Sharetribe, no Mongo).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- =========================================================================
-- USERS / AUTH / PROFILE
-- =========================================================================

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name      VARCHAR(80) NOT NULL,
  last_name       VARCHAR(80) NOT NULL,
  email           CITEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  role            VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  current_mode    VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (current_mode IN ('customer','provider')),
  status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avatar_url      TEXT,
  location_label  VARCHAR(200),
  location_lat    DOUBLE PRECISION,
  location_lng    DOUBLE PRECISION,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_settings (
  user_id                   UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  default_approach_message  TEXT,
  email_notifications       BOOLEAN NOT NULL DEFAULT true,
  push_notifications        BOOLEAN NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================================
-- CATEGORIES / SERVICES
-- =========================================================================

CREATE TABLE categories (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(80) UNIQUE NOT NULL,
  name        VARCHAR(120) NOT NULL,
  icon        VARCHAR(20) DEFAULT '🛠️',
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_categories_active_sort ON categories(is_active, sort_order);

CREATE TABLE services (
  id                SERIAL PRIMARY KEY,
  category_id       INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name              VARCHAR(160) NOT NULL,
  slug              VARCHAR(160) NOT NULL,
  is_custom         BOOLEAN NOT NULL DEFAULT false,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(category_id, slug)
);
CREATE INDEX idx_services_category ON services(category_id, is_active);

-- =========================================================================
-- PROVIDERS
-- =========================================================================

CREATE TABLE providers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_name         VARCHAR(160),
  display_name          VARCHAR(160),
  image_url             TEXT,
  image_source          VARCHAR(20) NOT NULL DEFAULT 'profile' CHECK (image_source IN ('profile','logo','custom')),
  description           TEXT,
  business_phone        VARCHAR(40),
  status                VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','suspended')),
  availability_mode     VARCHAR(20) NOT NULL DEFAULT 'always' CHECK (availability_mode IN ('always','custom')),
  service_radius_miles  INT NOT NULL DEFAULT 15,
  base_lat              DOUBLE PRECISION,
  base_lng              DOUBLE PRECISION,
  base_location_label   VARCHAR(200),
  auto_reply_enabled    BOOLEAN NOT NULL DEFAULT false,
  auto_reply_message    TEXT,
  pricing_mode          VARCHAR(20) NOT NULL DEFAULT 'hidden' CHECK (pricing_mode IN ('hidden','fixed','starting','hourly')),
  price_amount          NUMERIC(10,2),
  is_pro                BOOLEAN NOT NULL DEFAULT false,
  pro_since             TIMESTAMPTZ,
  is_boosted            BOOLEAN NOT NULL DEFAULT false,
  boosted_since         TIMESTAMPTZ,
  rating_avg            NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count          INT NOT NULL DEFAULT 0,
  completed_jobs_count  INT NOT NULL DEFAULT 0,
  profile_completeness  INT NOT NULL DEFAULT 0,
  last_active_at        TIMESTAMPTZ,
  verified              BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at          TIMESTAMPTZ
);
CREATE INDEX idx_providers_status ON providers(status);
CREATE INDEX idx_providers_location ON providers(base_lat, base_lng);

CREATE TABLE provider_categories (
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  category_id INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (provider_id, category_id)
);
CREATE INDEX idx_provider_categories_cat ON provider_categories(category_id);

CREATE TABLE provider_services (
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  service_id  INT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (provider_id, service_id)
);
CREATE INDEX idx_provider_services_service ON provider_services(service_id);

CREATE TABLE provider_availability (
  id           SERIAL PRIMARY KEY,
  provider_id  UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  day_of_week  INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  UNIQUE(provider_id, day_of_week, start_time, end_time)
);
CREATE INDEX idx_provider_availability_provider ON provider_availability(provider_id);

CREATE TABLE provider_service_areas (
  provider_id   UUID PRIMARY KEY REFERENCES providers(id) ON DELETE CASCADE,
  radius_miles  INT NOT NULL DEFAULT 15,
  is_custom     BOOLEAN NOT NULL DEFAULT false,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE provider_photos (
  id           SERIAL PRIMARY KEY,
  provider_id  UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  caption      VARCHAR(200),
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_provider_photos_provider ON provider_photos(provider_id);

-- =========================================================================
-- SEARCH / FAVORITES
-- =========================================================================

CREATE TABLE search_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query_text      TEXT NOT NULL,
  parsed_filters  JSONB,
  result_count    INT DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_search_history_user ON search_history(user_id, created_at DESC);

CREATE TABLE favorites (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id  UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider_id)
);

CREATE TABLE profile_views (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id    UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  viewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  viewer_key     VARCHAR(120) NOT NULL, -- user id or hashed session/ip, used to dedupe per day
  viewed_on      DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_id, viewer_key, viewed_on)
);
CREATE INDEX idx_profile_views_provider ON profile_views(provider_id, viewed_on);

-- =========================================================================
-- MESSAGING
-- =========================================================================

CREATE TABLE conversations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id    UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(customer_id, provider_id)
);
CREATE INDEX idx_conversations_customer ON conversations(customer_id, last_message_at DESC);
CREATE INDEX idx_conversations_provider ON conversations(provider_id, last_message_at DESC);

CREATE TABLE messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  sender_role       VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (sender_role IN ('user','system')),
  type              VARCHAR(30) NOT NULL DEFAULT 'text' CHECK (type IN
                      ('text','auto_reply','quote_request','quote','job_request','job_update',
                       'payment_update','completion_request','invoice','system')),
  body              TEXT,
  metadata          JSONB,
  read_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_unread ON messages(conversation_id, read_at);

-- =========================================================================
-- QUOTES
-- =========================================================================

CREATE TABLE quote_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  customer_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id      UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  service_id       INT REFERENCES services(id) ON DELETE SET NULL,
  message          TEXT,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','responded','declined','expired','withdrawn')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_quote_requests_provider ON quote_requests(provider_id, status);
CREATE INDEX idx_quote_requests_customer ON quote_requests(customer_id, status);

CREATE TABLE quotes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id  UUID NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  provider_id       UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  price             NUMERIC(10,2) NOT NULL CHECK (price > 0),
  description       TEXT,
  scheduled_date    DATE,
  scheduled_time    TIME,
  notes             TEXT,
  expires_at        TIMESTAMPTZ,
  status            VARCHAR(20) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','accepted','declined','expired','changes_requested')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_quotes_customer ON quotes(customer_id, status);
CREATE INDEX idx_quotes_provider ON quotes(provider_id, status);

-- =========================================================================
-- JOBS
-- =========================================================================

CREATE TABLE jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id            UUID REFERENCES quotes(id) ON DELETE SET NULL,
  customer_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id         UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  category_id         INT REFERENCES categories(id) ON DELETE SET NULL,
  service_description TEXT NOT NULL,
  price               NUMERIC(10,2) NOT NULL CHECK (price > 0),
  platform_fee        NUMERIC(10,2) NOT NULL,
  provider_amount     NUMERIC(10,2) NOT NULL,
  scheduled_date      DATE,
  scheduled_time      TIME,
  status              VARCHAR(30) NOT NULL DEFAULT 'quote_accepted' CHECK (status IN (
                        'quote_requested','quote_sent','quote_accepted','payment_pending','paid',
                        'provider_accepted','in_progress','provider_marked_complete',
                        'customer_confirmed','completed','cancelled','disputed','refunded'
                      )),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ
);
CREATE INDEX idx_jobs_customer ON jobs(customer_id, status);
CREATE INDEX idx_jobs_provider ON jobs(provider_id, status);

CREATE TABLE job_state_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  from_status      VARCHAR(30),
  to_status        VARCHAR(30) NOT NULL,
  changed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_job_state_history_job ON job_state_history(job_id, created_at);

-- =========================================================================
-- PAYMENTS / PAYOUTS (Stripe Connect)
-- =========================================================================

CREATE TABLE provider_stripe_accounts (
  provider_id       UUID PRIMARY KEY REFERENCES providers(id) ON DELETE CASCADE,
  stripe_account_id VARCHAR(120) UNIQUE NOT NULL,
  charges_enabled   BOOLEAN NOT NULL DEFAULT false,
  payouts_enabled   BOOLEAN NOT NULL DEFAULT false,
  details_submitted BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                UUID UNIQUE NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  customer_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id           UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  stripe_payment_intent_id VARCHAR(160) UNIQUE,
  amount_total          NUMERIC(10,2) NOT NULL,
  platform_fee          NUMERIC(10,2) NOT NULL,
  provider_amount       NUMERIC(10,2) NOT NULL,
  currency              VARCHAR(10) NOT NULL DEFAULT 'usd',
  status                VARCHAR(30) NOT NULL DEFAULT 'requires_payment' CHECK (status IN
                          ('requires_payment','processing','succeeded','failed','refunded','partially_refunded')),
  payout_status         VARCHAR(20) NOT NULL DEFAULT 'holding' CHECK (payout_status IN ('holding','released','paid_out','failed','refunded')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_provider ON payments(provider_id);

CREATE TABLE payment_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id       UUID REFERENCES payments(id) ON DELETE CASCADE,
  stripe_event_id  VARCHAR(160) UNIQUE NOT NULL,
  type             VARCHAR(80) NOT NULL,
  payload          JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE provider_payouts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id        UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  payment_id         UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  stripe_transfer_id VARCHAR(160) UNIQUE,
  amount             NUMERIC(10,2) NOT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_provider_payouts_provider ON provider_payouts(provider_id);

-- =========================================================================
-- REVIEWS
-- =========================================================================

CREATE TABLE reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID UNIQUE NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  customer_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id  UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  rating       INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT,
  is_flagged   BOOLEAN NOT NULL DEFAULT false,
  is_hidden    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reviews_provider ON reviews(provider_id, created_at DESC);

CREATE TABLE review_photos (
  id         SERIAL PRIMARY KEY,
  review_id  UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  url        TEXT NOT NULL
);

CREATE TABLE review_responses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id   UUID UNIQUE NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  response    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================================
-- NOTIFICATIONS
-- =========================================================================

CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(60) NOT NULL,
  title      VARCHAR(200) NOT NULL,
  body       TEXT,
  data       JSONB,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at, created_at DESC);

-- =========================================================================
-- INVOICES
-- =========================================================================

CREATE TABLE invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID UNIQUE NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  invoice_number   VARCHAR(40) UNIQUE NOT NULL,
  customer_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id      UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  pdf_path         TEXT NOT NULL,
  amount_total     NUMERIC(10,2) NOT NULL,
  platform_fee     NUMERIC(10,2) NOT NULL,
  provider_amount  NUMERIC(10,2) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================================
-- DISPUTES / CANCELLATIONS
-- =========================================================================

CREATE TABLE disputes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  raised_by_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  against_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  reason              VARCHAR(40) NOT NULL CHECK (reason IN
                        ('not_completed','incomplete','wrong_service','payment_problem','provider_unavailable','other')),
  description         TEXT,
  status              VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (status IN
                        ('open','under_review','resolved_refund','resolved_no_refund','resolved_other','closed')),
  resolution_notes    TEXT,
  resolved_by_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at         TIMESTAMPTZ
);
CREATE INDEX idx_disputes_status ON disputes(status);

CREATE TABLE cancellations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  cancelled_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason              TEXT,
  job_status_before   VARCHAR(30) NOT NULL,
  job_status_after    VARCHAR(30) NOT NULL,
  refund_status       VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (refund_status IN ('none','pending','refunded')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================================
-- SUBSCRIPTIONS (Pro) / BOOSTS
-- =========================================================================

CREATE TABLE subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id            UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  type                   VARCHAR(20) NOT NULL DEFAULT 'pro' CHECK (type IN ('pro')),
  stripe_subscription_id VARCHAR(160) UNIQUE,
  stripe_customer_id     VARCHAR(160),
  status                 VARCHAR(20) NOT NULL DEFAULT 'incomplete' CHECK (status IN ('active','past_due','canceled','incomplete')),
  current_period_end     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_provider ON subscriptions(provider_id);

CREATE TABLE boosts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id            UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  stripe_subscription_id VARCHAR(160) UNIQUE,
  stripe_customer_id     VARCHAR(160),
  status                 VARCHAR(20) NOT NULL DEFAULT 'incomplete' CHECK (status IN ('active','past_due','canceled','incomplete')),
  current_period_end     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_boosts_provider ON boosts(provider_id);

-- =========================================================================
-- ADMIN / AUDIT
-- =========================================================================

CREATE TABLE admin_actions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type    VARCHAR(80) NOT NULL,
  target_type    VARCHAR(40),
  target_id      VARCHAR(80),
  details        JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type  VARCHAR(80) NOT NULL,
  details     JSONB,
  ip_address  VARCHAR(64),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_events_user ON audit_events(user_id, created_at DESC);

-- session table for connect-pg-simple
CREATE TABLE "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);
ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX "IDX_session_expire" ON "session" ("expire");
