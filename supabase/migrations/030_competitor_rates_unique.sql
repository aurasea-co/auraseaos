-- Unique constraint on competitor_rates so the daily upsert from the
-- competitor-rates settings page is idempotent — re-entering today's
-- rate for the same competitor / room type replaces the row instead of
-- piling up duplicates.
--
-- competitor_rates was created in migration 029 without this constraint
-- because at the time there was no UI writing into it. Now the page at
-- /settings/competitors writes one row per (branch, competitor, room
-- type, day); without this constraint a double-submit (or a re-edit
-- on the same day) would insert a second row and the dashboard
-- aggregator would double-count.
--
-- Idempotent: the DROP IF EXISTS + ADD pattern means re-running this
-- migration is a no-op on environments where it already landed.

ALTER TABLE competitor_rates
  DROP CONSTRAINT IF EXISTS competitor_rates_unique_daily;

ALTER TABLE competitor_rates
  ADD CONSTRAINT competitor_rates_unique_daily
  UNIQUE (branch_id, competitor_name, room_type, captured_at);
