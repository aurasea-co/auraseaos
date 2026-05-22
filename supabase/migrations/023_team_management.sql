-- Team management groundwork
--
-- 1. is_active on the two membership tables. Owners can temporarily
--    suspend a member without deleting the row (preserves audit trail
--    and lets them re-enable in one click). Owners themselves never
--    get toggled — the UI hides the toggle for role='owner'.
ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE branch_members
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2. Mirror email on profiles so the team list (and other admin
--    surfaces) don't need to hit auth.users for every read. The
--    /api/invite/accept route is updated to fill this on first join;
--    older rows get backfilled lazily by the team-list API as it
--    discovers them.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 3. Helpful index for the suspension check that middleware runs on
--    every request — we look up the user's memberships and ask
--    "does any active row exist?".
CREATE INDEX IF NOT EXISTS idx_org_members_user_active
  ON organization_members(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_branch_members_user_active
  ON branch_members(user_id) WHERE is_active = true;
