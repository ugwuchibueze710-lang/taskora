-- Extends the category system into a real, centralized marketplace catalog:
-- section grouping (Home Services, Automotive, ...), descriptions, images,
-- and search-alias keywords — without touching the existing provider_categories
-- / provider_services relationships, which already correctly support
-- unlimited categories per provider.

CREATE TABLE IF NOT EXISTS category_groups (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(80) UNIQUE NOT NULL,
  name        VARCHAR(120) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0
);

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS group_id    INT REFERENCES category_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS image_url   TEXT,
  ADD COLUMN IF NOT EXISTS keywords    TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_categories_group ON categories(group_id);
-- GIN index so "does this category's keyword list contain X" is fast even
-- with hundreds of categories.
CREATE INDEX IF NOT EXISTS idx_categories_keywords ON categories USING GIN (keywords);
-- Trigram-free but still fast prefix/substring search on name for the
-- category search box (works without pg_trgm, which may not be installed).
CREATE INDEX IF NOT EXISTS idx_categories_name_lower ON categories (lower(name));
