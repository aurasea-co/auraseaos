import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail, EMAIL_SENDERS } from '@/lib/email/resend'
import TrialReminderEmail from '@/lib/email/templates/trialReminderEmail'
import TrialExpiredEmail from '@/lib/email/templates/trialExpiredEmail'

// GET /api/notifications/trial-reminder
//
// Daily cron (see vercel.json). Two passes:
//   1. WARN — trial orgs whose trial_ends_at is within ~5 days from
//      now (and we haven't already warned in the last 24h) get a
//      reminder email pointing at /settings/billing.
//   2. EXPIRE — trial orgs whose trial_ends_at has passed flip to
//      status='expired' and receive the "trial ended" email.
//
// We dedupe via notification_log so a re-run inside the same window
// doesn't double-send.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.auraseaos.com'

interface OrgRow {
  id: string
  name: string
  status: string
  trial_ends_at: string | null
  discount_pct: number | null
}

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true
  const auth = req.headers.get('authorization')
  return !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const now = new Date()
  const fiveDaysOut = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)

  let warned = 0
  let expired = 0
  const errors: string[] = []

  // ---- WARN ---------------------------------------------------------------
  const { data: warnOrgs } = await db
    .from('organizations')
    .select('id, name, status, trial_ends_at, discount_pct')
    .eq('status', 'trial')
    .gt('trial_ends_at', now.toISOString())
    .lte('trial_ends_at', fiveDaysOut.toISOString())

  for (const org of (warnOrgs || []) as OrgRow[]) {
    try {
      const owner = await fetchOwner(db, org.id)
      if (!owner) continue

      // Dedupe — skip if we've sent a warn email for this org in the
      // last 24 hours (so re-running the cron the same day is safe).
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
      const { count: existing } = await db
        .from('notification_log')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', org.id)
        .eq('notification_type', 'trial_reminder')
        .gte('created_at', oneDayAgo)
      if ((existing || 0) > 0) continue

      const daysRemaining = Math.max(
        1,
        Math.ceil((new Date(org.trial_ends_at!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      )
      const stats = await fetchUsageStats(db, org.id)

      const result = await sendEmail({
        to: owner.email,
        from: EMAIL_SENDERS.notifications,
        subject: `การทดลองใช้ Aurasea OS ของคุณจะสิ้นสุดในอีก ${daysRemaining} วัน`,
        react: TrialReminderEmail({
          organizationName: org.name,
          daysRemaining,
          daysWithData: stats.daysWithData,
          totalRevenueLogged: stats.totalRevenue,
          discountPct: org.discount_pct || 0,
          upgradeUrl: `${APP_URL}/settings/billing`,
        }),
        organizationId: org.id,
        userId: owner.userId,
        notificationType: 'trial_reminder',
      })
      if (result.success) warned++
      else if (result.error) errors.push(`warn:${org.id}:${result.error}`)
    } catch (err) {
      errors.push(`warn:${org.id}:${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  // ---- EXPIRE -------------------------------------------------------------
  const { data: expireOrgs } = await db
    .from('organizations')
    .select('id, name, status, trial_ends_at, discount_pct')
    .eq('status', 'trial')
    .lt('trial_ends_at', now.toISOString())

  for (const org of (expireOrgs || []) as OrgRow[]) {
    try {
      const { error: updErr } = await db
        .from('organizations')
        .update({ status: 'expired' })
        .eq('id', org.id)
      if (updErr) {
        errors.push(`expire:${org.id}:${updErr.message}`)
        continue
      }

      const owner = await fetchOwner(db, org.id)
      if (!owner) continue
      const stats = await fetchUsageStats(db, org.id)

      // Discount window: 7 days after trial end. After that the
      // promo expires.
      const discountExpiresAt = new Date(
        new Date(org.trial_ends_at!).getTime() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString()

      const result = await sendEmail({
        to: owner.email,
        from: EMAIL_SENDERS.notifications,
        subject: 'การทดลองใช้ Aurasea OS สิ้นสุดแล้ว — ต่ออายุวันนี้รับส่วนลด',
        react: TrialExpiredEmail({
          organizationName: org.name,
          daysWithData: stats.daysWithData,
          discountPct: org.discount_pct || 0,
          discountExpiresAt,
          upgradeUrl: `${APP_URL}/settings/billing`,
        }),
        organizationId: org.id,
        userId: owner.userId,
        notificationType: 'trial_expired',
      })
      if (result.success) expired++
      else if (result.error) errors.push(`expire-email:${org.id}:${result.error}`)
    } catch (err) {
      errors.push(`expire:${org.id}:${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  return NextResponse.json({ ok: true, warned, expired, errors })
}

// ---- helpers --------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchOwner(db: any, organizationId: string): Promise<{ userId: string; email: string } | null> {
  const { data: owners } = await db
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', organizationId)
    .eq('role', 'owner')
    .limit(1)
  const ownerRow = (owners || [])[0]
  if (!ownerRow) return null

  // Prefer profile-mirrored email; fall back to auth.users.
  const { data: profile } = await db
    .from('profiles')
    .select('email')
    .eq('user_id', ownerRow.user_id)
    .maybeSingle()
  if (profile?.email) return { userId: ownerRow.user_id, email: profile.email }

  // Fallback — listUsers is paginated; in practice the owner is in
  // the first page since we just need one user.
  try {
    const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = (list?.users || []).find((x: any) => x.id === ownerRow.user_id)
    if (u?.email) return { userId: ownerRow.user_id, email: u.email }
  } catch {
    // ignore
  }
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchUsageStats(db: any, organizationId: string): Promise<{ daysWithData: number; totalRevenue: number }> {
  // Grab the org's branches, then count metric rows + sum revenue
  // across both daily-metric tables.
  const { data: branches } = await db
    .from('branches')
    .select('id')
    .eq('organization_id', organizationId)
  const branchIds = (branches || []).map((b: { id: string }) => b.id)
  if (!branchIds.length) return { daysWithData: 0, totalRevenue: 0 }

  let totalRevenue = 0
  const datesSeen = new Set<string>()

  const [fnbRes, hotelRes] = await Promise.all([
    db.from('fnb_daily_metrics').select('metric_date, revenue').in('branch_id', branchIds),
    db.from('accommodation_daily_metrics').select('metric_date, revenue').in('branch_id', branchIds),
  ])

  for (const row of (fnbRes?.data || []) as Array<{ metric_date: string; revenue: number | null }>) {
    if (row.metric_date) datesSeen.add(row.metric_date)
    totalRevenue += row.revenue || 0
  }
  for (const row of (hotelRes?.data || []) as Array<{ metric_date: string; revenue: number | null }>) {
    if (row.metric_date) datesSeen.add(row.metric_date)
    totalRevenue += row.revenue || 0
  }

  return { daysWithData: datesSeen.size, totalRevenue }
}
