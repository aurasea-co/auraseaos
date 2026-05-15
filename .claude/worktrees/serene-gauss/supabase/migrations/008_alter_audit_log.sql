-- Add organization_id to audit_log
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);

-- Drop old policies
DROP POLICY IF EXISTS "Super admins read audit logs" ON audit_log;
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON audit_log;

-- New RLS policies
CREATE POLICY "owner_read_own_audit" ON audit_log
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

CREATE POLICY "authenticated_insert_audit" ON audit_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "super_admin_audit" ON audit_log
  FOR ALL USING (public.is_super_admin());
