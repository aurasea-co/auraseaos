-- Enforce one entry per (branch, date) at the database level.
--
-- The API route (src/app/api/entry/route.ts) already calls
--   .upsert(entry, { onConflict: 'branch_id,metric_date' })
-- which assumes a unique index on (branch_id, metric_date). Without
-- that constraint, upsert silently becomes "insert a new row every
-- time" — the corruption scenario we saw in testing where the same
-- numbers appeared on multiple dates. This migration adds the missing
-- constraint so the DB is the backstop even if a future code path
-- forgets to upsert.
--
-- Run the duplicate cleanup (same pattern as Step 3A of the fix doc)
-- before adding the constraint, in case existing data violates it.

-- 1. Drop older duplicates, keep the latest created_at per (branch, date)
DELETE FROM accommodation_daily_metrics a
USING accommodation_daily_metrics b
WHERE a.branch_id = b.branch_id
  AND a.metric_date = b.metric_date
  AND a.created_at < b.created_at;

DELETE FROM fnb_daily_metrics a
USING fnb_daily_metrics b
WHERE a.branch_id = b.branch_id
  AND a.metric_date = b.metric_date
  AND a.created_at < b.created_at;

-- 2. Accommodation: one row per (branch, date)
ALTER TABLE accommodation_daily_metrics
  DROP CONSTRAINT IF EXISTS accommodation_daily_metrics_branch_date_unique;

ALTER TABLE accommodation_daily_metrics
  ADD CONSTRAINT accommodation_daily_metrics_branch_date_unique
  UNIQUE (branch_id, metric_date);

-- 3. F&B: one row per (branch, date)
ALTER TABLE fnb_daily_metrics
  DROP CONSTRAINT IF EXISTS fnb_daily_metrics_branch_date_unique;

ALTER TABLE fnb_daily_metrics
  ADD CONSTRAINT fnb_daily_metrics_branch_date_unique
  UNIQUE (branch_id, metric_date);
