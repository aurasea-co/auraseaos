-- Add business day cutoff time to branches
-- F&B: entries before 03:00 count as previous day
-- Hotel: entries before 12:00 count as previous day (night audit)

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS business_day_cutoff_time time DEFAULT '03:00:00';

UPDATE branches
SET business_day_cutoff_time = '03:00:00'
WHERE module_type = 'fnb';

UPDATE branches
SET business_day_cutoff_time = '12:00:00'
WHERE module_type = 'accommodation';
