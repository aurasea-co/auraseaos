import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendNotification } from '@/lib/notifications/send'
import MissedEntryReminder from '@/lib/email/templates/missedEntryReminder'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  // Get all branches
  const { data: branches } = await supabase.from('branches').select('id, name, organization_id, business_type')
  const results: string[] = []

  for (const branch of branches || []) {
    const table = branch.business_type === 'accommodation' ? 'accommodation_daily_metrics' : 'fnb_daily_metrics'

    // Check if entry exists for today
    const { data: entry } = await supabase.from(table).select('id').eq('branch_id', branch.id).eq('metric_date', today).maybeSingle()
    if (entry) continue // Already submitted

    // Get owner(s) for this org
    const { data: owners } = await supabase.from('organization_members').select('user_id').eq('organization_id', branch.organization_id).eq('role', 'owner')

    for (const owner of owners || []) {
      // Check not already sent today
      const { data: alreadySent } = await supabase.from('notification_log').select('id').eq('user_id', owner.user_id).eq('notification_type', 'missed_entry_reminder').eq('metric_date', today).eq('branch_id', branch.id).maybeSingle()
      if (alreadySent) continue

      // Count 7-day streak
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const { data: recentEntries } = await supabase.from(table).select('metric_date').eq('branch_id', branch.id).gte('metric_date', sevenDaysAgo.toISOString().split('T')[0])
      const streakDays = recentEntries?.length || 0

      await sendNotification({
        userId: owner.user_id,
        organizationId: branch.organization_id,
        branchId: branch.id,
        type: 'missed_entry_reminder',
        emailSubject: `⚠ ยังไม่ได้กรอกข้อมูลวันนี้ — ${branch.name}`,
        emailReact: <MissedEntryReminder branchName={branch.name} lang="th" streakDays={streakDays} entryUrl="https://auraseaos.com/entry" />,
        lineMessage: `⚠ ${branch.name} ยังไม่มีการกรอกข้อมูลวันนี้\nกรอกได้ที่ https://auraseaos.com/entry`,
        metricDate: today,
      })

      results.push(branch.name)
    }
  }

  return NextResponse.json({ sent: results.length, branches: results })
}
