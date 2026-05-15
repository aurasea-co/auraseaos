-- Add missing columns to targets table
ALTER TABLE targets
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS occupancy_target numeric(5,2),
  ADD COLUMN IF NOT EXISTS direct_booking_target numeric(5,2),
  ADD COLUMN IF NOT EXISTS revpar_target numeric(10,2),
  ADD COLUMN IF NOT EXISTS labour_alert_threshold numeric(5,2);

-- Rename occ_target to match if it exists (skip if already renamed)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'targets' AND column_name = 'occ_target') THEN
    -- Copy data from occ_target to occupancy_target
    UPDATE targets SET occupancy_target = occ_target WHERE occupancy_target IS NULL AND occ_target IS NOT NULL;
  END IF;
END $$;

-- Backfill organization_id from branches
UPDATE targets t
SET organization_id = b.organization_id
FROM branches b
WHERE t.branch_id = b.id
  AND t.organization_id IS NULL;

-- Drop old RLS policies (IF EXISTS to be idempotent)
DROP POLICY IF EXISTS "Users can read accessible targets" ON targets;
DROP POLICY IF EXISTS "Owners can update targets" ON targets;
DROP POLICY IF EXISTS "Owners can insert targets" ON targets;
DROP POLICY IF EXISTS "Super admins manage targets" ON targets;

-- New RLS policies
CREATE POLICY "owner_full_access_targets" ON targets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = targets.organization_id
        AND user_id = auth.uid()
        AND role = 'owner'
    )
  );

CREATE POLICY "manager_read_targets_no_salary" ON targets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM branch_members
      WHERE branch_id = targets.branch_id
        AND user_id = auth.uid()
        AND role IN ('branch_manager', 'branch_user')
    )
  );

CREATE POLICY "super_admin_targets" ON targets
  FOR ALL USING (public.is_super_admin());

-- Re-seed Crystal Resort targets
INSERT INTO targets (branch_id, organization_id, adr_target, occupancy_target,
  direct_booking_target, labour_target, labour_alert_threshold,
  operating_days, monthly_salary)
VALUES (
  'ef77c100-e27b-4f69-a930-053750b79f22',
  'd45b5faa-d44e-4d3d-bc46-9b444ada147c',
  2025, 80, 40, 30, 33, 30, 0
) ON CONFLICT (branch_id) DO UPDATE SET
  organization_id = EXCLUDED.organization_id,
  adr_target = EXCLUDED.adr_target,
  occupancy_target = EXCLUDED.occupancy_target,
  direct_booking_target = EXCLUDED.direct_booking_target,
  labour_target = EXCLUDED.labour_target,
  labour_alert_threshold = EXCLUDED.labour_alert_threshold;

-- Re-seed Crystal Café targets
INSERT INTO targets (branch_id, organization_id, covers_target, cogs_target,
  avg_spend_target, labour_target, labour_alert_threshold,
  operating_days, monthly_salary)
VALUES (
  '4dca5378-68a7-4eef-94f0-7572852a7744',
  'd45b5faa-d44e-4d3d-bc46-9b444ada147c',
  75, 32, 150, 30, 33, 26, 0
) ON CONFLICT (branch_id) DO UPDATE SET
  organization_id = EXCLUDED.organization_id,
  covers_target = EXCLUDED.covers_target,
  cogs_target = EXCLUDED.cogs_target,
  avg_spend_target = EXCLUDED.avg_spend_target,
  labour_target = EXCLUDED.labour_target,
  labour_alert_threshold = EXCLUDED.labour_alert_threshold;
