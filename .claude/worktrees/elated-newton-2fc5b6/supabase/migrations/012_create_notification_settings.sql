-- Notification preferences per user per organization
CREATE TABLE IF NOT EXISTS notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email_notifications boolean DEFAULT true,
  line_notify_enabled boolean DEFAULT false,
  line_notify_token text,
  morning_flash_time time DEFAULT '09:00',
  entry_reminder_enabled boolean DEFAULT true,
  entry_reminder_time time DEFAULT '22:00',
  labour_alert_enabled boolean DEFAULT false,
  cogs_alert_enabled boolean DEFAULT false,
  weekly_report_enabled boolean DEFAULT false,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, organization_id)
);

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_notifications" ON notification_settings
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "super_admin_notifications" ON notification_settings
  FOR ALL USING (public.is_super_admin());
