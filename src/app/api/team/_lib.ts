import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Shared helpers for /api/team/*. Each route checks that the caller
// is the owner of the org being managed before doing anything.

export async function authenticateOwner(organizationId: string): Promise<
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

  const { data: ownerRow, error } = await db
    .from('organization_members')
    .select('role, is_active')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return { ok: false, status: 500, error: error.message }
  if (!ownerRow) return { ok: false, status: 403, error: 'Not a member of this organization' }
  if (ownerRow.role !== 'owner') return { ok: false, status: 403, error: 'Owner role required' }
  if (ownerRow.is_active === false) return { ok: false, status: 403, error: 'Account suspended' }

  return { ok: true, userId: user.id, userEmail: user.email ?? null }
}
