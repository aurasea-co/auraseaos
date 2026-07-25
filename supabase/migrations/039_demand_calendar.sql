-- Migration 039: demand_calendar
--
-- Shared, cross-vertical calendar of holidays/festivals/local events.
-- Lives at the spine level (not under RateDesk or MenuDesk) — both
-- verticals will read it: a public holiday or local festival shifts
-- expected demand for hotels and restaurants alike.
--
-- Scope model:
--   - organization_id + branch_id both NULL  -> GLOBAL row (public
--     holiday, curated national festival). Visible to every tenant.
--   - organization_id set, branch_id NULL    -> applies to every
--     branch in that org (e.g. "company closed this day").
--   - organization_id + branch_id both set   -> scoped to one branch
--     (e.g. a local street festival near just that property).
--
-- No CLI migration flow — paste this file's contents into the Supabase
-- SQL editor and run it manually (see CLAUDE.md's "No CLI migrations"
-- note). This file is kept in the repo as documentation/history only,
-- matching every other migration here.
--
-- Design decisions made (see the discovery + proposal that preceded
-- this migration for the full reasoning):
--   (a) Geography = branches.province (free text) — branches has no
--       lat/long or structured region. Only 2 of 5 live branches have
--       province populated today; provincial rows simply won't match
--       branches that haven't set it. National rows (province IS NULL)
--       are unaffected by this gap.
--   (b) start_date + end_date (not a single date) — supports multi-day
--       events like Songkran. Single-day events set end_date = start_date.
--   (c) name_th + name_en both NOT NULL — matches this codebase's
--       consistent dual-language convention (every bilingual message
--       pair elsewhere is always populated together, never partial).
--   (d) expected_impact is a SIGNED, CLAMPED NUMERIC MODIFIER only — no
--       parallel categorical level column. A stored "low/medium/high"
--       would duplicate/derive from the numeric value and could drift
--       out of sync; a UI badge should bucket the numeric value at
--       render time instead of reading a second, separately-writable
--       column.
--   (e) RLS: global rows readable by any authenticated user, writable
--       only by super_admin; tenant rows readable by org OR branch
--       membership (never scoped by owner user_id — the known trap),
--       writable only by the owner.

create table if not exists demand_calendar (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid references organizations(id) on delete cascade,
  branch_id uuid references branches(id) on delete cascade,

  -- Multi-day support (Songkran = 3 days); single-day events set
  -- end_date = start_date.
  start_date date not null,
  end_date date not null check (end_date >= start_date),

  type text not null check (type in ('public_holiday', 'school_holiday', 'festival', 'local_event', 'owner_event')),

  name_th text not null,
  name_en text not null,

  -- Matches branches' existing free-text geography columns (see design
  -- decision (a) above). NULL = applies nationwide; a value matches
  -- branches.province.
  province text,

  -- Bounded demand signal for a future recommendation modifier. Signed,
  -- clamped, nullable — an event can exist on the calendar for
  -- awareness before anyone has assessed its magnitude. See design
  -- decision (d) above for why there's no companion categorical column.
  expected_impact_modifier numeric(3,2) check (expected_impact_modifier between -1.00 and 1.00),

  source text not null check (source in ('public_holiday_lib', 'curated', 'owner_entered', 'events_api_future')),
  confidence numeric(3,2) not null default 1.00 check (confidence between 0 and 1),

  -- Soft-delete convention used throughout this schema (organization_
  -- members, branch_members, branch_pms_config, ...) — no deleted_at
  -- column anywhere in this codebase.
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A row can't have a branch without an org (branch implies org).
  check (branch_id is null or organization_id is not null)
);

-- Date-range lookup ("what's active this week/month"). Plain btree
-- composite, matching this schema's existing convention (no GiST/range
-- types used anywhere else in this codebase).
create index if not exists demand_calendar_date_range_idx
  on demand_calendar (start_date, end_date);

-- Fast path for the global-rows-only lookup every tenant makes.
create index if not exists demand_calendar_global_idx
  on demand_calendar (start_date, end_date) where organization_id is null;

-- Geography lookup (provincial festivals only — most rows have this
-- null, hence the partial index).
create index if not exists demand_calendar_province_idx
  on demand_calendar (province) where province is not null;

create index if not exists demand_calendar_type_idx
  on demand_calendar (type);

create index if not exists demand_calendar_scope_idx
  on demand_calendar (organization_id, branch_id);

alter table demand_calendar enable row level security;

-- Read: any authenticated user sees global rows; org/branch members
-- additionally see their own tenant's rows. One unified policy —
-- mirrors competitor_rates' broadest read shape (org OR branch
-- membership), never scoped by owner user_id.
create policy "read global and own-tenant demand calendar rows"
  on demand_calendar
  for select
  using (
    (auth.uid() is not null and organization_id is null)
    or organization_id in (
      select organization_id from organization_members where user_id = auth.uid()
    )
    or branch_id in (
      select branch_id from branch_members where user_id = auth.uid()
    )
  );

-- Write (tenant rows): owner only, per spec. Note: a global row
-- (organization_id IS NULL) can never satisfy "organization_id in
-- (select ... where role='owner')" for a real user's own orgs — SQL's
-- NULL-IN semantics reject it — so this policy can't be used to sneak
-- a global row in under a tenant's own write access. No extra guard
-- needed for that, but worth knowing why.
create policy "owners write their own tenant demand calendar rows"
  on demand_calendar
  for all
  using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role = 'owner'
    )
  );

-- Write (global rows): super admin only. Mirrors the escape-hatch
-- pattern used on every other table in this schema (competitor_rates,
-- branch_pms_config, branch_rate_recommendations, ...).
create policy "super admin all demand calendar"
  on demand_calendar
  for all
  using (public.is_super_admin());

-- Auto-updated_at trigger, matching branch_pms_config's precedent.
create or replace function set_demand_calendar_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger demand_calendar_updated_at
  before update on demand_calendar
  for each row
  execute function set_demand_calendar_updated_at();
