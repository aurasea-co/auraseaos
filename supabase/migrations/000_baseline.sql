-- ============================================================================
-- 000_baseline.sql — foundational tables that pre-date the migrations folder
-- ============================================================================
--
-- Why this file exists:
--   The first checked-in migration is 001_create_targets.sql, which already
--   FK-references `branches(id)`. Migrations 002, 005, 009, 010, 013, 016,
--   017, 022, 026 ALTER `organizations` and `branches`. None of them ever
--   create those tables — they were materialised via the Supabase Dashboard
--   before the migrations folder existed. That means `supabase db reset`
--   or a fresh environment can't replay history from scratch.
--
-- Strategy:
--   Re-state the *current* shape of the foundational tables using
--   CREATE TABLE IF NOT EXISTS. On the live DB this is a no-op (the tables
--   already exist with these columns). On a fresh DB it bootstraps the
--   baseline so subsequent migrations (which all use ADD COLUMN IF NOT
--   EXISTS) safely no-op on the columns they would otherwise add.
--
-- What this file covers:
--   - organizations
--   - branches
--   - organization_members
--   - branch_members
--
-- What this file does NOT cover:
--   - branch_daily_metrics, accommodation_daily_metrics, fnb_daily_metrics
--     (no confident schema — types.ts lists `Record<string, unknown>` for
--     branch_daily_metrics, and the three *_daily_metrics tables only have
--     ALTER history in migrations/). To complete the bootstrap, dump the
--     live schema with `supabase db dump --schema=public --data=false`
--     and merge the missing CREATE TABLE blocks below.
--
-- Safety notes:
--   - role columns on the membership tables are stored as TEXT without
--     CHECK constraints. The live CHECK constraints differ from what
--     supabase/types.ts declares (see comments in api/invite/accept) and
--     re-imposing a constraint here that disagrees with production would
--     fail. Real constraints stay on the live DB.
--   - No RLS policies are created here. Policy definitions live with the
--     features that need them; defining them in the baseline risks
--     duplicating or contradicting what already exists.
--   - ENABLE ROW LEVEL SECURITY is idempotent in Postgres, so we turn it
--     on defensively — on fresh envs nothing else does so until later
--     migrations add policies.

-- ----------------------------------------------------------------------------
-- organizations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  -- Added later by 002, 005, 016, 025, 026 — re-stated here so a fresh
  -- bootstrap lands the full current shape in one go. Migrations 002/005/
  -- 016/025/026 then no-op on existing envs via ADD COLUMN IF NOT EXISTS.
  vertical_type text DEFAULT 'mixed',
  plan text DEFAULT 'pro',
  plan_expires_at timestamptz,
  plan_activated_at timestamptz DEFAULT now(),
  is_trial boolean DEFAULT false,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  trial_days integer,
  discount_pct integer DEFAULT 0,
  promo_code text,
  invited_by_admin uuid,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- branches
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  branch_name text,
  business_type text NOT NULL,
  module_type text,
  total_rooms integer,
  accommodation_staff_count integer,
  total_seats integer,
  sort_order integer,
  city text,
  province text,
  zip_code text,
  -- 009 added operating_days; 013 added business_day_cutoff_time.
  operating_days jsonb DEFAULT '{"weekdays": true, "weekends": true}'::jsonb,
  business_day_cutoff_time time DEFAULT '03:00:00',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branches_organization ON branches(organization_id);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- organization_members — owner membership join
-- ----------------------------------------------------------------------------
-- Comments in api/invite/accept/route.ts note the live CHECK constraint
-- on `role` rejects everything except 'owner', so we don't recreate a
-- CHECK here that might disagree with production. Stored as plain text.
CREATE TABLE IF NOT EXISTS organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner',
  invited_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- branch_members — manager/staff membership join, scoped per branch
-- ----------------------------------------------------------------------------
-- The live CHECK constraint accepts 'manager'/'staff' (matching the
-- invitations.role enum) even though types.ts declares
-- 'branch_manager'|'branch_user'|'viewer'. Stored as plain text to avoid
-- a CHECK that contradicts the production constraint.
CREATE TABLE IF NOT EXISTS branch_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  email text,
  invited_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (branch_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_members_user ON branch_members(user_id);
CREATE INDEX IF NOT EXISTS idx_branch_members_branch ON branch_members(branch_id);

ALTER TABLE branch_members ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TODO for fresh-environment completeness — paste from
-- `supabase db dump --schema=public --data=false`:
--   - branch_daily_metrics
--   - accommodation_daily_metrics  (3 ALTER migrations exist)
--   - fnb_daily_metrics            (3 ALTER migrations exist)
--   - daily_metrics                (referenced in types.ts)
-- Plus their RLS policies. Existing envs are unaffected by these being
-- omitted from the baseline; only fresh `supabase db reset` is impacted.
-- ============================================================================
