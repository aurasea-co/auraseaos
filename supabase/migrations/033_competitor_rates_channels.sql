-- Migration 033: competitor_rates — add channel + free-text source + notes
--
-- Why: the existing schema stores ONE rate per (competitor, room type,
-- date), which conflates four very different concepts:
--   - OTA rate (what guests see on Agoda/Booking)
--   - Walk-in rate (front-desk price)
--   - Package rate (room + breakfast etc.)
--   - Promo rate (flash sale, early bird)
-- Multi-channel tracking lets the engine filter to OTA-only for
-- competitive-position signals (that's what guests actually compare),
-- while preserving walk-in / package / promo data for future analytics.
--
-- Backward-compat: every existing row gets channel='ota' as default —
-- which is what the manual-entry UI was implicitly capturing anyway
-- (owners check Agoda/Booking when they fill /settings/competitors).
-- No data loss, no migration script needed for existing rows.
--
-- source: migration 029 created this column as a CHECK-constrained enum
-- ('manual', 'scrape', 'email_report') describing HOW the rate was
-- ingested. The new design needs source to instead describe WHERE the
-- rate was seen ('Agoda', 'Booking.com', 'Phone call', etc) — free
-- text. Drop the CHECK and re-purpose the column. Old rows with
-- source='manual' stay readable; new writes will use specific labels.

alter table competitor_rates
  add column if not exists channel text not null default 'ota'
    check (channel in ('ota', 'walk_in', 'package', 'promo'));

alter table competitor_rates
  add column if not exists notes text;

-- Drop the old CHECK constraint on source to allow free-text labels.
-- The constraint name follows Postgres's default naming
-- (competitor_rates_source_check) — defensive `if exists` keeps the
-- migration idempotent across environments.
alter table competitor_rates
  drop constraint if exists competitor_rates_source_check;

-- Idempotency unique on (branch, competitor, room_type, channel,
-- captured_at) — adding channel to the key so a re-entry of the
-- walk-in rate doesn't clobber the same day's OTA rate (or vice
-- versa). Drop and re-create rather than ALTER (Postgres doesn't
-- support adding columns to an existing unique constraint).
alter table competitor_rates
  drop constraint if exists competitor_rates_unique_daily;

alter table competitor_rates
  add constraint competitor_rates_unique_daily
  unique (branch_id, competitor_name, room_type, channel, captured_at);

-- Index already exists from migration 029 (idx_competitor_rates_branch_date)
-- — no new index needed for the channel column since the dashboard
-- queries all channels and filters in the engine.
