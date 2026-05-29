-- Flip notification_settings.email_notifications DEFAULT from true to
-- false so any future code path that inserts without specifying the
-- column lands at "opted out" rather than "opted in by accident."
--
-- The two call sites that already explicitly write the column
-- (api/invite/accept and api/owner-setup/create-branch) are updated
-- in the same commit to pass `false`, so this default is mostly
-- belt-and-suspenders. It also closes the door on the morning-flash
-- email-send filter, which reads `email_notifications=true` as a
-- prerequisite — going forward, owners and managers must explicitly
-- opt in from /settings/notifications.
--
-- We deliberately do NOT backfill existing rows: those values reflect
-- prior user choice (they could have toggled the setting off via the
-- UI). Flipping them retroactively would override consent.

ALTER TABLE notification_settings
  ALTER COLUMN email_notifications SET DEFAULT false;
