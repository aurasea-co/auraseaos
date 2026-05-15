-- Add trial fields to organizations table
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS is_trial boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;

-- Crystal Resort Korat is NOT on trial (real account)
UPDATE organizations
SET is_trial = false
WHERE id = 'd45b5faa-d44e-4d3d-bc46-9b444ada147c';
