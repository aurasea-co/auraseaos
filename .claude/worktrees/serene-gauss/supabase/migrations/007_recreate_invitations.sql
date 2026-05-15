-- Drop old invitations table if it exists (from legacy RBAC schema)
DROP TABLE IF EXISTS invitations CASCADE;

CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  invitee_email text NOT NULL,
  role text NOT NULL CHECK (role IN ('manager', 'staff')),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by uuid REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(invitee_email);
CREATE INDEX IF NOT EXISTS idx_invitations_org ON invitations(organization_id);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_manage_invitations" ON invitations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = invitations.organization_id
        AND user_id = auth.uid()
        AND role = 'owner'
    )
  );

CREATE POLICY "super_admin_invitations" ON invitations
  FOR ALL USING (public.is_super_admin());
