import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  // Verify user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { table, entry, existingId } = body

  // Validate table name
  if (table !== 'accommodation_daily_metrics' && table !== 'fnb_daily_metrics') {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
  }

  if (!entry?.branch_id || !entry?.metric_date) {
    return NextResponse.json({ error: 'Missing branch_id or metric_date' }, { status: 400 })
  }

  // Verify user has access to this branch
  const serviceClient = createServiceClient()
  const { data: branch } = await serviceClient
    .from('branches')
    .select('organization_id')
    .eq('id', entry.branch_id)
    .single()

  if (!branch) {
    return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
  }

  // Check user is member of this org or branch
  const { data: orgMember } = await serviceClient
    .from('organization_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', branch.organization_id)
    .maybeSingle()

  const { data: branchMember } = await serviceClient
    .from('branch_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('branch_id', entry.branch_id)
    .maybeSingle()

  if (!orgMember && !branchMember) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Use service client to bypass RLS triggers on branch_status_current
  try {
    if (existingId) {
      const { error } = await serviceClient.from(table).update(entry).eq('id', existingId)
      if (error) {
        console.error('Entry update error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else {
      const { error } = await serviceClient.from(table).insert(entry)
      if (error) {
        console.error('Entry insert error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Entry save error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
