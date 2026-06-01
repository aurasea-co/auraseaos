// LINE Flex Message builder for the F&B (MenuDesk) morning brief.
// Mirror of hotel-brief.ts but for restaurants/cafés. Pure function —
// no I/O, no clock reads — so snapshot-testable and the route can
// dry-render it without touching LINE infra.
//
// Money in THB integers throughout. No satang.

import type { FnbRecommendation } from '@/lib/recommendations/fnb/engine'

export interface FnbBriefData {
  branchName: string
  /** Yesterday's KPIs in THB. */
  yesterday: {
    /** YYYY-MM-DD in Bangkok wall time. */
    date: string
    revenueThb: number
    /** Covers / customers. Null when not tracked. */
    totalCovers: number | null
    /** Per-cover spend (revenue / covers). 0 when covers is null/0. */
    avgPerCoverThb: number
    /** Food cost % (food cost / revenue). Null when cost_food not entered. */
    foodCostPct: number | null
  }
  /** Filtered to high/medium urgency. Builder slices to max 2. */
  topRecs: FnbRecommendation[]
  /** Deep-link URL to /menudesk on the dashboard. Always rendered
   *  in the footer when provided so owners can dig into the bubble's
   *  space-constrained summary. */
  dashboardUrl?: string
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
  amber: '#F59E0B',
  surface: '#F9FAFB',
  recsBg: '#FFFBEB',
  recsFg: '#92400E',
} as const

function thaiShortDate(yyyymmdd: string): string {
  return new Date(`${yyyymmdd}T00:00:00Z`).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Bangkok',
  })
}

function fmtThb(n: number): string {
  return Math.round(n).toLocaleString('th-TH')
}

function foodCostColor(pct: number | null): string {
  if (pct === null) return COLORS.textMuted
  if (pct > 40) return COLORS.warn
  if (pct > 35) return COLORS.amber
  return COLORS.success
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

function urgencyEmoji(u: FnbRecommendation['urgency']): string {
  if (u === 'high') return '🔴'
  if (u === 'medium') return '🟡'
  return '⚪️'
}

function recRow(rec: FnbRecommendation): Record<string, unknown> {
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

export function buildFnbBriefFlexMessage(data: FnbBriefData): FlexMessageEnvelope {
  const revStr = `฿${fmtThb(data.yesterday.revenueThb)}`
  const coversStr = data.yesterday.totalCovers != null && data.yesterday.totalCovers > 0
    ? data.yesterday.totalCovers.toLocaleString('th-TH')
    : '—'
  const avgStr = data.yesterday.avgPerCoverThb > 0
    ? `฿${fmtThb(data.yesterday.avgPerCoverThb)}`
    : '—'
  const foodCostStr = data.yesterday.foodCostPct != null
    ? `${data.yesterday.foodCostPct.toFixed(1)}%`
    : '—'

  const altText = `☀️ ${data.branchName} — เมื่อวาน รายได้ ${revStr} · ลูกค้า ${coversStr}`

  const bodyContents: Array<Record<string, unknown>> = [
    // KPI row 1: Revenue + Covers
    {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: [
        kpiBox('รายได้', revStr, COLORS.text),
        kpiBox('ลูกค้า', coversStr, COLORS.text),
      ],
    },
    // KPI row 2: Avg per cover + Food cost %
    {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: [
        kpiBox('฿/คน', avgStr, COLORS.text),
        kpiBox('Food cost', foodCostStr, foodCostColor(data.yesterday.foodCostPct)),
      ],
    },
  ]

  // Up to 2 highest-urgency recs. When no recs fire, surface a
  // reassuring "all signals normal" panel so the bubble doesn't read
  // as "broken / no data".
  const visibleRecs = data.topRecs.slice(0, 2)
  if (visibleRecs.length > 0) {
    for (const rec of visibleRecs) {
      bodyContents.push(recRow(rec))
    }
  } else {
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: COLORS.recsBg,
      cornerRadius: '6px',
      paddingAll: '8px',
      contents: [
        {
          type: 'text',
          text: 'สัญญาณทุกตัวปกติดี — ดู MenuDesk สำหรับ top movers',
          size: 'xs',
          color: COLORS.recsFg,
          wrap: true,
        },
      ],
    })
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
            text: `ผลเมื่อวาน · ${thaiShortDate(data.yesterday.date)}`,
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
          ...(data.dashboardUrl
            ? [
                {
                  type: 'button',
                  style: 'secondary',
                  height: 'sm',
                  action: {
                    type: 'uri',
                    label: 'ดู MenuDesk',
                    uri: data.dashboardUrl,
                  },
                } as Record<string, unknown>,
              ]
            : []),
          {
            type: 'text',
            text: 'MenuDesk by Aurasea',
            size: 'xxs',
            color: COLORS.textFaint,
            align: 'center',
          },
        ],
      },
    },
  }
}
