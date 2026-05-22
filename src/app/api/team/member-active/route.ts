import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { authenticateOwner } from '../_lib'

// PATCH /api/team/member-active
//   { organizationId, membershipId, source: 'org'|'branch', isActive }
//
// Toggles is_active on a single membership row. Owner-only. Refuses
// to toggle owners (you can't suspend an owner — including yourself).

interface Body {
  organizationId?: string
  membershipId?: string
  source?: 'org' | 'branch'
  isActive?: boolean
}

export async function PATCH(req: NextRequest) {
  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { organizationId, membershipId, source, isActive } = body
  if (!organizationId || !membershipId || !source || typeof isActive !== 'boolean') {
    return NextResponse.json(
      { error: 'organizationId, membershipId, source, isActive required' },
      { status: 400 },
    )
  }
  if (source !== 'org' && source !== 'branch') {
    return NextResponse.json({ error: 'source must be org or branch' }, { status: 400 })
  }

  const auth = await authenticateOwner(organizationId)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const table = source === 'org' ? 'organization_members' : 'branch_members'

  // Verify the membership belongs to the requested org + isn't an owner.
  if (source === 'org') {
    const { data: row, error } = await db
      .from('organization_members')
      .select('id, organization_id, role')
      .eq('id', membershipId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!row || row.organization_id !== organizationId) {
      return NextResponse.json({ error: 'Membership not found' }, { status: 404 })
    }
    if (row.role === 'owner') {
      return NextResponse.json({ error: 'Cannot suspend an owner' }, { status: 403 })
    }
  } else {
    const { data: row, error } = await db
      .from('branch_members')
      .select('id, branch_id, branches!inner ( organization_id )')
      .eq('id', membershipId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!row || row.branches?.organization_id !== organizationId) {
      return NextResponse.json({ error: 'Membership not found' }, { status: 404 })
    }
  }

  const { error: updateErr } = await db
    .from(table)
    .update({ is_active: isActive })
    .eq('id', membershipId)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
