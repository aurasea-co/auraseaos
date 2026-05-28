-- One-off cleanup for orphan organizations left behind by the
-- pre-idempotency create-org bug.
--
-- Background:
--   /api/owner-setup/create-org used to INSERT into `organizations`
--   unconditionally. When a click partially succeeded (org row
--   landed, organization_members row failed) and the owner retried,
--   the next attempt blew up on organizations_name_unique. The fix
--   landing in the same commit makes the route idempotent going
--   forward, but any orphan org rows already in the live DB need a
--   manual sweep before they collide with future legitimate signups.
--
-- An orphan org = an organizations row with NO organization_members
-- entry. Such a row can only have come from a half-completed signup
-- (the failed second step), so deleting it is safe.
--
-- ============================================================================
-- STEP 1 — REVIEW: list the orphans before doing anything destructive.
-- Run this on its own first and eyeball the output. Counts should be
-- small (1-2 per known failed signup attempt).
-- ============================================================================
SELECT
  o.id,
  o.name,
  o.created_at,
  o.status,
  (
    SELECT COUNT(*) FROM branches b WHERE b.organization_id = o.id
  ) AS branch_count
FROM organizations o
LEFT JOIN organization_members om ON om.organization_id = o.id
WHERE om.id IS NULL
ORDER BY o.created_at;

-- ============================================================================
-- STEP 2 — DELETE: only run if STEP 1's output looks right (orphan
-- names match failed test attempts, no production orgs in the list).
-- The CASCADE on the branches FK takes care of any rooms-fk children
-- in one shot; if you have other tables referencing organizations
-- without ON DELETE CASCADE, list them in STEP 1 and delete those
-- rows first.
-- ============================================================================
-- DELETE FROM organizations o
-- WHERE NOT EXISTS (
--   SELECT 1 FROM organization_members om WHERE om.organization_id = o.id
-- );

-- ============================================================================
-- STEP 3 — VERIFY: the orphans are gone and your real orgs are
-- untouched.
-- ============================================================================
-- SELECT COUNT(*) AS orgs_total FROM organizations;
-- SELECT COUNT(*) AS orgs_with_owner
--   FROM organizations o
--   WHERE EXISTS (
--     SELECT 1 FROM organization_members om
--     WHERE om.organization_id = o.id AND om.role = 'owner'
--   );
