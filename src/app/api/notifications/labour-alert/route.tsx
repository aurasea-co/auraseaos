import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendNotification } from '@/lib/notifications/send'
import LabourAlert from '@/lib/email/templates/labourAlert'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { branchId, organizationId, labourPct, threshold, occupancy, covers, coversTarget } = body

  if (!branchId || !organizationId) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: branch } = await supabase.from('branches').select('name, business_type').eq('id', branchId).single()
  if (!branch) return NextResponse.json({ error: 'Branch not found' }, { status: 404 })

  const { data: owners } = await supabase.from('organization_members').select('user_id').eq('organization_id', organizationId).eq('role', 'owner')

  for (const owner of owners || []) {
    // Check not already sent today
    const { data: alreadySent } = await supabase.from('notification_log').select('id').eq('user_id', owner.user_id).eq('notification_type', 'labour_alert').eq('metric_date', today).eq('branch_id', branchId).maybeSingle()
    if (alreadySent) continue

    await sendNotification({
      userId: owner.user_id,
      organizationId,
      branchId,
      type: 'labour_alert',
      emailSubject: `⚠ Labour cost ${labourPct.toFixed(1)}% เกินเกณฑ์ — ${branch.name}`,
      emailReact: <LabourAlert
        branchName={branch.name}
        lang="th"
        labourPct={labourPct}
        threshold={threshold}
        branchType={branch.business_type}
        occupancy={occupancy}
        covers={covers}
        coversTarget={coversTarget}
      />,
      lineMessage: `⚠ ${branch.name}: Labour cost ${labourPct.toFixed(1)}% สูงกว่าเกณฑ์ ${threshold}%`,
      metricDate: today,
    })
  }

  return NextResponse.json({ success: true })
}
