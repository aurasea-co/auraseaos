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

  // Tonight forecast — only when the engine had enough data
  if (data.forecast) {
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

  // Up to 2 highest-urgency recs; engine already pre-sorts high→low.
  for (const rec of data.topRecs.slice(0, 2)) {
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
        layout: 'horizontal',
        paddingAll: '12px',
        contents: [
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
