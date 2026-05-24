-- Owner invitation + trial management
--
-- Aurasea staff (super_admins) hand-invite each new business owner.
-- The invitation row drives the /owner-setup wizard: the wizard
-- creates the user, org, and first branch in one flow.
--
-- We do NOT use the existing 'invitations' table — that one is scoped
-- to a specific organization (managers/staff invited by an owner),
-- whereas owner invitations *create* the organization. Different
-- lifecycle, different columns, different RLS.

CREATE TABLE IF NOT EXISTS owner_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  organization_name TEXT,
  business_type TEXT DEFAULT 'mixed', -- 'accommodation' | 'fnb' | 'mixed'
  trial_days INTEGER DEFAULT 30,
  plan TEXT DEFAULT 'growth',         -- starter | growth | pro
  discount_pct INTEGER DEFAULT 0,
  promo_code TEXT,
  notes TEXT,
  invited_by UUID REFERENCES auth.users(id),
  token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ DEFAULT now() + interval '7 days',
  accepted_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_invitations_token ON owner_invitations(token);
CREATE INDEX IF NOT EXISTS idx_owner_invitations_email ON owner_invitations(email);

ALTER TABLE owner_invitations ENABLE ROW LEVEL SECURITY;

-- Only super_admins can manage owner_invitations. The /owner-setup
-- wizard fetches the row server-side via the service_role client.
CREATE POLICY "super_admin_owner_invitations" ON owner_invitations
  FOR ALL USING (public.is_super_admin());

-- Trial / discount fields on organizations. Existing is_trial /
-- trial_started_at from migration 016 stay for backwards-compat; the
-- new fields below are the source of truth going forward.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_days INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS discount_pct INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_code TEXT,
  ADD COLUMN IF NOT EXISTS invited_by_admin UUID,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'trial';
-- status values: 'trial' | 'active' | 'expired' | 'cancelled'

CREATE INDEX IF NOT EXISTS idx_organizations_status
  ON organizations(status) WHERE status IN ('trial', 'expired');
