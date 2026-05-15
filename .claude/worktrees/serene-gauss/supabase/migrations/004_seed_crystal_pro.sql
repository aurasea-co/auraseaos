-- Seed Crystal Resort Korat organization as plan='pro' for testing
-- Run in Supabase SQL Editor AFTER 002_add_plan_to_organizations.sql

-- Set all Crystal-related organizations to pro plan
UPDATE organizations SET plan = 'pro' WHERE name ILIKE '%crystal%';

-- Seed default targets for existing branches (if targets table exists)
INSERT INTO targets (branch_id, adr_target, occ_target, labour_target, covers_target, cogs_target, avg_spend_target, monthly_salary, operating_days)
SELECT
  b.id,
  CASE WHEN b.business_type = 'accommodation' THEN 2025 ELSE NULL END,
  CASE WHEN b.business_type = 'accommodation' THEN 80 ELSE NULL END,
  30,
  CASE WHEN b.business_type != 'accommodation' THEN 75 ELSE NULL END,
  CASE WHEN b.business_type != 'accommodation' THEN 32 ELSE NULL END,
  NULL, -- avg_spend_target (set manually by owner later)
  0,
  30
FROM branches b
WHERE NOT EXISTS (SELECT 1 FROM targets t WHERE t.branch_id = b.id)
ON CONFLICT (branch_id) DO NOTHING;
