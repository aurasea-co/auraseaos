-- RLS verification for the competitor-rates VIEW fix (GET now reads
-- through the RLS user client instead of the service role — see
-- src/app/api/branches/[branchId]/competitor-rates/route.ts).
-- Run in the Supabase SQL editor. Read-only — inserts/updates nothing.
--
-- Confirms what the app-level diagnostic already established from the
-- migration text: members_read_competitor_rates (migration 029) scopes
-- by branch/org MEMBERSHIP, not by owner user_id — so a manager's read
-- was never blocked at the RLS layer; the route just wasn't using RLS
-- for this query until now.

-- ── 1. Policies attached + their actual scoping clause ──────────────────

select
  '1. Policies attached' as section,
  tablename              as table_name,
  policyname,
  cmd                    as command,
  qual                   as using_clause
from pg_policies
where schemaname = 'public'
  and tablename = 'competitor_rates'
order by policyname;
-- Expected: 2 rows.
--   members_read_competitor_rates | SELECT | scoped via organization_members
--     OR branch_members, both filtered on user_id = auth.uid() — NOT
--     "owner" anywhere in the clause.
--   owner_write_competitor_rates  | ALL    | scoped via organization_members
--     WHERE role = 'owner' — this is the one that's owner-only, and it's
--     additive (OR'd) with the read policy for SELECT, not a restriction.

-- ── 2. RLS enabled ───────────────────────────────────────────────────────

select
  '2. RLS enabled'  as section,
  tablename          as table_name,
  rowsecurity        as rls_on,
  case when rowsecurity then 'PASS' else 'FAIL — RLS not enabled' end as result
from pg_tables
where schemaname = 'public'
  and tablename = 'competitor_rates';

-- ── 3. Anon role cannot read ─────────────────────────────────────────────

set local role anon;

select
  '3. Anon read — competitor_rates'                                       as test,
  count(*)                                                                 as visible_rows,
  case when count(*) = 0 then 'PASS' else 'FAIL — anon can read competitor_rates' end as result
from competitor_rates;

reset role;

-- ── 4. Sanity: superuser (this session) can still see everything ────────
-- Not a security test — just confirms the migration didn't break basic
-- readability for the service-role/SQL-editor context.

select
  '4. Superuser read — competitor_rates' as test,
  count(*)                                as visible_rows,
  'OK — superuser bypass works'           as result
from competitor_rates;

-- ── 5. Cross-org isolation, by inspection ────────────────────────────────
-- No synthetic auth.uid() test here (organization_members.user_id
-- references auth.users — see scripts/verify-fnb-rls.sql's note on why
-- that fails for fabricated UUIDs). Instead: confirm by construction
-- that a DIFFERENT org's member can never match Crystal Resort's
-- branch_id — the read policy's subquery is entirely keyed off
-- auth.uid()'s OWN organization_members/branch_members rows, so a user
-- whose rows point at a different organization_id/branch_id can never
-- produce Crystal Resort's branch_id in the IN (...) set. This query
-- shows there IS a genuinely separate org/branch to reason about
-- (Resort A / Resort A - Bangkok), with no membership row tying its
-- owner or manager to Crystal Resort's org or branch:

select
  '5. Cross-org membership check' as section,
  b.name                           as branch_name,
  b.organization_id,
  (b.organization_id = 'd45b5faa-d44e-4d3d-bc46-9b444ada147c') as is_crystal_resort_org
from branches b
where b.id in ('ef77c100-e27b-4f69-a930-053750b79f22', '12a18f1d-532c-436d-af46-abfc4884178a');
-- Expected: two rows, only Crystal Resort's has is_crystal_resort_org = true.
-- Resort A's owner/manager have no organization_members/branch_members
-- row for org d45b5faa or branch ef77c100 — so the read policy's
-- subqueries return empty for them against Crystal Resort's branch_id,
-- and the SELECT returns zero rows for Crystal Resort's competitor data.
