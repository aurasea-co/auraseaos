-- Add plan column to organizations table
-- Run in Supabase SQL Editor

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'pro'
  CHECK (plan IN ('starter', 'growth', 'pro'));
