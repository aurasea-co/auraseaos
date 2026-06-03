-- Migration 037: branch_rate_recommendations
--
-- New canonical storage for daily per-room-type rate recommendations.
-- Replaces the older blended single-row model (which had no table — the
-- recommendation lived only in-flight on the morning-flash job → LINE
-- brief). With this table:
--   - One row per (branch, metric_date, room_type) ← unique
--   - All money in **satang** bigint (1 THB = 100 satang) so prices that
--     historically rounded to whole baht can later split half-baht
--     pricing without a schema change.
--   - 'all' is NOT a valid room_type — recommendations are always
--     per-room-type. Property-level signals (weekend opportunity,
--     competitor undercut) live on hotel_signals if/when that table
--     lands; this table is strictly rate suggestions.
--
-- Read path (RateDesk dashboard, morning-flash brief):
--   select * from branch_rate_recommendations
--   where branch_id = $1 and metric_date = current_date
--   order by ... (left to caller, usually by impact desc)
--
-- Write path (morning-flash job after the engine runs):
--   upsert on (branch_id, metric_date, room_type)
--   with the engine's PerRoomTypeRate output projected to satang.

create table if not exists branch_rate_recommendations (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,

  -- Bangkok-day this recommendation applies to. The morning-flash job
  -- writes for "today" (the BKK calendar date when the brief fires); the
  -- engine internally targets "tomorrow's rate" so the owner reads "for
  -- tonight" / "for tomorrow's check-in" semantics consistently.
  metric_date date not null,

  -- Actual room type label from accommodation_daily_metrics.room_type_
  -- breakdown jsonb (e.g. "Deluxe2", "Suite"). NEVER 'all' — property-
  -- wide blended recs are explicitly out of scope (the brief showed
  -- ฿748 blended for a 4-type Crystal Resort, meaningless). The hard
  -- constraint below blocks it at the DB level.
  room_type text not null check (room_type <> 'all'),

  -- Both in satang. bigint not int — even though current/suggested fit
  -- in int4 for THB-rounded values, satang is 100× and we'd rather not
  -- redo the schema when a prop nudges past 21M THB / 2.1B satang.
  current_rate_satang   bigint not null check (current_rate_satang   >= 0),
  suggested_rate_satang bigint not null check (suggested_rate_satang >= 0),

  -- direction is the engine's classification:
  --   - increase: suggested > current; the bubble draws ↑ green
  --   - hold:     suggested = current; the bubble draws "คงเดิม / hold"
  --   - decrease: suggested < current; the bubble draws ↓ red
  -- Constrained so the brief renderer can switch exhaustively without a
  -- "we don't know what to draw" fallback.
  direction text not null check (direction in ('increase', 'hold', 'decrease')),

  -- Short bilingual reason strings ("Occupancy 88% สูง — แนะนำขึ้น" /
  -- "88% occupancy — suggest raise"). Optional — engine sometimes can't
  -- summarise (sparse data). Brief falls back to a generic line when
  -- both are null.
  reason_th text,
  reason_en text,

  created_at timestamptz not null default now(),

  -- One recommendation per (branch, date, type) — the morning-flash
  -- job upserts on this triple so re-running same-day is idempotent.
  unique (branch_id, metric_date, room_type)
);

-- Hot path: dashboard + brief read "all of today's recs for this
-- branch". Index on (branch_id, metric_date) covers both.
create index if not exists branch_rate_recommendations_branch_date_idx
  on branch_rate_recommendations(branch_id, metric_date desc);

-- Sanity guard: direction must agree with the rate math. Prevents a
-- buggy writer from inserting direction='increase' with suggested ≤
-- current (which would confuse the brief renderer and the approval
-- worker).
alter table branch_rate_recommendations
  drop constraint if exists branch_rate_recommendations_direction_math;
alter table branch_rate_recommendations
  add constraint branch_rate_recommendations_direction_math
  check (
    (direction = 'increase' and suggested_rate_satang >  current_rate_satang) or
    (direction = 'hold'     and suggested_rate_satang =  current_rate_satang) or
    (direction = 'decrease' and suggested_rate_satang <  current_rate_satang)
  );

alter table branch_rate_recommendations enable row level security;

-- Read: any org member of the branch's organization can see recs.
-- Mirrors the pattern from branch_pms_config / competitor_rates so a
-- manager looking at RateDesk sees the same numbers as the owner.
-- Revenue gating (canSeeRevenue) is applied at the UI layer; the row
-- itself carries rate data, not revenue, so RLS doesn't need to be
-- tighter.
create policy "org members read rate recommendations"
  on branch_rate_recommendations
  for select
  using (
    branch_id in (
      select b.id
      from branches b
      join organization_members m on m.organization_id = b.organization_id
      where m.user_id = auth.uid()
    )
  );

-- Write: only the service role (morning-flash job) writes recs.
-- Direct user writes are blocked — owners can't manufacture
-- recommendations for tonight to game an approval flow.
create policy "no direct insert by users"
  on branch_rate_recommendations
  for insert
  with check (false);

create policy "no direct update by users"
  on branch_rate_recommendations
  for update
  using (false);

create policy "no direct delete by users"
  on branch_rate_recommendations
  for delete
  using (false);

-- Super admin escape hatch (mirrors audit_log / rate_approvals).
create policy "super admin all rate recommendations"
  on branch_rate_recommendations
  for all
  using (public.is_super_admin());
