-- Migration 034: menu_items + fnb_daily_sales + fnb_daily_rollup view
--
-- The F&B half of Aurasea's ingestion contract. Builds the SKU-grained
-- data layer that future POS adapters (Loyverse, FoodStory, Storehub)
-- write into. Coexists with the existing fnb_daily_metrics table —
-- granularities are deliberately different:
--
--   fnb_daily_metrics  — manual aggregate entry (covers, sales, cost
--                         from the owner-typed daily form). One row
--                         per (branch, date).
--   menu_items         — branch's menu catalog. One row per SKU. Stable
--                         identifier so fnb_daily_sales can FK to it.
--   fnb_daily_sales    — POS-grained sales facts. One row per
--                         (branch, date, menu_item_id).
--   fnb_daily_rollup   — view that aggregates fnb_daily_sales × menu_items
--                         into per-day totals matching the shape of
--                         fnb_daily_metrics so dashboards / engine can
--                         consume either source uniformly.
--
-- Reconciliation: when both fnb_daily_metrics and fnb_daily_sales exist
-- for the same (branch, date), they may disagree (manual entry vs POS
-- truth). Future audit work will surface the delta; this migration just
-- ships the schema so both can coexist.
--
-- Money: THB integers throughout. No satang. Matches AURASEA_HOUSE_STYLE.md.
-- price_thb and cost_thb are integer columns (no fractional baht in
-- restaurant pricing in this market).

-- ── menu_items ─────────────────────────────────────────────────────────────

create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,

  -- POS-side stable identifier. Lets the adapter match incoming rows
  -- to existing catalog entries without depending on the display name
  -- (which owners rename). Nullable because manual / spreadsheet
  -- imports won't carry one — those match by (branch_id, name).
  external_item_id text,

  -- Display name as it appears on the menu / receipt. UNIQUE within
  -- the branch so the matcher can fall back to name when
  -- external_item_id is null. Case-sensitive at the DB level; the
  -- adapter is responsible for normalising before write if needed.
  name text not null,

  -- Optional category label. Free-text by design — POS systems carry
  -- wildly different category schemas and forcing a fixed list would
  -- friction onboarding.
  category text,

  price_thb integer not null check (price_thb >= 0),

  -- COGS per unit. Nullable because many POS systems don't expose
  -- cost data; when null the roll-up's food_cost_pct is null too.
  cost_thb integer check (cost_thb is null or cost_thb >= 0),

  -- Soft-delete: owners archive items rather than hard-delete because
  -- historical fnb_daily_sales rows still reference them. is_active
  -- is the catalog visibility flag; the FK from fnb_daily_sales stays
  -- intact regardless.
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (branch_id, name),
  unique (branch_id, external_item_id)
);

create index if not exists menu_items_branch_idx
  on menu_items(branch_id)
  where is_active = true;

-- Auto-updated_at trigger (same pattern as branch_pms_config).
create or replace function set_menu_items_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists menu_items_updated_at on menu_items;
create trigger menu_items_updated_at
  before update on menu_items
  for each row execute function set_menu_items_updated_at();

alter table menu_items enable row level security;

create policy "org members read menu_items"
  on menu_items
  for select
  using (
    branch_id in (
      select b.id
      from branches b
      join organization_members m on m.organization_id = b.organization_id
      where m.user_id = auth.uid()
    )
  );

-- Owners + managers can write (manager edits the menu day-to-day,
-- e.g. seasonal items, price changes).
create policy "owners managers write menu_items"
  on menu_items
  for all
  using (
    branch_id in (
      select b.id
      from branches b
      join organization_members m on m.organization_id = b.organization_id
      where m.user_id = auth.uid()
        and m.role in ('owner', 'manager')
    )
  );

create policy "super admin all menu_items"
  on menu_items
  for all
  using (public.is_super_admin());


-- ── fnb_daily_sales ────────────────────────────────────────────────────────
--
-- One row per (branch, date, menu_item). The unique constraint means
-- a POS adapter can upsert idempotently — re-running the same import
-- for the same day is safe.
--
-- We DON'T store price or cost on this row. The catalog (menu_items)
-- is the source of truth for SKU economics; sales facts only carry
-- the volume. Trade-off: if an owner changes a menu_items.price_thb
-- on Wednesday, Monday's rollup will recompute against the new price.
-- This is OK for current-state economic analysis (RevPAR-style daily
-- numbers stay coherent with current pricing) but if you ever need
-- "what did we ACTUALLY charge that day" you'd add a price_thb
-- snapshot column here. Deferred until the use case appears.

create table if not exists fnb_daily_sales (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  date date not null,
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  units_sold integer not null check (units_sold >= 0),

  -- Optional provenance: which adapter / source wrote this row.
  -- Matches CanonicalFnbDay.source values in /lib/ingestion/types.ts.
  source text check (source in ('loyverse', 'foodstory', 'storehub', 'csv', 'manual')),

  created_at timestamptz not null default now(),

  unique (branch_id, date, menu_item_id)
);

create index if not exists fnb_daily_sales_branch_date_idx
  on fnb_daily_sales(branch_id, date desc);

-- Composite index supporting the roll-up's join (date filter + FK).
create index if not exists fnb_daily_sales_menu_item_idx
  on fnb_daily_sales(menu_item_id);

alter table fnb_daily_sales enable row level security;

create policy "org members read fnb_daily_sales"
  on fnb_daily_sales
  for select
  using (
    branch_id in (
      select b.id
      from branches b
      join organization_members m on m.organization_id = b.organization_id
      where m.user_id = auth.uid()
    )
  );

-- Insert / update: only the service role (POS adapter / API route).
-- Manual UI writes go through fnb_daily_metrics, not this table.
create policy "no direct user writes to fnb_daily_sales"
  on fnb_daily_sales
  for insert
  with check (false);

create policy "no direct user updates fnb_daily_sales"
  on fnb_daily_sales
  for update
  using (false);

create policy "owners delete fnb_daily_sales"
  on fnb_daily_sales
  for delete
  using (
    branch_id in (
      select b.id
      from branches b
      join organization_members m on m.organization_id = b.organization_id
      where m.user_id = auth.uid() and m.role = 'owner'
    )
  );

create policy "super admin all fnb_daily_sales"
  on fnb_daily_sales
  for all
  using (public.is_super_admin());


-- ── fnb_daily_rollup VIEW ──────────────────────────────────────────────────
--
-- Per-day economic summary computed from fnb_daily_sales × menu_items.
-- Sits next to fnb_daily_metrics conceptually but reads from a
-- different source. Consumers (engine, dashboard, exports) can pull
-- from either depending on what's populated for that (branch, date).
--
-- food_cost_pct is null when ANY item sold that day lacks cost_thb.
-- Half-known cost data would be misleading (numerator missing some
-- items' costs while denominator includes their revenue) — better to
-- surface "unknown" than a half-truth.

create or replace view fnb_daily_rollup as
select
  s.branch_id,
  s.date,
  sum(s.units_sold * m.price_thb)::bigint as total_revenue_thb,
  -- COGS is the sum of (units × cost) ONLY when every item carries a
  -- cost. The CASE catches any null cost in the day; if any null is
  -- present, the WHOLE day's cogs is null (and food_cost_pct cascades).
  case
    when bool_and(m.cost_thb is not null)
      then sum(s.units_sold * coalesce(m.cost_thb, 0))::bigint
    else null
  end as total_cogs_thb,
  case
    when bool_and(m.cost_thb is not null) and sum(s.units_sold * m.price_thb) > 0
      then round(
        (sum(s.units_sold * coalesce(m.cost_thb, 0))::numeric /
         sum(s.units_sold * m.price_thb)::numeric) * 100,
        2
      )
    else null
  end as food_cost_pct,
  -- Total covers isn't derivable from item sales (one cover can buy
  -- N items). Future enhancement: a separate fnb_daily_covers table
  -- or column for POS-reported cover counts. For now the view returns
  -- null and consumers fall back to fnb_daily_metrics.total_customers
  -- when they need covers.
  null::integer as total_covers
from fnb_daily_sales s
join menu_items m on m.id = s.menu_item_id
group by s.branch_id, s.date;

-- Views inherit RLS from their underlying tables (in PostgREST /
-- Supabase setups). No separate policy needed — the join through
-- menu_items + fnb_daily_sales already enforces org scoping via the
-- branches lookup chain.

comment on view fnb_daily_rollup is
  'Per-day F&B economic summary aggregated from fnb_daily_sales × menu_items. '
  'Coexists with fnb_daily_metrics (manual entry) for branches that have a '
  'POS adapter writing item-level sales. food_cost_pct is null when any item '
  'sold that day lacks a cost_thb value.';
