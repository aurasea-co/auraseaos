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
import { canShowLiveApproveButton } from '@/lib/ratedesk/auto-push-gating'
import { satangToThb } from '@/lib/money/satang'

type ResultState =
  | 'success'
  | 'already'
  | 'expired'
  | 'not_found'
  | 'plan_invalid'
  | 'adapter_invalid'
  | 'error'

/** One row from rate_approvals — the per-room-type design means a
 *  single token can fan out to N rows, all of which need to be
 *  approved together. */
interface ApprovalRow {
  id: string
  branch_id: string
  room_type: string
  date: string
  suggested_rate_satang: number | null  // preferred — null on legacy rows
  suggested_rate_thb: number | null     // back-compat shadow
  approved_at: string | null
  expires_at: string
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return htmlResponse('error', 'ลิงก์ไม่ถูกต้อง — ไม่พบ token', 'Invalid link — token missing', 400)
  }

  const supabase = createServiceClient()

  // Three sequential lookups — approval, branch, org — instead of one
  // nested join. The nested join syntax
  //   .select('branches:branches(name, organization_id, organizations(plan))')
  // returned null at runtime even when the raw SQL join worked, because
  // PostgREST's automatic FK-relationship detection occasionally refuses
  // to embed deeply through chained references. Three round-trips here
  // is a few hundred extra ms — paid only at click time, once per tap —
  // and the code is immune to the embedding quirk.
  // Per-room model: a single token can carry N rows (one per room
  // type), all sharing branch_id + date + token. Fetch the WHOLE set.
  // Sorted by created_at so the success copy refers to them in the
  // order the engine emitted (matches the bubble's display order).
  const { data: approvalRows, error: fetchErr } = await supabase
    .from('rate_approvals')
    .select(
      'id, branch_id, room_type, date, suggested_rate_satang, suggested_rate_thb, approved_at, expires_at',
    )
    .eq('token', token)
    .order('created_at', { ascending: true })

  if (fetchErr) {
    console.error('[approve-rate] fetch error:', fetchErr)
    return htmlResponse('error', 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'Server error, please try again', 500)
  }
  if (!approvalRows || approvalRows.length === 0) {
    return htmlResponse('not_found', 'ไม่พบคำขออนุมัตินี้', 'Approval not found', 404)
  }

  const approvals = approvalRows as ApprovalRow[]
  // All rows in a set share branch_id, date, expires_at by construction
  // (they were inserted together). Read these from the first row.
  const headApproval = approvals[0]

  // Lookup branch (for name + organization_id). Missing branch is
  // treated as a non-fatal — we fall back to generic copy in the
  // success page so the owner still gets confirmation.
  const { data: branchRow } = await supabase
    .from('branches')
    .select('name, organization_id')
    .eq('id', headApproval.branch_id)
    .maybeSingle()
  const branchName: string = (branchRow?.name as string) ?? 'your hotel'
  const organizationId: string | null = (branchRow?.organization_id as string) ?? null

  // Lookup org plan separately. If the org disappeared between brief
  // and tap (extremely unlikely), plan stays null and the plan-gate
  // below blocks the approval — failing closed.
  let plan: string | null = null
  if (organizationId) {
    const { data: orgRow } = await supabase
      .from('organizations')
      .select('plan')
      .eq('id', organizationId)
      .maybeSingle()
    plan = (orgRow?.plan as string | null) ?? null
  }

  // Re-check BOTH gates at click time (plan + adapter supports_write_back).
  // The button is dead if either side regressed between brief and tap:
  //   - Pro → Growth downgrade nukes the plan side.
  //   - Owner disabled or removed the PMS config nukes the adapter side.
  // canShowLiveApproveButton is the shared source of truth used at
  // brief-build time and here — keeps the two ends of the flow honest.
  const { data: pmsConfigRow } = await supabase
    .from('branch_pms_config')
    .select('is_active, supports_write_back')
    .eq('branch_id', headApproval.branch_id)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const pmsConfig = (pmsConfigRow ?? null) as
    | { is_active: boolean; supports_write_back: boolean }
    | null

  const liveOk = canShowLiveApproveButton({ plan, pmsConfig })
  if (!liveOk) {
    // Disambiguate the two failure modes so the owner knows which side
    // changed. If the plan no longer pays for auto_push it's a billing
    // question; if the adapter went away it's a settings/PMS question.
    const planSideOk = (() => {
      // Inline check mirrors lib/auth/plan-features.hasFeature, kept
      // local to avoid re-importing it solely for this branch.
      const proLike = plan === 'pro' || plan === 'enterprise'
      return proLike
    })()
    if (!planSideOk) {
      return htmlResponse(
        'plan_invalid',
        'แพ็คเกจของคุณไม่รองรับ Auto Push',
        'Your plan no longer supports Auto Push',
        403,
      )
    }
    return htmlResponse(
      'adapter_invalid',
      'PMS ของสาขานี้ยังไม่รองรับการส่งราคากลับโดยอัตโนมัติ',
      'This branch\'s PMS adapter no longer supports write-back',
      409,
    )
  }

  // Build a per-row preferred-satang-with-thb-fallback helper. Legacy
  // rows from before migration 038 have suggested_rate_satang = NULL;
  // the fallback path converts thb → satang client-side using the
  // shared boundary helper (`thbToSatang` inverse).
  const setSize = approvals.length
  const headlineRow = approvals[0]
  const headlineSatang =
    headlineRow.suggested_rate_satang ??
    (headlineRow.suggested_rate_thb != null
      ? headlineRow.suggested_rate_thb * 100
      : 0)
  const headlineThb = satangToThb(headlineSatang)
  const isMultiSet = setSize > 1

  const setSummaryTh = isMultiSet
    ? `อัปเดตราคา ${setSize} ประเภทห้องสำหรับ ${branchName}`
    : `อนุมัติราคา ฿${headlineThb.toLocaleString('th-TH')} สำหรับ ${branchName}`
  const setSummaryEn = isMultiSet
    ? `Updated rates for ${setSize} room types at ${branchName}`
    : `Rate ฿${headlineThb.toLocaleString('en-US')} for ${branchName}`

  // Idempotency lock: if EVERY row in the set is already approved we
  // return "already approved" with a green checkmark. Partial-approved
  // sets are an impossible state (we approve them all in one update
  // below; an atomic-ish failure would leave us mid-state and the
  // owner would re-tap, which then completes the rest). For that race,
  // treat "any row approved" as "already approved" so the owner sees a
  // consistent success.
  if (approvals.every((a) => a.approved_at != null)) {
    return htmlResponse(
      'already',
      `${setSummaryTh} แล้ว`,
      `${setSummaryEn} already approved`,
      200,
    )
  }

  // Expired — checked against the head row's expires_at (all rows in a
  // set were inserted together with the same TTL).
  if (new Date(headApproval.expires_at).getTime() < Date.now()) {
    return htmlResponse(
      'expired',
      'ลิงก์อนุมัตินี้หมดอายุแล้ว — รอ brief พรุ่งนี้',
      'This approval link has expired — wait for tomorrow\'s brief',
      410,
    )
  }

  // Approve EVERY row in the set in a single .eq('token') update.
  // PostgREST runs this as one statement, so either all rows flip to
  // approved or none do — no half-state for the owner to observe.
  const approvedAtIso = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('rate_approvals')
    .update({
      approved_at: approvedAtIso,
      approved_via: 'line',
      push_status: 'pending',
    })
    .eq('token', token)
    .is('approved_at', null)  // don't re-approve rows that already are

  if (updateErr) {
    console.error('[approve-rate] update error:', updateErr)
    return htmlResponse('error', 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'Update failed, please try again', 500)
  }

  // Audit. actor_user_id is NULL — the LINE webhook carries no auth.
  // The token's randomness is the integrity guarantee; the rows' ids
  // are the trace. We write ONE audit_log entry for the whole set,
  // carrying every row's room_type + satang rate in the payload, so
  // /audit shows "approved 4 room types" with the actual rates.
  // Phase R3's PMS worker reads each rate_approvals row individually
  // and iterates pushes per-room.
  await supabase.from('audit_log').insert({
    actor_user_id: null,
    organization_id: organizationId,
    action: 'rate.approved',
    target_entity: 'rate_approval',
    target_id: headApproval.id,
    payload: {
      branch_id: headApproval.branch_id,
      branch_name: branchName,
      date: headApproval.date,
      approved_via: 'line',
      set_size: setSize,
      rates: approvals.map((a) => {
        const satang =
          a.suggested_rate_satang ??
          (a.suggested_rate_thb != null ? a.suggested_rate_thb * 100 : 0)
        return {
          approval_id: a.id,
          room_type: a.room_type,
          rate_satang: satang,
          rate_thb: satangToThb(satang),
        }
      }),
    },
  })

  return htmlResponse(
    'success',
    `✓ ${setSummaryTh} แล้ว`,
    `✓ ${setSummaryEn} approved`,
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
    success:          { icon: '✓', bg: '#F0FDF4', color: '#166534', border: '#BBF7D0' },
    already:          { icon: '✓', bg: '#F0FDF4', color: '#166534', border: '#BBF7D0' },
    expired:          { icon: '⏱', bg: '#FFFBEB', color: '#92400E', border: '#FCD34D' },
    not_found:        { icon: '✕', bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
    plan_invalid:     { icon: '⚠', bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
    adapter_invalid:  { icon: '⚠', bg: '#FFFBEB', color: '#92400E', border: '#FCD34D' },
    error:            { icon: '✕', bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
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
