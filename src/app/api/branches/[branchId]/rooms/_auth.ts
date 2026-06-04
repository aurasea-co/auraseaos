// Shared auth + role gate for the rooms-config API surface.
//
// Resolves the caller against BOTH organization_members (owner /
// manager) AND branch_members (manager / branch_manager) — same
// pattern as the morning-flash route — so a user attached only to a
// branch (not the org) still gets recognised as a manager.
//
// Mutations on this surface (add / edit / delete a room type) are
// allowed for owner OR manager. Staff get 403. Unauthenticated callers
// get 401. The handler hands the auth result back so the caller can
// short-circuit with the right NextResponse code.

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export type RoomsRole = 'owner' | 'manager'

export interface RoomsAuthOk {
  ok: true
  userId: string
  branch: { id: string; organization_id: string }
  role: RoomsRole
}

export interface RoomsAuthFail {
  ok: false
  response: NextResponse
}

export async function authorizeRoomsMutation(branchId: string): Promise<RoomsAuthOk | RoomsAuthFail> {
  const userClient = await createClient()
  const { data: userRes } = await userClient.auth.getUser()
  const user = userRes?.user
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'unauthenticated', code: 'unauthenticated' },
        { status: 401 },
      ),
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ub = userClient as any
  const { data: branch } = await ub
    .from('branches')
    .select('id, organization_id, business_type')
    .eq('id', branchId)
    .maybeSingle()
  if (!branch) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'branch_not_found', code: 'branch_not_found' },
        { status: 404 },
      ),
    }
  }
  if (branch.business_type !== 'accommodation') {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'wrong_business_type', code: 'wrong_business_type' },
        { status: 400 },
      ),
    }
  }

  // Role resolution: owner via org membership, manager via either
  // org membership or branch membership. Tracks the role we settle on
  // so the audit log can carry it.
  const { data: orgMembership } = await ub
    .from('organization_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', branch.organization_id)
    .maybeSingle()

  if (orgMembership?.role === 'owner') {
    return { ok: true, userId: user.id, branch, role: 'owner' }
  }
  if (orgMembership?.role === 'manager') {
    return { ok: true, userId: user.id, branch, role: 'manager' }
  }

  const { data: branchMembership } = await ub
    .from('branch_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('branch_id', branchId)
    .maybeSingle()
  if (
    branchMembership?.role === 'manager' ||
    branchMembership?.role === 'branch_manager'
  ) {
    return { ok: true, userId: user.id, branch, role: 'manager' }
  }

  return {
    ok: false,
    response: NextResponse.json(
      { success: false, error: 'owner_or_manager_only', code: 'owner_or_manager_only' },
      { status: 403 },
    ),
  }
}
