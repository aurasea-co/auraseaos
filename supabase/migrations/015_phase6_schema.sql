-- Phase 6 schema changes

-- 1. Add line_user_id to profiles for Line Messaging API
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS line_user_id text UNIQUE;

-- 2. Add onboarding_completed_at to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Mark Crystal Resort Korat as onboarding complete (existing account)
UPDATE organizations
SET onboarding_completed_at = now()
WHERE id = 'd45b5faa-d44e-4d3d-bc46-9b444ada147c';

-- 3. Ensure bovorn has superadmin access
INSERT INTO platform_admins (user_id)
VALUES ('2fc42b21-769a-4d3c-9403-22332f885a64')
ON CONFLICT (user_id) DO NOTHING;
