import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { toBangkokDateStr } from '@/lib/businessDate'

export async function GET(req: NextRequest) {
  const branchId = req.nextUrl.searchParams.get('branchId')
  if (!branchId) return NextResponse.json({ error: 'branchId required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get last 7 days metrics
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 7)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data: branch } = await db.from('branches').select('name, business_type').eq('id', branchId).single()
  const { data: metrics } = await db
    .from('branch_daily_metrics')
    .select('metric_date, revenue, adr, occupancy_rate, revpar, customers, avg_ticket, margin')
    .eq('branch_id', branchId)
    .gte('metric_date', toBangkokDateStr(startDate.toISOString()))
    .order('metric_date', { ascending: true })

  if (!branch || !metrics?.length) {
    return NextResponse.json({ error: 'No data' }, { status: 404 })
  }

  // Build CSV as simple downloadable report (PDF via @react-pdf needs server-side rendering)
  const isHotel = branch.business_type === 'accommodation'
  const headers = isHotel
    ? ['วันที่', 'ADR', 'Occupancy%', 'RevPAR', 'รายได้']
    : ['วันที่', 'Margin%', 'Covers', 'Avg Spend', 'รายได้']

  const rows = metrics.map((m: Record<string, unknown>) =>
    isHotel
      ? [m.metric_date, Math.round(Number(m.adr) || 0), (Number(m.occupancy_rate) || 0).toFixed(1), Math.round(Number(m.revpar) || 0), m.revenue]
      : [m.metric_date, (Number(m.margin) || 0).toFixed(1), m.customers || 0, Math.round(Number(m.avg_ticket) || 0), m.revenue]
  )

  const csv = [headers.join(','), ...rows.map((r: unknown[]) => r.join(','))].join('\n')
  const weekStr = toBangkokDateStr(startDate.toISOString())

  return new Response('\ufeff' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="aurasea-weekly-${branch.name.replace(/\s+/g, '_')}-${weekStr}.csv"`,
    },
  })
}
