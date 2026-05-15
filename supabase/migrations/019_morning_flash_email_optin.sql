-- Make the morning-flash email channel opt-in.
-- LINE delivery is the default channel for morning flash; users who want
-- the email as well must have this column set to true per organization.
-- Default false means existing accounts stop receiving the email after
-- this migration runs until they (or an operator) flip the flag.
ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS morning_flash_email_enabled boolean NOT NULL DEFAULT false;
