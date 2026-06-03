// LINE Flex Message builder for the hotel morning brief.
// Pure function — no I/O, no clock reads — so it's snapshot-testable
// and the route can dry-render it without touching LINE infra.
// Money is THB integers throughout (matches every other consumer in
// this codebase; satang doesn't apply).

import type {
  HotelRecommendation,
  PerRoomTypeRate,
  DailyAction,
} from '@/lib/recommendations/hotel/engine'

export interface HotelBriefData {
  branchName: string
  /** Yesterday's KPIs in THB. */
  yesterday: {
    /** YYYY-MM-DD in Bangkok wall time. */
    date: string
    occupancyRate: number // 0..1
    adrThb: number
    revparThb: number
    revenueThb: number
  }
  /** Filtered to high/medium urgency. Builder slices the property-level
   *  entries (no roomType) to max 2 and renders them under the per-
   *  room rate block (weekend signal, undercut, etc). Per-room rate
   *  entries from this array are NOT rendered separately — they're
   *  subsumed by perRoomRates which carries the full sheet. */
  topRecs: HotelRecommendation[]
  /** Output of recommendPerRoomTypeRates() — one row per active room
   *  type, including holds. Used to render the "แนะนำราคาวันนี้ /
   *  Today's recommended rates" block. Builder caps to the top 6 by
   *  impact and tags the rest as "+M more in RateDesk" so the bubble
   *  height stays bounded on properties with many room types. Pass an
   *  empty array (or omit) for legacy single-room properties that
   *  have no breakdown — the brief then falls back to the blended
   *  forecast strip. */
  perRoomRates?: PerRoomTypeRate[]
  /** Output of summarizePerRoomRates() — one bilingual action line
   *  derived from the rate-mix in perRoomRates. The brief renders this
   *  as a callout right under the rate sheet so the owner gets a
   *  one-glance "what to do today" prompt even when low-occupancy /
   *  weekend / competitor signals don't fire (typical for branches
   *  with <3 days of data). Omitted → no callout. */
  dailyAction?: DailyAction
  /** Output of forecastTomorrow(); used ONLY when perRoomRates is
   *  empty/absent (legacy single-room properties with no breakdown
   *  jsonb). Pass null when not enough data. */
  forecast: { expectedOccupancy: number; suggestedRateThb: number } | null
  /** Auto Push approval button. Caller is responsible for the gating
   *  decision — the builder just renders whatever it gets. Pass this ONLY
   *  when BOTH gates pass: the branch is on a plan with auto_push AND a
   *  connected PMS adapter advertises supports_write_back=true. Crystal
   *  Resort today (Pro plan, no live PMS) gets no approveButton — only
   *  the dashboardUrl link. See lib/ratedesk/auto-push-gating.ts.
   *
   *  For multi-room hotels the button represents "approve the WHOLE set
   *  of per-room-type recommendations for today" — the underlying
   *  rate_approvals row carries room_rates jsonb and the approve-rate
   *  endpoint applies them all. The label text should reflect that
   *  (e.g. "✓ อนุมัติทั้งหมด" not a single ฿X). */
  approveButton?: {
    /** Full URL the LINE in-app browser will GET (token already in qs). */
    url: string
    /** Locale-aware label. LINE caps at 20 chars — caller is responsible
     *  for picking a short form like "✓ อนุมัติทั้งหมด" when a single
     *  rate string would overflow or be meaningless. */
    label: string
  }
  /** Deep-link URL to /ratedesk on the dashboard. ALWAYS render the
   *  "Review in RateDesk" button when this is provided — it's the
   *  always-available secondary action and the only on-bubble action
   *  when the live approve button is gated off. */
  dashboardUrl?: string
  /** Optional subtle note in the footer when the plan includes Auto Push
   *  but no write-back-capable PMS is connected yet. Shows up as a small
   *  muted line under the buttons telling the owner that the live
   *  approve button will activate once a supported PMS is wired in.
   *  Caller decides when this should appear — see
   *  lib/ratedesk/auto-push-gating.ts shouldShowAwaitingPmsNote(). */
  awaitingPmsNote?: string
  /** True when yesterday's row carried 2+ distinct room types in its
   *  breakdown jsonb. No longer read by the brief renderer — the per-
   *  room-rates block is driven entirely by perRoomRates.length. Kept
   *  on the interface for backward compatibility with the morning-flash
   *  route, which still uses it as the source of truth for the approval
   *  row's room_type ('multi' vs 'all') and approve button label. */
  hasMultipleRoomTypes?: boolean
}

export interface FlexMessageEnvelope {
  altText: string
  contents: Record<string, unknown>
}

const COLORS = {
  ink: '#1a1a2e',
  primary: '#534AB7',
  text: '#111827',
  textMuted: '#6B7280',
  textFaint: '#9CA3AF',
  success: '#1D9E75',
  warn: '#DC2626',
  surface: '#F9FAFB',
  forecastBg: '#F8F7FF',
  forecastFg: '#3C3489',
} as const

function thaiShortDate(yyyymmdd: string): string {
  // Render "29 พ.ค." style on the timezone-safe path. We anchor the
  // date string against a fixed UTC midnight so the host TZ doesn't
  // shift the displayed day.
  return new Date(`${yyyymmdd}T00:00:00Z`).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Bangkok',
  })
}

function fmtThb(n: number): string {
  return Math.round(n).toLocaleString('th-TH')
}

function occColor(pct: number): string {
  if (pct >= 80) return COLORS.success
  if (pct < 40) return COLORS.warn
  return COLORS.primary
}

function kpiBox(label: string, value: string, color: string): Record<string, unknown> {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 1,
    backgroundColor: COLORS.surface,
    cornerRadius: '6px',
    paddingAll: '8px',
    contents: [
      { type: 'text', text: label, size: 'xxs', color: COLORS.textMuted },
      { type: 'text', text: value, size: 'sm', weight: 'bold', color },
    ],
  }
}

function urgencyEmoji(u: HotelRecommendation['urgency']): string {
  if (u === 'high') return '🔴'
  if (u === 'medium') return '🟡'
  return '⚪️'
}

function recRow(rec: HotelRecommendation): Record<string, unknown> {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    contents: [
      { type: 'text', text: urgencyEmoji(rec.urgency), size: 'sm', flex: 0 },
      {
        type: 'text',
        text: rec.messageTh,
        size: 'xs',
        color: COLORS.text,
        wrap: true,
        flex: 1,
      },
    ],
  }
}

// Per-room-type rate row for the "Today's recommended rates" block.
//
// Layout — two cells per row:
//   [ roomType label ]                    [ ฿current → ฿suggested ]    (right-aligned)
//   [ Deluxe2        ]                    [ ฿950 → ฿1,045          ]
//   [ Suite          ]                    [ ฿1,200 · คงเดิม         ]
//
// Direction encoding via the right cell:
//   - increase: ฿current → ฿suggested  in green
//   - decrease: ฿current → ฿suggested  in red
//   - hold:     ฿current · คงเดิม       in muted grey (no arrow — the
//                                       "considered, no change" signal
//                                       is the marker itself)
function perRoomRateRow(row: PerRoomTypeRate): Record<string, unknown> {
  const currentStr = `฿${fmtThb(row.currentRateThb)}`
  const suggestedStr = `฿${fmtThb(row.suggestedRateThb)}`
  let rightText: string
  let rightColor: string
  if (row.direction === 'hold') {
    rightText = `${currentStr} · คงเดิม`
    rightColor = COLORS.textMuted
  } else if (row.direction === 'increase') {
    rightText = `${currentStr} → ${suggestedStr}`
    rightColor = COLORS.success
  } else {
    rightText = `${currentStr} → ${suggestedStr}`
    rightColor = COLORS.warn
  }
  return {
    type: 'box',
    layout: 'horizontal',
    margin: 'xs',
    contents: [
      // Room type label — flex 1 so it grows to fill, fontWeight bold
      // to make scanning the column easy at 7am on a phone.
      {
        type: 'text',
        text: row.roomType,
        size: 'xs',
        color: COLORS.text,
        weight: 'bold',
        flex: 1,
      },
      // Rate cell — flex 0 (sized to content) + align:end so it pins
      // to the right edge. Color-coded by direction.
      {
        type: 'text',
        text: rightText,
        size: 'xs',
        color: rightColor,
        align: 'end',
        flex: 0,
      },
    ],
  }
}

export function buildHotelBriefFlexMessage(data: HotelBriefData): FlexMessageEnvelope {
  const occPct = Math.round(data.yesterday.occupancyRate * 100)
  const adrStr = `฿${fmtThb(data.yesterday.adrThb)}`
  const revparStr = `฿${fmtThb(data.yesterday.revparThb)}`

  const altText = `☀️ ${data.branchName} — เมื่อคืน Occupancy ${occPct}% ADR ${adrStr}`

  const bodyContents: Array<Record<string, unknown>> = [
    // KPI row
    {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: [
        kpiBox('Occupancy', `${occPct}%`, occColor(occPct)),
        kpiBox('ADR', adrStr, COLORS.text),
        kpiBox('RevPAR', revparStr, COLORS.text),
      ],
    },
  ]

  // "แนะนำราคาวันนี้ / Today's recommended rates" block — replaces
  // the old single-blended-rate forecast strip. Renders one row per
  // active room type (currentRate → suggestedRate, or "คงเดิม" for
  // holds). Caps to MAX_PER_ROOM_ROWS in the bubble; sorting picks the
  // top N by impact so the owner sees the most actionable moves first,
  // then we restore the engine's natural (input) order for display so
  // the room list reads consistently with /settings.
  //
  // The blended forecast strip stays as a fallback for properties
  // whose breakdown jsonb is empty (legacy single-room imports that
  // never went through the per-type entry form).
  const perRoomRates = data.perRoomRates ?? []
  const MAX_PER_ROOM_ROWS = 6
  let renderedRates: PerRoomTypeRate[] = perRoomRates
  let overflowCount = 0
  if (perRoomRates.length > MAX_PER_ROOM_ROWS) {
    // Pick the highest-impact rows; preserve their original order in
    // the breakdown when rendering so the columns stack predictably.
    const byImpact = perRoomRates
      .map((r, i) => ({ r, i }))
      .sort((a, b) => {
        if (b.r.impactThb !== a.r.impactThb) return b.r.impactThb - a.r.impactThb
        return a.i - b.i
      })
      .slice(0, MAX_PER_ROOM_ROWS)
      .sort((a, b) => a.i - b.i)
    renderedRates = byImpact.map((x) => x.r)
    overflowCount = perRoomRates.length - MAX_PER_ROOM_ROWS
  }

  if (renderedRates.length > 0) {
    const blockContents: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text: 'แนะนำราคาวันนี้ · Today\'s recommended rates',
        size: 'xs',
        weight: 'bold',
        color: COLORS.forecastFg,
        wrap: true,
      },
      ...renderedRates.map((row) => perRoomRateRow(row)),
    ]
    if (overflowCount > 0) {
      blockContents.push({
        type: 'text',
        text: `+${overflowCount} ห้องอื่นใน RateDesk · +${overflowCount} more in RateDesk`,
        size: 'xxs',
        color: COLORS.textMuted,
        wrap: true,
        margin: 'sm',
      })
    }
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: COLORS.forecastBg,
      cornerRadius: '6px',
      paddingAll: '10px',
      contents: blockContents,
    })
  } else if (data.forecast) {
    // Legacy single-room fallback — no breakdown jsonb at all. The
    // blended forecast strip is the right shape here because there's
    // only one rate to suggest.
    const forecastOcc = Math.round(data.forecast.expectedOccupancy * 100)
    const suggested = `฿${fmtThb(data.forecast.suggestedRateThb)}`
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: COLORS.forecastBg,
      cornerRadius: '6px',
      paddingAll: '10px',
      contents: [
        {
          type: 'text',
          text: `คืนนี้คาด: Occupancy ${forecastOcc}% · แนะนำ ${suggested}`,
          size: 'sm',
          color: COLORS.forecastFg,
          weight: 'bold',
          wrap: true,
        },
      ],
    })
  }

  // "What to do today" insight — bilingual action line synthesised
  // from the rate-mix in perRoomRates. Renders right under the rate
  // sheet so the owner gets a one-glance "next step" prompt even when
  // the threshold-gated signals below (low_occupancy_alert, weekend
  // opportunity, competitor undercut) don't fire — which is the
  // typical case for branches with <3 days of data.
  //
  // Distinct visual treatment from the rate sheet (lighter neutral
  // background, accent-coloured text) so the owner can tell at a
  // glance: this is the prose insight, that's the rate sheet.
  if (data.dailyAction) {
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#F8F7FF',  // very light primary tint
      cornerRadius: '6px',
      paddingAll: '10px',
      contents: [
        {
          type: 'text',
          text: 'วันนี้ควรทำอะไร · Today\'s action',
          size: 'xxs',
          color: COLORS.forecastFg,
          weight: 'bold',
        },
        {
          type: 'text',
          text: data.dailyAction.messageTh,
          size: 'xs',
          color: COLORS.text,
          wrap: true,
          margin: 'xs',
        },
      ],
    })
  }

  // Property-level recs (weekend signal, undercut, etc.) render below
  // the action callout. Per-room rate moves from topRecs are dropped —
  // the perRoomRates block above already displays them, and double-
  // rendering wastes precious bubble height.
  const propertyRecs = data.topRecs.filter((r) => !r.roomType)
  for (const rec of propertyRecs.slice(0, 2)) {
    bodyContents.push(recRow(rec))
  }

  return {
    altText,
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: COLORS.ink,
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: `☀️ ${data.branchName}`,
            color: '#ffffff',
            size: 'md',
            weight: 'bold',
            wrap: true,
          },
          {
            type: 'text',
            text: `ผลเมื่อคืน · ${thaiShortDate(data.yesterday.date)}`,
            color: COLORS.textFaint,
            size: 'xs',
            margin: 'xs',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'md',
        contents: bodyContents,
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        spacing: 'sm',
        contents: [
          // Auto Push approve button. Renders whenever the caller
          // supplies one — the caller is the gate (plan + adapter
          // supports_write_back). Multi-room hotels CAN show this; the
          // underlying approval row carries the full per-room rate set
          // (room_rates jsonb) and one tap approves the whole set.
          ...(data.approveButton
            ? [
                {
                  type: 'button',
                  style: 'primary',
                  color: COLORS.primary,
                  height: 'sm',
                  action: {
                    type: 'uri',
                    label: data.approveButton.label,
                    uri: data.approveButton.url,
                  },
                } as Record<string, unknown>,
              ]
            : []),
          // "Review in RateDesk" deep-link — always present when caller
          // provides a URL. Sits below the approve button when both
          // render, replaces it when the live button is gated off
          // (e.g. plan paid for Auto Push but no live PMS adapter).
          // Secondary style keeps it visually subordinate to the
          // approve button when both render.
          ...(data.dashboardUrl
            ? [
                {
                  type: 'button',
                  style: 'secondary',
                  height: 'sm',
                  action: {
                    type: 'uri',
                    label: 'ดูใน RateDesk',
                    uri: data.dashboardUrl,
                  },
                } as Record<string, unknown>,
              ]
            : []),
          // Awaiting-PMS hint: rendered when the plan paid for Auto
          // Push but no write-back adapter is connected (e.g. Crystal
          // Resort waiting on Cloudbeds in Phase R3). Subtle muted line
          // under the buttons so the owner understands why no live
          // approve action is offered.
          ...(data.awaitingPmsNote
            ? [
                {
                  type: 'text',
                  text: data.awaitingPmsNote,
                  size: 'xxs',
                  color: COLORS.textMuted,
                  wrap: true,
                  align: 'center',
                } as Record<string, unknown>,
              ]
            : []),
          {
            type: 'text',
            text: 'RateDesk by Aurasea',
            size: 'xxs',
            color: COLORS.textFaint,
            align: 'center',
          },
        ],
      },
    },
  }
}
