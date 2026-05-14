import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendNotification } from '@/lib/notifications/send'
import MissedEntryReminder from '@/lib/email/templates/missedEntryReminder'

// Entry reminders are turned OFF for all roles (owner, manager, staff) per the
// May 2026 notification strategy. The route is preserved (not deleted) so any
// residual cron invocation no-ops with 200 instead of 404. The cron entry has
// also been removed from vercel.json.
//
// To re-enable: set MISSED_ENTRY_REMINDERS_ENABLED=true in the Vercel env AND
// re-add the cron entry to vercel.json. The original implementation below
// stays intact and runs when the env var is set.
const MISSED_ENTRY_ENABLED = process.env.MISSED_ENTRY_REMINDERS_ENABLED === 'true'

export async function POST(req: NextRequest) {
  if (!MISSED_ENTRY_ENABLED) {
    return NextResponse.json({ ok: true, disabled: 'entry reminders are off for all roles' })
  }

  console.log('missed-entry route called at', new Date().toISOString())

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.log('missed-entry: unauthorized')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Use Bangkok date (UTC+7), not UTC
  const bangkokNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }))
  const today = `${bangkokNow.getFullYear()}-${String(bangkokNow.getMonth() + 1).padStart(2, '0')}-${String(bangkokNow.getDate()).padStart(2, '0')}`
  console.log('missed-entry: checking for date', today)

  try {
    // Get all branches
    const { data: branches, error: branchErr } = await supabase.from('branches').select('id, name, organization_id, business_type')
    if (branchErr) {
      console.error('missed-entry: failed to fetch branches:', branchErr.message)
      return NextResponse.json({ error: branchErr.message }, { status: 500 })
    }
    console.log('missed-entry: found', branches?.length, 'branches')

    const results: { branch: string; status: string; error?: string }[] = []

    for (const branch of branches || []) {
      try {
        // Check if entry exists for today using branch_daily_metrics view
        const { data: entry, error: entryErr } = await supabase
          .from('branch_daily_metrics')
          .select('id')
          .eq('branch_id', branch.id)
          .eq('metric_date', today)
          .maybeSingle()

        if (entryErr) {
          console.error(`missed-entry: error checking entry for ${branch.name}:`, entryErr.message)
        }

        if (entry) {
          console.log(`missed-entry: ${branch.name} already has entry for ${today}, skipping`)
          continue
        }

        console.log(`missed-entry: ${branch.name} has NO entry for ${today}, sending reminder`)

        // Get owner(s) for this org
        const { data: owners, error: ownerErr } = await supabase
          .from('organization_members')
          .select('user_id')
          .eq('organization_id', branch.organization_id)
          .eq('role', 'owner')

        if (ownerErr) {
          console.error(`missed-entry: error fetching owners for ${branch.name}:`, ownerErr.message)
          continue
        }
        console.log(`missed-entry: found ${owners?.length} owners for ${branch.name}`)

        for (const owner of owners || []) {
          try {
            // Check not already sent today
            const { data: alreadySent } = await supabase
              .from('notification_log')
              .select('id')
              .eq('user_id', owner.user_id)
              .eq('notification_type', 'missed_entry_reminder')
              .eq('metric_date', today)
              .eq('branch_id', branch.id)
              .maybeSingle()

            if (alreadySent) {
              console.log(`missed-entry: already sent to ${owner.user_id} for ${branch.name}, skipping`)
              continue
            }

            // Count 7-day streak
            const sevenDaysAgo = new Date(bangkokNow)
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
            const sevenDaysAgoStr = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getDate()).padStart(2, '0')}`

            const { data: recentEntries } = await supabase
              .from('branch_daily_metrics')
              .select('metric_date')
              .eq('branch_id', branch.id)
              .gte('metric_date', sevenDaysAgoStr)
            const streakDays = recentEntries?.length || 0

            console.log(`missed-entry: sending to owner ${owner.user_id} for ${branch.name} (streak: ${streakDays}/7)`)

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

            results.push({ branch: branch.name, status: 'sent' })
            console.log(`missed-entry: sent successfully for ${branch.name}`)
          } catch (err) {
            console.error(`missed-entry: error sending for ${branch.name}:`, (err as Error).message)
            results.push({ branch: branch.name, status: 'error', error: (err as Error).message })
          }
        }
      } catch (err) {
        console.error(`missed-entry: error processing branch ${branch.name}:`, (err as Error).message)
        results.push({ branch: branch.name, status: 'error', error: (err as Error).message })
      }
    }

    console.log('missed-entry: done, results:', JSON.stringify(results))
    return NextResponse.json({ sent: results.filter(r => r.status === 'sent').length, results })
  } catch (err) {
    console.error('missed-entry: top-level error:', (err as Error).message, (err as Error).stack)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
