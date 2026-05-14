import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendNotification } from '@/lib/notifications/send'
import LabourAlert from '@/lib/email/templates/labourAlert'
import { getTodayBangkok } from '@/lib/businessDate'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { branchId, organizationId, labourPct, threshold, occupancy, covers, coversTarget } = body

  if (!branchId || !organizationId) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const today = getTodayBangkok()

  const { data: branch } = await supabase.from('branches').select('name, business_type').eq('id', branchId).single()
  if (!branch) return NextResponse.json({ error: 'Branch not found' }, { status: 404 })

  // Per-org 24h throttle: at most one successful labour alert per organization
  // every 24 hours, regardless of branch. Prevents alert spam when multiple
  // branches breach the threshold on the same day or when this endpoint is
  // re-invoked within the window. `status = 'sent'` so a failed delivery does
  // not lock out a legitimate retry.
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: recentAlert } = await supabase
    .from('notification_log')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('notification_type', 'labour_alert')
    .eq('status', 'sent')
    .gte('sent_at', twentyFourHoursAgo)
    .limit(1)
    .maybeSingle()

  if (recentAlert) {
    return NextResponse.json({ throttled: true, reason: 'labour_alert sent within last 24h for this org' })
  }

  const { data: owners } = await supabase.from('organization_members').select('user_id').eq('organization_id', organizationId).eq('role', 'owner')

  for (const owner of owners || []) {
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
