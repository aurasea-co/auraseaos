import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendNotification } from '@/lib/notifications/send'
import MorningFlash from '@/lib/email/templates/morningFlash'
import { buildMorningFlashLine } from '@/lib/line/messaging'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { branchId, organizationId, metricDate, metrics } = body

  if (!branchId || !organizationId) {
    return NextResponse.json({ error: 'Missing branchId or organizationId' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Get branch + org info
  const { data: branch } = await supabase.from('branches').select('*').eq('id', branchId).single()
  const { data: org } = await supabase.from('organizations').select('*').eq('id', organizationId).single()
  if (!branch || !org) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Get owner(s)
  const { data: owners } = await supabase.from('organization_members').select('user_id').eq('organization_id', organizationId).eq('role', 'owner')

  const dateStr = new Date(metricDate + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })

  const recommendation = (metrics.margin || 0) >= 32 ? 'Margin ตามเป้า — ดีมาก!' : 'Margin ต่ำกว่าเป้า — ตรวจสอบต้นทุนพรุ่งนี้'

  for (const owner of owners || []) {
    await sendNotification({
      userId: owner.user_id,
      organizationId,
      branchId,
      type: 'closing_summary',
      emailSubject: `สรุปปิดร้าน: ${branch.name} — ${dateStr}`,
      emailReact: <MorningFlash
        branchName={branch.name}
        businessDate={dateStr}
        lang="th"
        branchType="fnb"
        margin={metrics.margin}
        covers={metrics.covers}
        sales={metrics.sales}
        recommendationText={recommendation}
        plan={org.plan}
        entryUrl="https://auraseaos.com/entry"
      />,
      lineMessage: buildMorningFlashLine({
        branchName: branch.name,
        branchType: 'fnb',
        date: dateStr,
        margin: metrics.margin,
        covers: metrics.covers,
        sales: metrics.sales,
        recommendation,
      }),
      metricDate,
    })
  }

  return NextResponse.json({ success: true })
}
