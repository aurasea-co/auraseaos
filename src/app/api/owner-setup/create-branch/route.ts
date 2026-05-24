import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// POST /api/owner-setup/create-branch
//   { organizationId, branchName, businessType,
//     totalRooms?, totalSeats? }
//
// Step 3 of the /owner-setup wizard. Creates the first branch + a
// notification_settings row keyed to the new owner so the daily LINE
// summary defaults to ON for them.

interface Body {
  organizationId?: string
  branchName?: string
  businessType?: 'accommodation' | 'fnb'
  totalRooms?: number | null
  totalSeats?: number | null
}

export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const organizationId = body.organizationId
  const branchName = body.branchName?.trim() || ''
  const businessType = body.businessType
  if (!organizationId || !branchName || !businessType) {
    return NextResponse.json(
      { error: 'organizationId + branchName + businessType required' },
      { status: 400 },
    )
  }

  const userClient = await createClient()
  const { data: userRes } = await userClient.auth.getUser()
  const user = userRes?.user
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Caller must be the owner of this org (set up in step 2).
  const { data: ownerRow } = await db
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!ownerRow || ownerRow.role !== 'owner') {
    return NextResponse.json({ error: 'Owner role required' }, { status: 403 })
  }

  const isHotel = businessType === 'accommodation'
  const { data: branch, error: branchErr } = await db
    .from('branches')
    .insert({
      id: crypto.randomUUID(),
      organization_id: organizationId,
      name: branchName,
      business_type: businessType,
      module_type: businessType,
      total_rooms: isHotel ? body.totalRooms || null : null,
      total_seats: isHotel ? null : body.totalSeats || null,
      business_day_cutoff_time: isHotel ? '14:00:00' : '05:00:00',
    })
    .select('id')
    .single()

  if (branchErr || !branch) {
    return NextResponse.json({ error: branchErr?.message || 'Failed to create branch' }, { status: 500 })
  }

  // Default notification settings — owners get the morning summary
  // by email until they connect LINE.
  await db.from('notification_settings').upsert(
    {
      user_id: user.id,
      organization_id: organizationId,
      email_notifications: true,
      line_notify_enabled: false,
      entry_reminder_enabled: false,
    },
    { onConflict: 'user_id,organization_id', ignoreDuplicates: true },
  )

  return NextResponse.json({ success: true, branchId: branch.id })
}
