-- Migration 040: branch_rate_recommendations calendar context columns
--
-- Persists the Tier 1 "Calendar & Context" forward demand signal that
-- classifyCalendarContext() already computes per row (see
-- PerRoomTypeRate.calendarContext in src/lib/recommendations/hotel/
-- engine.ts) but which was previously dropped before persistence — the
-- engine asserted it in tests, but upsertBranchRateRecommendations()
-- never wrote it and no column existed to hold it. This closes that gap
-- so a future brief-copy change has a real field to read.
--
-- No CLI migration flow — paste this file's contents into the Supabase
-- SQL editor and run it manually (see CLAUDE.md's "No CLI migrations"
-- note).
--
-- Design: numeric modifier + reason text only, no parallel categorical
-- "level" column — mirrors demand_calendar's migration 039 design note
-- (d). `level` is cheap to re-derive from the modifier at read time
-- (see deriveCalendarDemandLevel in src/lib/demand-calendar/classify.ts)
-- and storing it separately risks drifting out of sync with the
-- modifier if the thresholds ever change.
--
-- All three columns are nullable: a row where the calendar modifier
-- didn't fire for that date (the common case) writes NULL, matching
-- PerRoomTypeRate.calendarContext being absent in that case.

alter table branch_rate_recommendations
  add column if not exists calendar_modifier numeric(4,3),
  add column if not exists calendar_reason_th text,
  add column if not exists calendar_reason_en text;
