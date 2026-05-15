-- User profiles for display name, contact info, preferences
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  phone text,
  line_id text,
  language text DEFAULT 'th' CHECK (language IN ('th', 'en')),
  timezone text DEFAULT 'Asia/Bangkok',
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_user ON profiles(user_id);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_profile" ON profiles
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "super_admin_profiles" ON profiles
  FOR ALL USING (public.is_super_admin());
