-- Add plan_expires_at and plan_activated_at to organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_activated_at timestamptz DEFAULT now();

-- Seed Crystal Resort Korat as pro for testing
UPDATE organizations
SET plan = 'pro',
    plan_expires_at = now() + interval '90 days',
    plan_activated_at = now()
WHERE id = 'd45b5faa-d44e-4d3d-bc46-9b444ada147c';
