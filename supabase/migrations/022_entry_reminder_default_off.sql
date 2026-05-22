-- Default entry_reminder_enabled to false so newly-created
-- notification_settings rows don't ping a freshly-joined user at
-- 10:00 PM the same day they accept their invitation. /api/invite/accept
-- already passes entry_reminder_enabled: false explicitly; this
-- migration covers any other call path that inserts without specifying.

ALTER TABLE notification_settings
  ALTER COLUMN entry_reminder_enabled SET DEFAULT false;
