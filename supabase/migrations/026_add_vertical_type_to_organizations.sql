-- Add the `vertical_type` column the TypeScript types
-- (lib/supabase/types.ts) and two UI surfaces — settings/company and
-- superadmin/companies/[orgId] — already read. Before this migration
-- the column existed only in the types: owner-setup org creation
-- failed with "Could not find the vertical_type column of
-- organizations in the schema cache", and the UI reads silently
-- returned undefined.
--
-- Stored as plain TEXT (no CHECK) to leave room for the historical
-- naming inconsistency between the types ('hybrid') and the form
-- ('mixed') — neither value was load-bearing at the DB level, so we
-- don't lock it down here. Default 'mixed' so existing rows have a
-- sensible value when read.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS vertical_type TEXT DEFAULT 'mixed';

-- Backfill any pre-existing rows (none in prod yet, but defensive).
UPDATE organizations SET vertical_type = 'mixed' WHERE vertical_type IS NULL;
