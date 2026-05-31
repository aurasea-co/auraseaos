// /api/line/approve-rate — handles the ✓ button tap from the morning
// LINE brief. The route is GET (LINE's in-app browser opens uris as GET)
// and the response is HTML, not JSON, so the user sees a confirmation
// page directly inside LINE.
//
// Security model: the URL token IS the auth. No session cookie, no
// signed payload, no LIFF — just a uuid v4. That's deliberate for MVP:
// owners receive the brief on their own LINE OA, the token expires after
// 20h, and the action is idempotent (re-taps return "already approved",
// no state change). Phase R3 will move to HMAC-signed tokens or LIFF for
// stronger identity binding.
//
// Idempotency: the row's approved_at acts as the lock. First successful
// tap writes it; subsequent taps see approved_at != null and return the
// "already approved" page.

import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasFeature } from '@/lib/auth/plan-features'

type ResultState = 'success' | 'already' | 'expired' | 'not_found' | 'plan_invalid' | 'error'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return htmlResponse('error', 'ลิงก์ไม่ถูกต้อง — ไม่พบ token', 'Invalid link — token missing', 400)
  }

  const supabase = createServiceClient()

  // Pull the approval row + the branch's organization plan in one query.
  // The plan re-check protects against Pro→Growth downgrades that happen
  // between brief generation (token created when org was Pro) and click
  // (org now on Growth — approval should be refused).
  const { data: approval, error: fetchErr } = await supabase
    .from('rate_approvals')
    .select(`
      id, branch_id, room_type, date, suggested_rate_thb,
      approved_at, expires_at,
      branches:branches(name, organization_id, organizations:organizations(plan))
    `)
    .eq('token', token)
    .maybeSingle()

  if (fetchErr) {
    console.error('[approve-rate] fetch error:', fetchErr)
    return htmlResponse('error', 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'Server error, please try again', 500)
  }
  if (!approval) {
    return htmlResponse('not_found', 'ไม่พบคำขออนุมัตินี้', 'Approval not found', 404)
  }

  // Supabase types the joined relation as either an object or an array
  // depending on the schema — narrow it defensively. We only need name
  // and plan, both safely fall back to sane defaults.
  const branchJoin = Array.isArray(approval.branches) ? approval.branches[0] : approval.branches
  const branchName: string = (branchJoin?.name as string) ?? 'your hotel'
  const orgJoin = branchJoin
    ? (Array.isArray(branchJoin.organizations) ? branchJoin.organizations[0] : branchJoin.organizations)
    : null
  const plan: string | null = (orgJoin?.plan as string | null) ?? null

  // Re-check plan at click time. If the org downgraded between brief and
  // tap, the button is dead. We use the same hasFeature() the dashboard
  // and morning-flash route use — one source of truth.
  if (!hasFeature(plan, 'auto_push')) {
    return htmlResponse(
      'plan_invalid',
      'แพ็คเกจของคุณไม่รองรับ Auto Push',
      'Your plan no longer supports Auto Push',
      403,
    )
  }

  const rateStr = approval.suggested_rate_thb.toLocaleString('th-TH')

  // Already approved → idempotent success. We return 200, not 409, so
  // the user sees a green checkmark on re-tap (they don't care that we
  // already had the click; the rate is approved either way).
  if (approval.approved_at) {
    return htmlResponse(
      'already',
      `อนุมัติราคา ฿${rateStr} สำหรับ ${branchName} แล้ว`,
      `Rate ฿${rateStr} for ${branchName} already approved`,
      200,
    )
  }

  // Expired
  if (new Date(approval.expires_at).getTime() < Date.now()) {
    return htmlResponse(
      'expired',
      'ลิงก์อนุมัตินี้หมดอายุแล้ว — รอ brief พรุ่งนี้',
      'This approval link has expired — wait for tomorrow\'s brief',
      410,
    )
  }

  // Mark approved. push_status stays 'pending' until the Phase R3
  // Cloudbeds adapter picks it up and writes back to the PMS.
  const { error: updateErr } = await supabase
    .from('rate_approvals')
    .update({
      approved_at: new Date().toISOString(),
      approved_via: 'line',
      push_status: 'pending',
    })
    .eq('id', approval.id)

  if (updateErr) {
    console.error('[approve-rate] update error:', updateErr)
    return htmlResponse('error', 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'Update failed, please try again', 500)
  }

  // Audit. actor_user_id is NULL — the LINE webhook carries no auth.
  // The token's randomness is the integrity guarantee; the row's id is
  // the trace. organization_id stays NULL only if branch join failed;
  // in the normal case it's set so the org's audit view scopes correctly.
  await supabase.from('audit_log').insert({
    actor_user_id: null,
    organization_id: branchJoin?.organization_id ?? null,
    action: 'rate.approved',
    target_entity: 'rate_approval',
    target_id: approval.id,
    payload: {
      branch_id: approval.branch_id,
      branch_name: branchName,
      date: approval.date,
      room_type: approval.room_type,
      rate_thb: approval.suggested_rate_thb,
      approved_via: 'line',
    },
  })

  return htmlResponse(
    'success',
    `✓ อนุมัติราคา ฿${rateStr} สำหรับ ${branchName} แล้ว`,
    `✓ Rate ฿${rateStr} approved for ${branchName}`,
    200,
  )
}

function htmlResponse(state: ResultState, messageTh: string, messageEn: string, status: number) {
  return new Response(buildResultHTML(state, messageTh, messageEn), {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

// Mobile-optimised HTML response. LINE's in-app browser renders this
// directly — no JavaScript, no external CSS, no fetches that could
// hang on a thin mobile connection. Two-language label so Thai and
// English owners both feel addressed.
function buildResultHTML(state: ResultState, messageTh: string, messageEn: string): string {
  const palette: Record<ResultState, { icon: string; bg: string; color: string; border: string }> = {
    success:       { icon: '✓', bg: '#F0FDF4', color: '#166534', border: '#BBF7D0' },
    already:       { icon: '✓', bg: '#F0FDF4', color: '#166534', border: '#BBF7D0' },
    expired:       { icon: '⏱', bg: '#FFFBEB', color: '#92400E', border: '#FCD34D' },
    not_found:     { icon: '✕', bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
    plan_invalid:  { icon: '⚠', bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
    error:         { icon: '✕', bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
  }
  const cfg = palette[state]

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RateDesk — Rate Approval</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Sukhumvit Set', sans-serif;
    background: #F9FAFB;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 24px;
  }
  .card {
    background: ${cfg.bg};
    border: 1px solid ${cfg.border};
    border-radius: 12px;
    padding: 32px 24px;
    max-width: 360px;
    width: 100%;
    text-align: center;
  }
  .icon { font-size: 48px; margin-bottom: 16px; line-height: 1; }
  .msg-th { font-size: 17px; font-weight: 600; color: ${cfg.color}; margin-bottom: 8px; line-height: 1.4; }
  .msg-en { font-size: 13px; color: ${cfg.color}; opacity: 0.8; line-height: 1.4; }
  .brand { margin-top: 24px; font-size: 11px; color: #9CA3AF; letter-spacing: 0.05em; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">${cfg.icon}</div>
    <div class="msg-th">${escapeHtml(messageTh)}</div>
    <div class="msg-en">${escapeHtml(messageEn)}</div>
    <div class="brand">RateDesk by Aurasea</div>
  </div>
</body>
</html>`
}

// Minimal HTML escape — branch names come from user input and flow into
// the page body. We don't accept anything else from the URL beyond the
// token (already filtered by the .eq() lookup), so the only injection
// vector is the branch name.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
