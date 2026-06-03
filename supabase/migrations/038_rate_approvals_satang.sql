-- Migration 038: rate_approvals → satang + multi-row token sharing
--
-- Two coupled changes the per-room-type rate flow needs:
--
-- 1. SATANG COLUMN
--    suggested_rate_thb (integer baht) is being phased out in favour of
--    suggested_rate_satang (bigint, 1 THB = 100 satang) so prices that
--    historically rounded to whole baht can later carry half-baht
--    pricing without another migration. Both columns coexist during the
--    handover:
--      - Writers populate BOTH (satang from the engine, thb derived as
--        round(satang/100)) so old readers (push-approved-rates cron)
--        keep working until they're updated.
--      - Readers prefer suggested_rate_satang when present; fall back to
--        suggested_rate_thb * 100 when null (legacy rows from before
--        this migration).
--    suggested_rate_thb is INTENTIONALLY NOT dropped here — drop after
--    every read site has been updated and the column has been null on
--    new inserts for a complete deploy cycle. Tracked in
--    AURASEA_README.md / a follow-up migration.
--
-- 2. MULTI-ROW TOKEN SHARING
--    The per-room flow creates ONE approval row per recommended room
--    type, with room_type = the actual type ('Suite', 'Deluxe2', etc.),
--    sharing a single token so a single LINE tap approves the whole set.
--    The original schema had `token uuid unique` — that has to relax:
--      - Drop the unique constraint on token.
--      - Replace with a unique constraint on (token, room_type) so the
--        same set can't accidentally carry two rows for the same type.
--      - Keep the index on token (non-unique) for the click-time lookup.
--    Legacy single-row approvals (room_type='all' or 'multi') continue
--    to work — they're just sets of size 1.
--
-- Back-compat: the existing room_rates jsonb column from migration 036
-- becomes orphaned (the per-row layout obviates it). NOT dropped here;
-- new writers leave it NULL so reads of legacy rows still work.

-- ── 1. SATANG COLUMN ──────────────────────────────────────────────────

alter table rate_approvals
  add column if not exists suggested_rate_satang bigint check (suggested_rate_satang >= 0);

comment on column rate_approvals.suggested_rate_satang is
  'Approved rate in satang (1 THB = 100 satang). Preferred over '
  'suggested_rate_thb for new code. Both columns coexist during the '
  'phaseout; writers populate both, readers prefer satang and fall back '
  'to thb * 100 when satang is null (legacy rows).';

-- Backfill: every existing row's satang value = thb × 100.
-- Uses where clause to skip rows that already have satang set so
-- re-running this migration during dev is idempotent.
update rate_approvals
   set suggested_rate_satang = (suggested_rate_thb::bigint * 100)
 where suggested_rate_satang is null
   and suggested_rate_thb is not null;

-- ── 2. MULTI-ROW TOKEN SHARING ────────────────────────────────────────

-- Drop the legacy unique index on token. PostgreSQL named it
-- rate_approvals_token_idx in migration 031 (created as `create unique
-- index ... on rate_approvals(token)`); there's ALSO an implicit unique
-- index from the `token uuid not null default ... unique` column
-- constraint. Drop both safely.
drop index if exists rate_approvals_token_idx;

-- Drop the column-level unique constraint via its system-assigned
-- name. We don't know the name a priori — query pg_constraint to find
-- and drop it. Wrap in DO so it's tolerant when the constraint has
-- already been removed in a prior run.
do $$
declare
  c_name text;
begin
  select conname into c_name
  from pg_constraint
  where conrelid = 'rate_approvals'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) ilike '%(token)%';
  if c_name is not null then
    execute format('alter table rate_approvals drop constraint %I', c_name);
  end if;
end$$;

-- Non-unique lookup index — still the hot path for the approve endpoint.
create index if not exists rate_approvals_token_lookup_idx
  on rate_approvals(token);

-- New uniqueness: (token, room_type). A set can't carry two rows for
-- the same room type, but multiple per-room rows can share one token.
-- Existing single-row approvals satisfy this trivially.
alter table rate_approvals
  drop constraint if exists rate_approvals_token_room_type_unique;
alter table rate_approvals
  add constraint rate_approvals_token_room_type_unique
  unique (token, room_type);

-- Note: room_type='all' is still a valid value for legacy rows but
-- new per-room-type writers must use the actual type. No DB constraint
-- enforces this — the writer (morning-flash route) is responsible.
