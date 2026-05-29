-- Grace-period column on organizations
--
-- We don't have a separate `subscriptions` table — plan + trial state
-- live directly on `organizations` (status, trial_ends_at, plan,
-- discount_pct, promo_code, trial_days), populated by the owner-setup
-- flow in migration 025. This migration adds the grace-period
-- dimension: when trial_ends_at passes, the org enters a `grace`
-- phase for `grace_period_days` more days before any hard lockout.
-- Read access stays open through grace; only new-data-write actions
-- (the daily entry route) consult this column to decide whether to
-- refuse the write.
--
-- 7-day default mirrors the existing 7-day discount window we already
-- surface in the trial-ending banner on /settings/billing.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS grace_period_days INTEGER NOT NULL DEFAULT 7;

-- Defensive backfill — existing rows pick up the default at ADD
-- COLUMN time, but list it explicitly so a re-run against a partially
-- patched env converges.
UPDATE organizations SET grace_period_days = 7 WHERE grace_period_days IS NULL;
