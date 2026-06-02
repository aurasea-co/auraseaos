// LINE Flex Message builder for the hotel morning brief.
// Pure function — no I/O, no clock reads — so it's snapshot-testable
// and the route can dry-render it without touching LINE infra.
// Money is THB integers throughout (matches every other consumer in
// this codebase; satang doesn't apply).

import type { HotelRecommendation } from '@/lib/recommendations/hotel/engine'

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
  /** Filtered to high/medium urgency. Builder slices to max 2. */
  topRecs: HotelRecommendation[]
  /** Output of forecastTomorrow(); pass null when not enough data. */
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
   *  breakdown jsonb. Controls which "tonight" panel the bubble body
   *  shows (rooms-to-adjust panel vs blended forecast strip). Does NOT
   *  gate the approve button anymore — the button is always controlled
   *  by the caller via approveButton presence (which encodes the
   *  plan+adapter gate). Caller is responsible for setting this; the
   *  builder doesn't re-derive it from topRecs because some single-room
   *  hotels also have per-room recs (degenerate case). */
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

// Compact per-room rate signal row used inside the "Rooms to adjust"
// panel for multi-room hotels. Render shape:
//   ↑ Suite: ฿1,920 → ฿2,112    (green arrow, rate_increase)
//   ↓ Deluxe2: ฿950 → ฿893      (red arrow, rate_decrease)
// Skips the urgency emoji — the arrow + colour already encode the
// direction, and bubble width is tight on multi-room rows.
function perRoomLine(rec: HotelRecommendation): Record<string, unknown> {
  const isIncrease = rec.type === 'rate_increase'
  const arrow = isIncrease ? '↑' : '↓'
  const arrowColor = isIncrease ? COLORS.success : COLORS.warn
  const current = rec.currentRateThb ?? 0
  const suggested = rec.suggestedRateThb ?? 0
  const label = `${rec.roomType ?? '—'}: ฿${fmtThb(current)} → ฿${fmtThb(suggested)}`
  return {
    type: 'box',
    layout: 'horizontal',
    margin: 'xs',
    contents: [
      { type: 'text', text: arrow, size: 'xs', flex: 0, weight: 'bold', color: arrowColor },
      {
        type: 'text',
        text: label,
        size: 'xs',
        color: COLORS.text,
        flex: 1,
        margin: 'sm',
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

  // Split recs into per-room and property-level. Multi-room hotels
  // get a dedicated "rooms to adjust" panel showing per-room rate
  // signals (Suite ฿1,920 → ฿2,112); single-room hotels keep the
  // blended forecast strip from the original layout.
  const perRoomRecs = data.topRecs.filter((r) => Boolean(r.roomType) && (r.type === 'rate_increase' || r.type === 'rate_decrease'))
  const propertyRecs = data.topRecs.filter((r) => !r.roomType)

  if (data.hasMultipleRoomTypes && perRoomRecs.length > 0) {
    // "Rooms to adjust" panel — per-room rate signals, max 3 to keep
    // the bubble height bounded.
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: COLORS.forecastBg,
      cornerRadius: '6px',
      paddingAll: '10px',
      contents: [
        {
          type: 'text',
          text: 'ห้องที่ควรปรับราคา',
          size: 'xs',
          weight: 'bold',
          color: COLORS.forecastFg,
        },
        ...perRoomRecs.slice(0, 3).map((rec) => perRoomLine(rec)),
      ],
    })
  } else if (data.forecast && !data.hasMultipleRoomTypes) {
    // Single-room / no-breakdown path — keep the blended forecast strip.
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
  } else if (data.hasMultipleRoomTypes) {
    // Multi-room property but no per-room rec fired — every room sits
    // comfortably in the hold band. Tell the owner so the silence
    // doesn't read as "engine isn't working".
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#F0FDF4',
      cornerRadius: '6px',
      paddingAll: '10px',
      contents: [
        {
          type: 'text',
          text: 'ราคาทุกประเภทห้องเหมาะสม',
          size: 'xs',
          color: COLORS.success,
        },
      ],
    })
  }

  // Up to 2 property-level recs (weekend signal, undercut, etc.).
  // Per-room recs already rendered inside the panel above.
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
