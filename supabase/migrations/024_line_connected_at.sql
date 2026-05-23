-- Track when a user connected their LINE account. Useful for support
-- ("did this user ever link?") and for showing a "Connected since X"
-- line on /settings/notifications later.

ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS line_notify_connected_at TIMESTAMPTZ;
