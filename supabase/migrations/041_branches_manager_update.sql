-- Migration 041: allow branch/org-scoped managers to UPDATE branches
--
-- Context: the rooms-CRUD routes (POST/PATCH/DELETE under
-- /api/branches/[branchId]/rooms) mirror branches.total_rooms from the
-- room-type roster on every edit, using the RLS user client (not the
-- service role) so the write is subject to the same access rules a
-- manager already has for everything else on that surface.
-- authorizeRoomsMutation() (_auth.ts) allows owner OR manager — org-
-- level manager, or branch-level manager/branch_manager via
-- branch_members — to mutate the roster. Without a matching UPDATE
-- policy on `branches` itself, a manager's roster edit would still
-- write the roster correctly but the total_rooms mirror would
-- silently no-op (RLS filters it to 0 rows affected, no error), and
-- the stale-total bug this migration exists to prevent would return
-- for every branch a manager (not the owner) administers.
--
-- No existing `branches` UPDATE policy is tracked in this migrations/
-- directory (see 000_baseline.sql's notes on undocumented live
-- policies), so this could not be confirmed against a known "before"
-- state — it is deliberately ADDITIVE (a second permissive policy)
-- rather than a DROP + recreate, so it cannot narrow or break
-- whatever owner-level UPDATE access already exists in production.
--
-- Scoped by branch/org membership (organization_members.role = manager,
-- or branch_members.role in manager/branch_manager) — NOT by an
-- owner-`user_id` column on branches itself (branches has no owner
-- column; this is the trap CLAUDE.md's "RLS trap" note warns about on
-- other tables). Matches the exact role model in
-- src/app/api/branches/[branchId]/rooms/_auth.ts.

create policy "manager_update_own_branches"
  on branches
  for update
  using (
    exists (
      select 1
      from organization_members m
      where m.user_id = auth.uid()
        and m.organization_id = branches.organization_id
        and m.role = 'manager'
    )
    or exists (
      select 1
      from branch_members bm
      where bm.user_id = auth.uid()
        and bm.branch_id = branches.id
        and bm.role in ('manager', 'branch_manager')
    )
  )
  with check (
    exists (
      select 1
      from organization_members m
      where m.user_id = auth.uid()
        and m.organization_id = branches.organization_id
        and m.role = 'manager'
    )
    or exists (
      select 1
      from branch_members bm
      where bm.user_id = auth.uid()
        and bm.branch_id = branches.id
        and bm.role in ('manager', 'branch_manager')
    )
  );
