import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { authenticateOwner } from '../_lib'

// DELETE /api/team/cancel-invite
//   { organizationId, invitationId }

export async function DELETE(req: NextRequest) {
  let body: { organizationId?: string; invitationId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { organizationId, invitationId } = body
  if (!organizationId || !invitationId) {
    return NextResponse.json(
      { error: 'organizationId and invitationId required' },
      { status: 400 },
    )
  }

  const auth = await authenticateOwner(organizationId)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { error } = await db
    .from('invitations')
    .delete()
    .eq('id', invitationId)
    .eq('organization_id', organizationId)
    .is('accepted_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
