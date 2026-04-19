-- Update business day cutoff defaults to better match SME hospitality
-- workflows in Thailand / Southeast Asia.
--
-- Hotel: entries before 14:00 = last night's data (was 12:00)
--   Small hotels typically finish housekeeping + night-audit paperwork
--   around early afternoon; 14:00 lets owners file "last night" until
--   mid-afternoon instead of rushing before noon.
--
-- F&B: entries before 05:00 = yesterday's data (was 03:00)
--   Late-night venues (bars, izakaya, restaurants with bar service)
--   often close and cash-out between 02:00 and 04:30. 05:00 covers the
--   full closing window so same-night cashouts always file under the
--   correct business day.

ALTER TABLE branches
  ALTER COLUMN business_day_cutoff_time SET DEFAULT '05:00:00';

UPDATE branches
SET business_day_cutoff_time = '14:00:00'
WHERE module_type = 'accommodation'
  AND business_day_cutoff_time = '12:00:00';

UPDATE branches
SET business_day_cutoff_time = '05:00:00'
WHERE module_type = 'fnb'
  AND business_day_cutoff_time = '03:00:00';
