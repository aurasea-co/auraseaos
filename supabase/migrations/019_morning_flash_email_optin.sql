-- Make the morning-flash email channel opt-in.
-- LINE delivery is the default channel for morning flash; users who want
-- the email as well must have this column set to true per organization.
--
-- New columns default to false (opt-out). The backfill below preserves
-- prior behavior for existing users — anyone who already had the master
-- email toggle on is auto-opted-in to the morning-flash email so they
-- don't silently stop receiving it after the migration runs.
ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS morning_flash_email_enabled boolean NOT NULL DEFAULT false;

-- Backfill: existing email-enabled users keep their morning-flash email.
-- Idempotent — running this migration again is a no-op for already-opted-in
-- rows. New users created after the migration get the column default (false).
UPDATE notification_settings
SET morning_flash_email_enabled = true
WHERE email_notifications = true
  AND morning_flash_email_enabled = false;
