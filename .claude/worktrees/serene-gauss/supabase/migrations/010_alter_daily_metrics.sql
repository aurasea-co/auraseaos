-- The live DB uses separate tables: accommodation_daily_metrics and fnb_daily_metrics
-- (not a single daily_metrics table)

-- Add new columns to accommodation_daily_metrics
ALTER TABLE accommodation_daily_metrics
  ADD COLUMN IF NOT EXISTS channel_direct integer,
  ADD COLUMN IF NOT EXISTS channel_ota integer,
  ADD COLUMN IF NOT EXISTS notes text;

-- Add new columns to fnb_daily_metrics
ALTER TABLE fnb_daily_metrics
  ADD COLUMN IF NOT EXISTS cost_food numeric(12,2),
  ADD COLUMN IF NOT EXISTS cost_nonfood numeric(12,2),
  ADD COLUMN IF NOT EXISTS notes text;
