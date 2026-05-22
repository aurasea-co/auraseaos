import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { authenticateOwner } from '../_lib'

// GET /api/team/members?organizationId=...
//
// Returns two arrays:
//   members[]: everyone with an active OR inactive membership (org or branch)
//   pending[]: invitations with accepted_at IS NULL and not expired
//
// We use the service-role client so we can read auth.users emails for
// members whose profile.email field hasn't been backfilled yet. As a
// nice side effect, this route also writes any discovered emails back
// to profiles so subsequent loads don't need the auth.users lookup.

interface MemberRow {
  membership_id: string
  user_id: string
  source: 'org' | 'branch'
  role: string
  branch_id: string | null
  branch_name: string | null
  display_name: string | null
  email: string | null
  is_active: boolean
  last_seen: string | null
}

interface PendingRow {
  id: string
  invitee_email: string
  role: 'manager' | 'staff'
  branch_id: string | null
  branch_name: string | null
  created_at: string
  expires_at: string
}

export async function GET(req: NextRequest) {
  const organizationId = req.nextUrl.searchParams.get('organizationId')
  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
  }

  const auth = await authenticateOwner(organizationId)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // 1) All branches in this org (used to filter branch_members + label rows)
  const { data: branches } = await db
    .from('branches')
    .select('id, name')
    .eq('organization_id', organizationId)
  const branchMap = new Map<string, string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (branches || []).map((b: any) => [b.id as string, b.name as string]),
  )
  const branchIds = Array.from(branchMap.keys())

  // 2) Org members
  const { data: orgMembers, error: orgErr } = await db
    .from('organization_members')
    .select('id, user_id, role, is_active')
    .eq('organization_id', organizationId)
  if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 })

  // 3) Branch members for branches in this org
  const branchMembersResult = branchIds.length
    ? await db
        .from('branch_members')
        .select('id, user_id, role, branch_id, is_active')
        .in('branch_id', branchIds)
    : { data: [], error: null }
  if (branchMembersResult.error) {
    return NextResponse.json({ error: branchMembersResult.error.message }, { status: 500 })
  }

  // 4) Collect user_ids + dedupe (prefer org row when both present)
  type Raw = {
    membership_id: string
    user_id: string
    source: 'org' | 'branch'
    role: string
    branch_id: string | null
    is_active: boolean
  }
  const raw: Raw[] = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(orgMembers || []).map((m: any) => ({
      membership_id: m.id,
      user_id: m.user_id,
      source: 'org' as const,
      role: m.role,
      branch_id: null,
      is_active: m.is_active !== false,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(branchMembersResult.data || []).map((m: any) => ({
      membership_id: m.id,
      user_id: m.user_id,
      source: 'branch' as const,
      role: m.role,
      branch_id: m.branch_id,
      is_active: m.is_active !== false,
    })),
  ]

  const byUser = new Map<string, Raw>()
  for (const r of raw) {
    const existing = byUser.get(r.user_id)
    if (!existing || (existing.source === 'branch' && r.source === 'org')) {
      byUser.set(r.user_id, r)
    }
  }
  const userIds = Array.from(byUser.keys())

  // 5) profiles
  const profileResult = userIds.length
    ? await db
        .from('profiles')
        .select('user_id, display_name, email, updated_at')
        .in('user_id', userIds)
    : { data: [], error: null }
  if (profileResult.error) {
    return NextResponse.json({ error: profileResult.error.message }, { status: 500 })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profileMap = new Map<string, any>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (profileResult.data || []).map((p: any) => [p.user_id, p]),
  )

  // 6) Backfill emails from auth.users for any profile that's missing one
  const userIdsMissingEmail = userIds.filter((id) => {
    const p = profileMap.get(id)
    return !p?.email
  })

  if (userIdsMissingEmail.length) {
    // listUsers is paginated. We use it instead of admin.getUserById
    // in a loop because for a typical SME org the entire user list
    // is small enough that one page covers it.
    try {
      const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const authMap = new Map<string, string | null>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (list?.users || []).map((u: any) => [u.id as string, (u.email as string) || null]),
      )

      const backfills: { user_id: string; email: string }[] = []
      for (const uid of userIdsMissingEmail) {
        const email = authMap.get(uid)
        if (email) {
          const existing = profileMap.get(uid) || { user_id: uid, display_name: null, email: null, updated_at: null }
          existing.email = email
          profileMap.set(uid, existing)
          backfills.push({ user_id: uid, email })
        }
      }

      // Fire-and-forget: persist what we discovered so next read skips
      // the auth.users lookup entirely.
      if (backfills.length) {
        await db.from('profiles').upsert(backfills, { onConflict: 'user_id' })
      }
    } catch (err) {
      // Don't fail the whole request if auth.admin is unavailable.
      console.warn('[team/members] auth.admin.listUsers failed:', err)
    }
  }

  // 7) Build final member list
  const members: MemberRow[] = Array.from(byUser.values()).map((r) => {
    const p = profileMap.get(r.user_id)
    return {
      membership_id: r.membership_id,
      user_id: r.user_id,
      source: r.source,
      role: r.role,
      branch_id: r.branch_id,
      branch_name: r.branch_id ? branchMap.get(r.branch_id) || null : null,
      display_name: p?.display_name || null,
      email: p?.email || null,
      is_active: r.is_active,
      last_seen: p?.updated_at || null,
    }
  })

  // 8) Pending invitations (not yet accepted, not yet expired)
  const { data: pendingRaw, error: pendingErr } = await db
    .from('invitations')
    .select('id, invitee_email, role, branch_id, created_at, expires_at, accepted_at')
    .eq('organization_id', organizationId)
    .is('accepted_at', null)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  if (pendingErr) return NextResponse.json({ error: pendingErr.message }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pending: PendingRow[] = (pendingRaw || []).map((p: any) => ({
    id: p.id,
    invitee_email: p.invitee_email,
    role: p.role,
    branch_id: p.branch_id,
    branch_name: p.branch_id ? branchMap.get(p.branch_id) || null : null,
    created_at: p.created_at,
    expires_at: p.expires_at,
  }))

  return NextResponse.json({ members, pending })
}
