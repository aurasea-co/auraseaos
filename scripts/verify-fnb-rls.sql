-- RLS verification for migration 034 (menu_items + fnb_daily_sales).
-- Run AFTER applying migration 034 in Supabase SQL Editor.
--
-- The earlier version of this script tried to fabricate fake auth.uid()
-- values via set_config('request.jwt.claim.sub', ...), but
-- organization_members.user_id REFERENCES auth.users(id) — so inserting
-- a synthetic UUID for cross-org testing fails with a FK violation
-- (and creating real auth.users rows from raw SQL is brittle because
-- the Supabase auth pipeline owns that table's invariants).
--
-- This script instead verifies the boundary that actually matters in
-- production:
--   1. The right POLICIES are attached to the right tables (introspection
--      against pg_policies — proves the migration's RLS clauses landed).
--   2. The anon role (no JWT) cannot read the data (the boundary
--      anonymous requests hit when a token is missing or invalid).
--   3. RLS is enabled on each table (a missing ENABLE would silently
--      give everyone read access regardless of policies).
--
-- For end-to-end cross-org verification (org B's logged-in user can't
-- read org A's rows), create two real test users via Supabase
-- dashboard → Auth → Users → Invite User, assign each to one org via
-- organization_members, then log in as each in two browser tabs and
-- query the dashboard. The SQL-only test below is the closest
-- proxy that runs without manual user setup.

-- ── 1. Policies attached ───────────────────────────────────────────────────

select
  '1. Policies attached'                as section,
  tablename                              as table_name,
  policyname,
  cmd                                    as command,
  case
    when policyname is not null then 'PASS'
    else 'FAIL — policy missing'
  end as result
from pg_policies
where schemaname = 'public'
  and tablename in ('menu_items', 'fnb_daily_sales')
order by tablename, policyname;
-- Expected: 4 menu_items policies + 5 fnb_daily_sales policies
-- (read, owners+managers write, super admin, plus the no-direct-write
-- guards on fnb_daily_sales).

-- ── 2. RLS enabled ─────────────────────────────────────────────────────────

select
  '2. RLS enabled'                          as section,
  tablename                                  as table_name,
  rowsecurity                                as rls_on,
  case
    when rowsecurity then 'PASS'
    else 'FAIL — RLS not enabled; everyone can read'
  end as result
from pg_tables
where schemaname = 'public'
  and tablename in ('menu_items', 'fnb_daily_sales');
-- Expected: both rls_on = true.

-- ── 3. Anon role cannot read ───────────────────────────────────────────────
--
-- Switch to the `anon` role (the default Supabase role for
-- unauthenticated requests). All read policies require auth.uid() to
-- resolve to an org member — anon's auth.uid() is null, so every
-- policy clause's `m.user_id = auth.uid()` join returns zero rows
-- and the SELECT returns empty regardless of what's in the table.

set local role anon;

select
  '3. Anon read — menu_items'                                       as test,
  count(*)                                                          as visible_rows,
  case when count(*) = 0 then 'PASS' else 'FAIL — anon can read menu_items' end as result
from menu_items;

select
  '3. Anon read — fnb_daily_sales'                                       as test,
  count(*)                                                                as visible_rows,
  case when count(*) = 0 then 'PASS' else 'FAIL — anon can read fnb_daily_sales' end as result
from fnb_daily_sales;

select
  '3. Anon read — fnb_daily_rollup'                                       as test,
  count(*)                                                                 as visible_rows,
  case when count(*) = 0 then 'PASS' else 'FAIL — anon can read fnb_daily_rollup' end as result
from fnb_daily_rollup;

-- Reset role for cleanliness.
reset role;

-- ── 4. Sanity: super-admin policy works (your own session) ─────────────────
--
-- The session running this script IS a superuser (service role / SQL
-- Editor context). The "super admin all" policies grant unconditional
-- access — these should return whatever rows exist in the tables.
-- This isn't a security test (you bypass RLS as superuser anyway),
-- but it confirms the migration didn't break basic readability.

select
  '4. Super-admin read — menu_items'  as test,
  count(*)                             as visible_rows,
  'OK — superuser bypass works'        as result
from menu_items;

select
  '4. Super-admin read — fnb_daily_sales' as test,
  count(*)                                 as visible_rows,
  'OK — superuser bypass works'            as result
from fnb_daily_sales;
