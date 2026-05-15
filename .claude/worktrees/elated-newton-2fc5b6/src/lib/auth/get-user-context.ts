import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserContext, AppRole, Organization, Branch } from '@/lib/supabase/types'

export async function getUserContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
  userEmail: string
): Promise<UserContext> {
  // Parallel queries for role detection — use separate queries to avoid join type issues
  const [orgMemberResult, branchMemberResult, superAdminResult] =
    await Promise.all([
      supabase
        .from('organization_members')
        .select('id, organization_id, user_id, role')
        .eq('user_id', userId),
      supabase
        .from('branch_members')
        .select('id, branch_id, user_id, role')
        .eq('user_id', userId),
      supabase
        .from('platform_admins')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle(),
    ])

  const isSuperAdmin = !!superAdminResult.data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgMemberships = (orgMemberResult.data || []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const branchMemberships = (branchMemberResult.data || []) as any[]

  // Determine primary role
  let role: AppRole = 'staff'
  let organization: Organization | null = null
  let plan: UserContext['plan'] = 'starter'

  if (isSuperAdmin) {
    role = 'superadmin'
  }

  // Check org-level role first
  if (orgMemberships.length > 0) {
    const membership = orgMemberships[0]
    role = membership.role as AppRole

    // Fetch the organization
    const orgResult = await supabase
      .from('organizations')
      .select('*')
      .eq('id', membership.organization_id)
      .single()
    organization = orgResult.data as Organization | null
    plan = organization?.plan || 'starter'
  } else if (branchMemberships.length > 0) {
    // Branch-only member
    const firstBranch = branchMemberships[0]
    if (firstBranch.role === 'branch_manager' || firstBranch.role === 'manager') {
      role = 'manager'
    } else {
      role = 'staff'
    }

    // Get org via the branch
    const branchResult = await supabase
      .from('branches')
      .select('organization_id')
      .eq('id', firstBranch.branch_id)
      .single()

    if (branchResult.data) {
      const orgResult = await supabase
        .from('organizations')
        .select('*')
        .eq('id', branchResult.data.organization_id)
        .single()
      organization = orgResult.data as Organization | null
      plan = organization?.plan || 'starter'
    }
  }

  // Trial override: during active trial, grant Pro access regardless of selected plan
  if (organization?.is_trial && organization.trial_started_at) {
    const trialEnd = new Date(organization.trial_started_at)
    trialEnd.setDate(trialEnd.getDate() + 14)
    if (new Date() < trialEnd) {
      plan = 'pro'
    }
  }

  // Get all accessible branches
  let branches: Branch[] = []
  if (organization) {
    const branchResult = await supabase
      .from('branches')
      .select('*')
      .eq('organization_id', organization.id)
      .order('name')
    branches = (branchResult.data || []) as Branch[]
  } else if (branchMemberships.length > 0) {
    const branchIds = branchMemberships.map((bm: { branch_id: string }) => bm.branch_id)
    const branchResult = await supabase
      .from('branches')
      .select('*')
      .in('id', branchIds)
      .order('name')
    branches = (branchResult.data || []) as Branch[]
  }

  // Override role for super admin but keep org context
  if (isSuperAdmin && role !== 'owner') {
    role = 'superadmin'
  }

  return {
    user: { id: userId, email: userEmail },
    role,
    organization,
    branches,
    activeBranch: branches[0] || null,
    plan,
    isSuperAdmin,
  }
}
