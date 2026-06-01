-- RLS verification for migration 034 (menu_items + fnb_daily_sales).
-- Run AFTER applying migration 034 in Supabase SQL Editor.
--
-- Proves that a second org cannot read this org's data. The pattern:
--   1. Create two test orgs with one branch each
--   2. Insert a menu_item + fnb_daily_sales row into org A's branch
--   3. Switch session to a member of org B
--   4. Try to read — must return 0 rows
--   5. Switch back to org A's member — must return the row
--   6. Clean up
--
-- Each block runs in a single transaction so a failure leaves no
-- residue. Uses set_config('request.jwt.claim.sub', ...) to simulate
-- the auth.uid() of each user.

begin;

-- Reset state (idempotent — safe to re-run).
delete from organization_members where user_id in ('rls_test_a'::uuid, 'rls_test_b'::uuid);
delete from organizations where name in ('RLS-Test-OrgA', 'RLS-Test-OrgB');

-- 1) Create test orgs + branches. We use the service role implicitly
--    via the migration / superadmin context.
do $$
declare
  org_a_id uuid;
  org_b_id uuid;
  branch_a_id uuid;
  branch_b_id uuid;
  item_a_id uuid;
begin
  insert into organizations (name, plan) values ('RLS-Test-OrgA', 'pro')
    returning id into org_a_id;
  insert into organizations (name, plan) values ('RLS-Test-OrgB', 'pro')
    returning id into org_b_id;

  -- One branch per org. business_type='fnb' so the test data is
  -- semantically valid (the migration constraints don't enforce
  -- business_type, but the app does at the route layer).
  insert into branches (organization_id, name, business_type)
    values (org_a_id, 'RLS-Test-BranchA', 'fnb')
    returning id into branch_a_id;
  insert into branches (organization_id, name, business_type)
    values (org_b_id, 'RLS-Test-BranchB', 'fnb')
    returning id into branch_b_id;

  -- Membership rows so auth.uid() lookups in the policies will find
  -- the right user → org binding.
  insert into organization_members (user_id, organization_id, role)
    values ('rls_test_a'::uuid, org_a_id, 'owner');
  insert into organization_members (user_id, organization_id, role)
    values ('rls_test_b'::uuid, org_b_id, 'owner');

  -- Plant a menu_item + a sales row in branch A.
  insert into menu_items (branch_id, name, price_thb, cost_thb)
    values (branch_a_id, 'RLS-Test-Pad-Krapow', 120, 45)
    returning id into item_a_id;
  insert into fnb_daily_sales (branch_id, date, menu_item_id, units_sold, source)
    values (branch_a_id, current_date, item_a_id, 3, 'manual');
end$$;

-- 2) From org B's perspective: must see 0 rows from org A's branch.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'rls_test_b', true);

select 'Test 1 — menu_items leakage' as test,
       count(*)                    as visible_rows,
       case when count(*) = 0 then 'PASS' else 'FAIL — org B can read org A''s menu' end as result
from menu_items
where name = 'RLS-Test-Pad-Krapow';

select 'Test 2 — fnb_daily_sales leakage' as test,
       count(*)                          as visible_rows,
       case when count(*) = 0 then 'PASS' else 'FAIL — org B can read org A''s sales' end as result
from fnb_daily_sales
where date = current_date and units_sold = 3;

select 'Test 3 — fnb_daily_rollup leakage' as test,
       count(*)                            as visible_rows,
       case when count(*) = 0 then 'PASS' else 'FAIL — org B can read org A''s rollup' end as result
from fnb_daily_rollup
where date = current_date and total_revenue_thb = 360;  -- 3 × 120

-- 3) Switch to org A's session: must see the rows.
select set_config('request.jwt.claim.sub', 'rls_test_a', true);

select 'Test 4 — org A reads own menu_items' as test,
       count(*)                              as visible_rows,
       case when count(*) = 1 then 'PASS' else 'FAIL — org A cannot read own data' end as result
from menu_items
where name = 'RLS-Test-Pad-Krapow';

select 'Test 5 — org A reads own fnb_daily_sales' as test,
       count(*)                                    as visible_rows,
       case when count(*) = 1 then 'PASS' else 'FAIL — org A cannot read own sales' end as result
from fnb_daily_sales
where date = current_date and units_sold = 3;

select 'Test 6 — org A reads own rollup' as test,
       count(*)                          as visible_rows,
       case when count(*) = 1 then 'PASS' else 'FAIL — org A cannot read own rollup' end as result
from fnb_daily_rollup
where date = current_date and total_revenue_thb = 360;

-- 4) Direct INSERT into fnb_daily_sales must be blocked for users.
--    (Service role bypasses RLS so this only tests the user policy.)
do $$
declare
  branch_a_id uuid;
  item_a_id uuid;
  insert_blocked boolean := false;
begin
  select b.id into branch_a_id
    from branches b join organizations o on o.id = b.organization_id
    where o.name = 'RLS-Test-OrgA' limit 1;
  select id into item_a_id from menu_items where name = 'RLS-Test-Pad-Krapow' limit 1;
  begin
    insert into fnb_daily_sales (branch_id, date, menu_item_id, units_sold)
      values (branch_a_id, current_date - interval '1 day', item_a_id, 5);
    insert_blocked := false;
  exception when others then
    insert_blocked := true;
  end;
  raise notice 'Test 7 — direct user INSERT to fnb_daily_sales blocked: %', insert_blocked;
end$$;

-- Roll back so this script leaves the DB in its original state.
-- Comment out the ROLLBACK if you want to inspect the test data
-- post-run; just remember to clean up manually.
rollback;
