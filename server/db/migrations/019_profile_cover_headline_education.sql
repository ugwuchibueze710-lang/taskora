-- Extends the profile wall (added in 018) from "just a name, picture, and
-- bio" into something that reads as an actual professional profile page,
-- per explicit request: a cover photo banner, a one-line headline under the
-- name (e.g. a role/tagline), and a repeatable Education section. Every one
-- of these is optional -- nothing here is NOT NULL except `education`
-- itself, which defaults to an empty JSON array so "no education listed
-- yet" and "this column was never touched" are the same, simple state
-- rather than two things the app has to tell apart.
--
-- `education` is a JSONB array of plain objects
-- ({school, degree, field, startYear, endYear}) rather than its own table.
-- A handful of short, user-entered entries with no relations of their own
-- (nothing else in the schema ever needs to join against "this specific
-- education entry") is exactly the shape site_settings already uses JSONB
-- for elsewhere in this schema -- a dedicated table would mean a new
-- migration every time a field on an entry changes, for data nothing
-- queries by column.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS headline VARCHAR(160);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS education JSONB NOT NULL DEFAULT '[]'::jsonb;
