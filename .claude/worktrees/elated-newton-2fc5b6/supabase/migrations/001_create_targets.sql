-- Targets table: per-branch performance targets
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  adr_target NUMERIC,
  occ_target NUMERIC,
  labour_target NUMERIC,
  covers_target INTEGER,
  cogs_target NUMERIC,
  avg_spend_target NUMERIC,
  monthly_salary NUMERIC DEFAULT 0,
  operating_days INTEGER DEFAULT 30,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_branch_target UNIQUE (branch_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_targets_branch_id ON targets(branch_id);

-- RLS
ALTER TABLE targets ENABLE ROW LEVEL SECURITY;

-- Users can read targets for branches they have access to
CREATE POLICY "Users can read accessible targets"
  ON targets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = targets.branch_id
      AND (
        EXISTS (
          SELECT 1 FROM organization_members om
          WHERE om.organization_id = b.organization_id
          AND om.user_id = auth.uid()
        ) OR
        EXISTS (
          SELECT 1 FROM branch_members bm
          WHERE bm.branch_id = b.id
          AND bm.user_id = auth.uid()
        )
      )
    )
  );

-- Only owners can update targets
CREATE POLICY "Owners can update targets"
  ON targets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM branches b
      JOIN organization_members om ON om.organization_id = b.organization_id
      WHERE b.id = targets.branch_id
      AND om.user_id = auth.uid()
      AND om.role = 'owner'
    )
  );

-- Only owners can insert targets
CREATE POLICY "Owners can insert targets"
  ON targets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM branches b
      JOIN organization_members om ON om.organization_id = b.organization_id
      WHERE b.id = targets.branch_id
      AND om.user_id = auth.uid()
      AND om.role = 'owner'
    )
  );

-- Super admins full access
CREATE POLICY "Super admins manage targets"
  ON targets FOR ALL
  USING (public.is_super_admin());
