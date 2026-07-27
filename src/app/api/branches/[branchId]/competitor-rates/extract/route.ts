// /api/branches/[branchId]/competitor-rates/extract
//
// Screenshot → draft competitor rows. Operator uploads a (client-
// cropped) OTA search-results screenshot + picks which OTA it is; a
// vision model reads it; every row is fuzzy-matched against the
// branch's existing competitor roster and plausibility-checked against
// that competitor's recent rates. NOTHING is written to the database
// here — this only returns draft rows for the operator to review/edit
// in the UI. The commit step is the separate /batch-commit route,
// which reuses the exact same write path as manual entry.
//
// Owner + manager (same access matrix as the manual competitor-rates
// route — see that route's authorize() for the rationale).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractCompetitorRatesFromImage, type ExtractedCompetitorRow } from '@/lib/ratedesk/vision-extract'
import { matchCompetitorName } from '@/lib/ratedesk/competitor-name-match'
import { assessPlausibility, type PlausibilityResult } from '@/lib/ratedesk/competitor-rate-plausibility'
import { isRateChannel } from '@/lib/types/competitor-rates'

// Cropped screenshots should be small; this is a generous ceiling, not
// a target (mirrors the CSV import route's 5MB cap for the same
// "compress obvious-abuse risk without limiting real usage" reason).
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const ALLOWED_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export interface DraftCompetitorRow extends ExtractedCompetitorRow {
  /** Existing competitor name this row fuzzy-matched to, or null when
   *  nothing cleared the match threshold — the review UI must surface
   *  these for manual mapping, never auto-commit them under a guessed
   *  name. */
  matchedName: string | null
  matchConfidence: number | null
  plausibility: PlausibilityResult
}

async function authorize(branchId: string) {
  const userClient = await createClient()
  const { data: userRes } = await userClient.auth.getUser()
  const user = userRes?.user
  if (!user) return { ok: false as const, status: 401, error: 'unauthenticated' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ub = userClient as any
  const { data: branch } = await ub
    .from('branches')
    .select('id, organization_id, business_type')
    .eq('id', branchId)
    .maybeSingle()
  if (!branch) return { ok: false as const, status: 404, error: 'branch_not_found' }
  if (branch.business_type !== 'accommodation') {
    return { ok: false as const, status: 400, error: 'wrong_business_type' }
  }
  // Same owner-or-branch-manager check as the manual route — see that
  // file's authorize() for the full organization_members/branch_members
  // rationale.
  const [{ data: ownerRow }, { data: managerRow }] = await Promise.all([
    ub
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', branch.organization_id)
      .eq('role', 'owner')
      .maybeSingle(),
    ub
      .from('branch_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('branch_id', branchId)
      .in('role', ['manager', 'branch_manager'])
      .maybeSingle(),
  ])
  if (!ownerRow && !managerRow) return { ok: false as const, status: 403, error: 'forbidden_role' }
  return { ok: true as const, supabase: userClient }
}

function bail(status: number, code: string, messageTh: string, messageEn: string) {
  return NextResponse.json({ error: code, code, messageTh, messageEn }, { status })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await ctx.params
  const auth = await authorize(branchId)
  if (!auth.ok) return bail(auth.status, auth.error, '', '')

  const contentType = req.headers.get('content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    return bail(400, 'missing_multipart', 'ต้องอัปโหลดเป็นไฟล์รูปภาพ', 'Expected a multipart/form-data upload')
  }
  const form = await req.formData()
  const file = form.get('image')
  const channelRaw = form.get('channel')
  const otaHintRaw = form.get('otaHint')
  const ALLOWED_OTA_HINTS = new Set(['Agoda', 'Booking.com', 'Traveloka', 'Other'])
  const otaHint =
    typeof otaHintRaw === 'string' && ALLOWED_OTA_HINTS.has(otaHintRaw)
      ? (otaHintRaw as 'Agoda' | 'Booking.com' | 'Traveloka' | 'Other')
      : undefined
  if (!(file instanceof File)) {
    return bail(400, 'missing_image', 'กรุณาอัปโหลดรูปภาพ', 'An image file is required')
  }
  if (typeof channelRaw !== 'string' || !isRateChannel(channelRaw)) {
    return bail(400, 'invalid_channel', 'กรุณาเลือกช่องทาง (OTA)', 'A valid channel (OTA) selection is required')
  }
  if (!ALLOWED_MEDIA_TYPES.has(file.type)) {
    return bail(400, 'unsupported_image_type', 'รองรับเฉพาะไฟล์ PNG, JPEG, WEBP', 'Only PNG, JPEG, or WEBP images are supported')
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return bail(413, 'image_too_large', 'ไฟล์รูปภาพใหญ่เกินไป', 'Image is too large (max 8MB) — try cropping tighter')
  }

  let extracted: ExtractedCompetitorRow[]
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    extracted = await extractCompetitorRatesFromImage({
      imageBase64: buf.toString('base64'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mediaType: file.type as any,
      channel: channelRaw,
      otaHint,
    })
  } catch (err) {
    console.error('[competitor-rates extract] vision extraction failed', err)
    const message = err instanceof Error ? err.message : String(err)
    // Missing ANTHROPIC_API_KEY surfaces as a clear 500 rather than a
    // silent empty result that reads as "no competitors on this page".
    return bail(500, 'extraction_failed', 'การอ่านรูปภาพล้มเหลว กรุณาลองใหม่', message)
  }

  if (extracted.length === 0) {
    return NextResponse.json({ rows: [] as DraftCompetitorRow[] })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = auth.supabase as any

  // Known competitor roster for fuzzy-matching — same distinct-name
  // set the manual GET endpoint derives, read through the RLS client
  // (read RLS is org/branch-membership scoped, not owner-only — see
  // migration 029 — so this doesn't need the service role).
  const { data: existingRows } = await db
    .from('competitor_rates')
    .select('competitor_name, room_type, channel, rate, captured_at')
    .eq('branch_id', branchId)
    .order('captured_at', { ascending: false })
    .limit(2000)
  const rows = (existingRows || []) as Array<{
    competitor_name: string
    room_type: string
    channel: string | null
    rate: number | string
    captured_at: string
  }>
  const knownNames = Array.from(new Set(rows.map((r) => r.competitor_name)))

  // Reference rates per (competitor, channel) for plausibility —
  // recent history only (the query above already caps at 2000 rows
  // ordered newest-first, plenty for any branch's 5-competitor cap).
  const referencesByCompetitorChannel = new Map<string, number[]>()
  for (const r of rows) {
    const rateNum = Number(r.rate)
    if (!Number.isFinite(rateNum) || rateNum <= 0) continue
    const key = `${r.competitor_name}|${r.channel || 'ota'}`
    const list = referencesByCompetitorChannel.get(key) ?? []
    list.push(rateNum)
    referencesByCompetitorChannel.set(key, list)
  }

  const draftRows: DraftCompetitorRow[] = extracted.map((row) => {
    const match = matchCompetitorName(row.hotelName, knownNames)
    const referenceRates = match
      ? referencesByCompetitorChannel.get(`${match.matchedName}|${channelRaw}`) ?? []
      : []
    const plausibility = assessPlausibility(row.rateThb, referenceRates)
    return {
      ...row,
      matchedName: match?.matchedName ?? null,
      matchConfidence: match?.confidence ?? null,
      plausibility,
    }
  })

  return NextResponse.json({ rows: draftRows })
}
