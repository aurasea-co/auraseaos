-- Migration 036: write-back capability + per-room approvals
--
-- Two related additions for the RateDesk Auto Push flow:
--
-- 1. branch_pms_config.supports_write_back
--    Capability flag advertised by the adapter the branch has connected.
--    Source of truth for "can we actually push a rate back to this PMS?"
--    Until a real adapter ships, every row defaults to false — so the
--    morning brief's live approve button is correctly suppressed for
--    every existing branch (Crystal Resort included). The /api/branches/
--    [branchId]/pms-config write path is responsible for filling this in
--    from PmsProvider.supportsWriteBack at config time.
--
-- 2. rate_approvals.room_rates jsonb
--    Per-room-type rate set captured at brief time, for multi-room
--    hotels. When NULL the row is a legacy single-room approval (the
--    existing room_type + suggested_rate_thb columns carry it). When
--    non-null the row represents the WHOLE set: one LINE tap = approve
--    all room types listed inside. Shape:
--      [
--        { "roomType": "Suite",    "currentRateThb": 1200,
--          "suggestedRateThb": 1080, "reasonTh": "weekend premium" },
--        { "roomType": "Deluxe5",  "currentRateThb": 950,
--          "suggestedRateThb": 998,  "reasonTh": "demand uptick" },
--        ...
--      ]
--    suggested_rate_thb on the parent row carries the headline (highest-
--    impact) rate so legacy consumers (worker, dashboard list) keep
--    rendering a sensible single number until they're taught to expand
--    the set. Phase R3's PMS worker will iterate room_rates when present.

-- ── branch_pms_config.supports_write_back ─────────────────────────────────

alter table branch_pms_config
  add column if not exists supports_write_back boolean not null default false;

comment on column branch_pms_config.supports_write_back is
  'True when the connected adapter can actually push a rate change back to the PMS. '
  'Sourced from PmsProvider.supportsWriteBack at config-set time. Until a real '
  'adapter (Cloudbeds/Mews/SiteMinder/Opera) ships, this is false for every row, '
  'so the LINE brief''s live approve button is correctly suppressed.';

-- ── rate_approvals.room_rates ─────────────────────────────────────────────

alter table rate_approvals
  add column if not exists room_rates jsonb;

comment on column rate_approvals.room_rates is
  'Per-room-type rate set for multi-room-type hotels. NULL = legacy single-room '
  'approval (use room_type + suggested_rate_thb). Non-null = the whole set; one '
  'LINE tap approves every entry inside. Shape: array of {roomType, currentRateThb, '
  'suggestedRateThb, reasonTh}.';

-- Sanity-check constraint: when room_rates is set, it must be a JSON array.
-- A single-room hotel still leaves this NULL, so the constraint is only
-- active for genuinely multi-room rows.
alter table rate_approvals
  drop constraint if exists rate_approvals_room_rates_is_array;
alter table rate_approvals
  add constraint rate_approvals_room_rates_is_array
  check (room_rates is null or jsonb_typeof(room_rates) = 'array');
