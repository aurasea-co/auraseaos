-- Migration 032: branch_pms_config
--
-- One row per (branch, provider) pair. Records which PMS a branch is
-- integrated with and the external identifier (Cloudbeds propertyID,
-- Mews enterpriseId, SiteMinder propertyCode, etc) the PMS uses to
-- address this branch's rates.
--
-- Credentials themselves are NOT stored in this table. The MVP design
-- assumes one Aurasea Partner account per PMS, with the global OAuth
-- client_id/client_secret living in env vars; the branch's
-- external_property_id picks which property within that account to
-- update. When we later need per-tenant OAuth (multiple Cloudbeds
-- customers under different accounts), add a credentials_ref column
-- pointing at Supabase Vault — until then, no encryption-at-rest
-- concerns because no secrets are stored.
--
-- is_active gates the push worker: a branch can be configured but
-- temporarily disabled (e.g. while debugging) without losing the
-- external_property_id.

create table if not exists branch_pms_config (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,

  -- 'cloudbeds' for the MVP; extensible to 'mews', 'siteminder',
  -- 'opera', etc. without schema changes. Constrained to a known
  -- set so a typo can't silently disable pushes.
  provider text not null check (provider in ('cloudbeds', 'mews', 'siteminder', 'opera')),

  -- The provider-specific identifier for this branch's property.
  -- Cloudbeds: propertyID (numeric string). Mews: enterpriseId (uuid).
  external_property_id text not null,

  -- When false, the push worker skips this branch entirely. Used for
  -- staging branches, test mode, or temporary disable during debugging.
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One config per branch per provider. A branch can have multiple
  -- providers configured (rare but possible — e.g. partial migration
  -- between PMSes) but never two of the same provider.
  unique (branch_id, provider)
);

create index if not exists branch_pms_config_branch_idx
  on branch_pms_config(branch_id)
  where is_active = true;

alter table branch_pms_config enable row level security;

-- Read: org members can see their branches' PMS config.
create policy "org members read pms config"
  on branch_pms_config
  for select
  using (
    branch_id in (
      select b.id
      from branches b
      join organization_members m on m.organization_id = b.organization_id
      where m.user_id = auth.uid()
    )
  );

-- Write: only owners can configure PMS integration. The settings UI
-- runs as the authenticated user; we don't want managers (let alone
-- staff) to be able to repoint a branch's rates to a different PMS.
create policy "owners write pms config"
  on branch_pms_config
  for all
  using (
    branch_id in (
      select b.id
      from branches b
      join organization_members m on m.organization_id = b.organization_id
      where m.user_id = auth.uid() and m.role = 'owner'
    )
  );

-- Super admin escape hatch.
create policy "super admin all pms config"
  on branch_pms_config
  for all
  using (public.is_super_admin());

-- Auto-updated_at trigger so the settings page can show "Last edited
-- 5 minutes ago" without the UI having to remember to send it.
create or replace function set_branch_pms_config_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger branch_pms_config_updated_at
  before update on branch_pms_config
  for each row
  execute function set_branch_pms_config_updated_at();
