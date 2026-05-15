-- Add total_seats and operating_days to branches
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS total_seats integer,
  ADD COLUMN IF NOT EXISTS operating_days jsonb DEFAULT '{"weekdays": true, "weekends": true}'::jsonb;
