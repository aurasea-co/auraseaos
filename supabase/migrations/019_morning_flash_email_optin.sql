-- Make the morning-flash email channel opt-in.
-- LINE delivery remains the default channel for morning flash; users who
-- want the email as well must explicitly enable this per organization.
ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS morning_flash_email_enabled boolean NOT NULL DEFAULT false;
