import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Shared super_admin gate for /api/superadmin/* routes. Returns the
// caller's id when they have a platform_admins row with role
// 'super_admin', or a 401/403 response shape otherwise.

export async function authenticateSuperAdmin(): Promise<
  | { ok: true; userId: string; userEmail: string | null }
  | { ok: false; status: number; error: string }
> {
  const userClient = await createClient()
  const { data: userRes } = await userClient.auth.getUser()
  const user = userRes?.user
  if (!user) return { ok: false, status: 401, error: 'Not authenticated' }

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db
    .from('platform_admins')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return { ok: false, status: 500, error: error.message }
  if (!data || data.role !== 'super_admin') {
    return { ok: false, status: 403, error: 'Super admin required' }
  }

  return { ok: true, userId: user.id, userEmail: user.email ?? null }
}
