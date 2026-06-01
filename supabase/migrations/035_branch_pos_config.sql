-- Migration 035: branch_pos_config
--
-- Parallel of branch_pms_config (migration 032) for POS integrations.
-- One row per (branch, provider) pair recording which POS the branch
-- syncs from and the provider-specific identifier (Loyverse store_id,
-- FoodStory shop_id, Storehub outlet_id).
--
-- Directionality vs PMS:
--   PMS:  Aurasea PUSHES rate approvals to the PMS (Cloudbeds, etc).
--   POS:  Aurasea PULLS sales data from the POS into fnb_daily_sales.
-- Different data flow but the same abstraction shape — config row,
-- provider factory, worker. Reuses the spine.
--
-- Credentials NOT stored here. MVP assumes one Aurasea Partner
-- account per POS provider, OAuth credentials in env vars; the
-- branch's external_store_id picks which store within that account
-- to fetch sales from. Per-tenant OAuth (multiple Loyverse customers
-- under different accounts) adds a credentials_ref column later
-- pointing at Supabase Vault — until then, no encryption-at-rest
-- concerns.
--
-- last_synced_at lets the cron worker know when to fetch from
-- (incremental sync) rather than re-pulling the full history every
-- run. Updated by the worker after a successful sync.

create table if not exists branch_pos_config (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,

  provider text not null check (provider in ('loyverse', 'foodstory', 'storehub')),

  -- Provider-specific identifier for this branch's store / outlet.
  external_store_id text not null,

  is_active boolean not null default true,

  -- Latest sync timestamp + status — written by the cron worker.
  -- last_synced_at NULL means this branch has never been synced;
  -- the worker pulls a wider initial window (30 days) on first run
  -- and narrower (since last_synced_at - 1 day for overlap) on
  -- subsequent runs.
  last_synced_at timestamptz,
  last_sync_status text check (last_sync_status in ('success', 'failed', 'skipped')),
  last_sync_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (branch_id, provider)
);

create index if not exists branch_pos_config_branch_idx
  on branch_pos_config(branch_id)
  where is_active = true;

-- Cron worker reads active configs; this partial index keeps the
-- "pull every active config" scan tight.
create index if not exists branch_pos_config_active_idx
  on branch_pos_config(last_synced_at nulls first)
  where is_active = true;

alter table branch_pos_config enable row level security;

create policy "org members read pos config"
  on branch_pos_config
  for select
  using (
    branch_id in (
      select b.id
      from branches b
      join organization_members m on m.organization_id = b.organization_id
      where m.user_id = auth.uid()
    )
  );

create policy "owners write pos config"
  on branch_pos_config
  for all
  using (
    branch_id in (
      select b.id
      from branches b
      join organization_members m on m.organization_id = b.organization_id
      where m.user_id = auth.uid() and m.role = 'owner'
    )
  );

create policy "super admin all pos config"
  on branch_pos_config
  for all
  using (public.is_super_admin());

create or replace function set_branch_pos_config_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists branch_pos_config_updated_at on branch_pos_config;
create trigger branch_pos_config_updated_at
  before update on branch_pos_config
  for each row execute function set_branch_pos_config_updated_at();
