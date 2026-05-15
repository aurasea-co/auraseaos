-- Safety net for environments where notification_log was created before
-- the `channel` column was part of the canonical schema (014 defined it
-- as text NOT NULL, but some older instances pre-date that). The route
-- code now distinguishes per-channel dedup, so the column must exist.
-- Idempotent: no-op when the column is already present.
ALTER TABLE notification_log
  ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'email';
