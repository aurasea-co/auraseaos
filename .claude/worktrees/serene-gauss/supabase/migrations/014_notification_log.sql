-- Notification log — track all sent notifications
CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  channel text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  metric_date date,
  status text DEFAULT 'sent',
  error_text text
);

CREATE INDEX IF NOT EXISTS idx_notification_log_org_type_date
  ON notification_log(organization_id, notification_type, metric_date);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_read_notification_log" ON notification_log
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

CREATE POLICY "service_insert_notification_log" ON notification_log
  FOR INSERT WITH CHECK (true);

-- Add Line Notify columns to notification_settings if not exist
ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS line_notify_token text,
  ADD COLUMN IF NOT EXISTS line_notify_connected_at timestamptz;
