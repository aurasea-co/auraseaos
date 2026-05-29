-- Phase R1: RateDesk hotel vertical
--
-- Two changes:
--   1. competitor_rates — new table for tracking competitor rate
--      snapshots. Owner enters them manually for now; scrape /
--      email_report ingestion comes later.
--   2. accommodation_daily_metrics.room_type_breakdown — jsonb column
--      that CSV import populates with per-room-type occupancy data,
--      so the RateDesk dashboard can render the room-type table.
--      Other code paths (entry route, morning-flash, weekly-report)
--      keep working without touching this column.
--
-- THB stored as plain numeric, matching the existing convention in
-- accommodation_daily_metrics. Satang convention from the spec
-- doesn't apply here — every existing consumer reads numeric THB.

CREATE TABLE IF NOT EXISTS competitor_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  competitor_name TEXT NOT NULL,
  room_type TEXT NOT NULL,
  rate NUMERIC(12, 2) NOT NULL,
  captured_at DATE NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'scrape', 'email_report')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitor_rates_branch_date
  ON competitor_rates(branch_id, captured_at DESC);

ALTER TABLE competitor_rates ENABLE ROW LEVEL SECURITY;

-- Org-scoped via branch → organization_members. Same pattern as the
-- existing branch_members read policies; service-role bypasses for
-- the CSV import server route.
CREATE POLICY "members_read_competitor_rates" ON competitor_rates
  FOR SELECT USING (
    branch_id IN (
      SELECT b.id FROM branches b
      WHERE b.organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
      OR b.id IN (
        SELECT branch_id FROM branch_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "owner_write_competitor_rates" ON competitor_rates
  FOR ALL USING (
    branch_id IN (
      SELECT b.id FROM branches b
      WHERE b.organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND role = 'owner'
      )
    )
  );

-- Room-type breakdown on the existing accommodation_daily_metrics.
-- Shape:
--   [{ "roomType": "Deluxe", "totalRooms": 12, "occupiedRooms": 8,
--      "rateThb": 1850 }, ...]
-- Populated by the CSV adapter when a multi-row-per-date import
-- includes a room_type column. Form-driven entries leave it null;
-- everything still works.
ALTER TABLE accommodation_daily_metrics
  ADD COLUMN IF NOT EXISTS room_type_breakdown JSONB;
