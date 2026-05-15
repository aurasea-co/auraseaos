-- Audit log table for tracking all admin/owner actions
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_entity TEXT,
  target_id TEXT,
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON audit_log(target_entity, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

-- RLS
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Only super admins can read audit logs
CREATE POLICY "Super admins read audit logs"
  ON audit_log FOR SELECT
  USING (public.is_super_admin());

-- Any authenticated user can insert (their actions get logged)
CREATE POLICY "Authenticated users can insert audit logs"
  ON audit_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
