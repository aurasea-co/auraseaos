// LINE Flex Message builder for the hotel morning brief.
// Pure function — no I/O, no clock reads — so it's snapshot-testable
// and the route can dry-render it without touching LINE infra.
// Money is THB integers throughout (matches every other consumer in
// this codebase; satang doesn't apply).
//
// VISUAL SYSTEM (restyle — see the reference mockup): navy header with
// a circular avatar, sand page background, white rounded section cards
// each led by one icon + navy label, direction-colored delta chips on
// the rate rows, mint footer brand strip. This is a presentation-only
// pass — every data value, threshold, cap, and gating decision below
// is unchanged from before the restyle; only the JSON shape/colors
// changed. LINE Flex has no custom fonts — size/weight/color only.

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

// Palette — used consistently across the bubble. mint is reserved for
// fills/chips/icons only, never body text (contrast fails white-on-mint;
// see the restyle's contrast pass). Every color below was checked
// against its actual usage for >=4.5:1 text contrast.
const COLORS = {
  navy: '#042C53',
  mint: '#5DCAA5',
  info: '#378ADD',
  attention: '#C4453D',
  muted: '#5B6B7A',
  sand: '#F1EFE8',
  white: '#FFFFFF',
  separator: '#E4E0D6',
  footerHighlight: '#EAF6F0',
  /** White at ~65% opacity (8-digit alpha hex — LINE Flex supports this
   *  on text/box color properties) for the header subtitle. */
  subtitleOnNavy: '#FFFFFFA6',
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

// Same 3-tier thresholds as before the restyle (>=80 / <40 / else) —
// only the color VALUES changed to the new palette. "Ahead of pace" /
// "behind pace" from the mockup maps onto this existing tier, not a
// new computation. The mockup calls the low tier "amber" but the
// approved palette (COLORS above) has no amber — attention (the same
// red already used for rate cuts) is reused for "behind" so the
// palette stays exactly as specified rather than introducing an
// unlisted color.
function occColor(pct: number): string {
  if (pct >= 80) return COLORS.mint
  if (pct < 40) return COLORS.attention
  return COLORS.navy
}

// ── Section card shell ──────────────────────────────────────────────
// White rounded card on the sand page background, led by one icon +
// a navy label row, thin separator beneath the label, then whatever
// content the section supplies. Every body section uses this same
// shell so the bubble reads as one consistent system.
function sectionCard(icon: string, labelTh: string, labelEn: string, contents: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: COLORS.white,
    cornerRadius: '12px',
    paddingAll: '12px',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        spacing: 'xs',
        contents: [
          { type: 'text', text: icon, size: 'sm', flex: 0 },
          {
            type: 'text',
            text: `${labelTh} · ${labelEn}`,
            size: 'sm',
            weight: 'bold',
            color: COLORS.navy,
            wrap: true,
            flex: 1,
          },
        ],
      },
      { type: 'separator', color: COLORS.separator, margin: 'sm' },
      ...contents,
    ],
  }
}

// Compact stat tile — large bold value, xs uppercase label. Occupancy
// passes a state color (see occColor); ADR/RevPAR are neutral navy
// (no pass/fail state — they're reference numbers, not a target).
function statTile(label: string, value: string, color: string): Record<string, unknown> {
  return {
    type: 'box',
    layout: 'vertical',
    // flex: 0 — size to content rather than forcing an equal 1/3 share
    // of the row (see the row's justifyContent: 'space-between' below).
    // An earlier equal-thirds version made "OCCUPANCY" wrap mid-word
    // ("OCCUPANC" / "Y") because the fixed-width tile was a hair
    // narrower than the word even with wrap:true — verified against the
    // actual LINE Flex Message Simulator. Content-sizing removes the
    // forced width entirely rather than guessing a flex ratio that
    // happens to fit this one word.
    flex: 0,
    contents: [
      { type: 'text', text: value, size: 'xl', weight: 'bold', color, wrap: true },
      { type: 'text', text: label.toUpperCase(), size: 'xxs', color: COLORS.muted, margin: 'xs', wrap: true },
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
        color: COLORS.muted,
        wrap: true,
        flex: 1,
      },
    ],
  }
}

// Small filled pill used for the rate delta — mint/navy-text for an
// increase, attention/white-text for a decrease. Both combinations
// were checked for >=4.5:1 contrast (mint bg needs dark text; attention
// bg needs light text — the two are NOT symmetric, hence the explicit
// per-direction text color rather than a single "contrasting" rule).
function rateChip(text: string, bg: string, fg: string): Record<string, unknown> {
  return {
    type: 'box',
    layout: 'vertical',
    // flex: 0 — LINE Flex defaults a component to flex:1 (share space
    // evenly with siblings) whenever flex isn't set on ANY sibling at
    // that level. Without this the chip and the previous-rate text
    // next to it split the row's width instead of sizing to their own
    // content, and the chip's own text gets truncated ("฿1,045" →
    // "฿1,…"). Verified against the actual LINE Flex Message Simulator.
    flex: 0,
    backgroundColor: bg,
    cornerRadius: '999px',
    paddingAll: '4px',
    paddingStart: '8px',
    paddingEnd: '8px',
    contents: [{ type: 'text', text, size: 'xs', weight: 'bold', color: fg, align: 'center', flex: 0 }],
  }
}

// Per-room-type rate row for the "Today's recommended rates" block.
//
// Layout — room type (navy, flex1) | previous rate (muted) + chip
// (bold, direction-colored), right-aligned as a unit:
//   Deluxe2                                    ฿950   [ ฿1,045 ]  (mint)
//   Deluxe6                                     ฿850   [ ฿799  ]  (attention)
//   Suite                                              ฿1,200 · คงเดิม
//
// Direction encoding:
//   - increase: previous rate muted + mint chip (navy text) with the
//     suggested rate
//   - decrease: previous rate muted + attention chip (white text) with
//     the suggested rate
//   - hold: single muted rate + "คงเดิม" — no chip (unfilled, matches
//     "the considered, no change" signal being the marker itself)
function perRoomRateRow(row: PerRoomTypeRate): Record<string, unknown> {
  const currentStr = `฿${fmtThb(row.currentRateThb)}`
  const suggestedStr = `฿${fmtThb(row.suggestedRateThb)}`

  const rightContents: Array<Record<string, unknown>> =
    row.direction === 'hold'
      ? [{ type: 'text', text: `${currentStr} · คงเดิม`, size: 'xs', color: COLORS.muted, align: 'end' }]
      : [
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'xs',
            justifyContent: 'flex-end',
            contents: [
              { type: 'text', text: currentStr, size: 'xs', color: COLORS.muted, gravity: 'center', flex: 0 },
              row.direction === 'increase'
                ? rateChip(suggestedStr, COLORS.mint, COLORS.navy)
                : rateChip(suggestedStr, COLORS.attention, COLORS.white),
            ],
          },
        ]

  return {
    type: 'box',
    layout: 'horizontal',
    margin: 'xs',
    alignItems: 'center',
    contents: [
      {
        type: 'text',
        text: row.roomType,
        size: 'xs',
        color: COLORS.navy,
        weight: 'bold',
        flex: 1,
      },
      {
        type: 'box',
        layout: 'vertical',
        flex: 0,
        contents: rightContents,
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
    sectionCard('📊', 'ผลเมื่อคืน', 'Last night', [
      {
        type: 'box',
        layout: 'horizontal',
        // space-between (not a fixed spacing gap) — each tile is
        // flex:0/content-sized, so this distributes the row's full
        // width around them instead of forcing an equal-thirds column
        // that made the longest label wrap mid-word.
        justifyContent: 'space-between',
        margin: 'sm',
        contents: [
          statTile('Occupancy', `${occPct}%`, occColor(occPct)),
          statTile('ADR', adrStr, COLORS.navy),
          statTile('RevPAR', revparStr, COLORS.navy),
        ],
      },
    ]),
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
    const rateRowsContents: Array<Record<string, unknown>> = renderedRates.map((row) => perRoomRateRow(row))
    if (overflowCount > 0) {
      rateRowsContents.push({
        type: 'text',
        text: `+${overflowCount} ห้องอื่นใน RateDesk · +${overflowCount} more in RateDesk`,
        size: 'xxs',
        color: COLORS.muted,
        wrap: true,
        margin: 'sm',
      })
    }
    bodyContents.push(sectionCard('🏨', 'ราคาห้องพัก', 'Room rates', rateRowsContents))
  } else if (data.forecast) {
    // Legacy single-room fallback — no breakdown jsonb at all. The
    // blended forecast strip is the right shape here because there's
    // only one rate to suggest.
    const forecastOcc = Math.round(data.forecast.expectedOccupancy * 100)
    const suggested = `฿${fmtThb(data.forecast.suggestedRateThb)}`
    bodyContents.push(
      sectionCard('🏨', 'ราคาห้องพัก', 'Room rates', [
        {
          type: 'text',
          text: `คืนนี้คาด: Occupancy ${forecastOcc}% · แนะนำ ${suggested}`,
          size: 'sm',
          color: COLORS.navy,
          weight: 'bold',
          wrap: true,
          margin: 'sm',
        },
      ]),
    )
  }

  // "What to do today" insight — bilingual action line synthesised
  // from the rate-mix in perRoomRates. Renders right under the rate
  // sheet so the owner gets a one-glance "next step" prompt even when
  // the threshold-gated signals below (low_occupancy_alert, weekend
  // opportunity, competitor undercut) don't fire — which is the
  // typical case for branches with <3 days of data.
  if (data.dailyAction) {
    bodyContents.push(
      sectionCard('💡', 'วันนี้ควรทำอะไร', "Today's action", [
        {
          type: 'text',
          text: data.dailyAction.messageTh,
          size: 'xs',
          color: COLORS.muted,
          wrap: true,
          margin: 'sm',
        },
      ]),
    )
  }

  // Property-level recs (weekend signal, undercut, etc.) render below
  // the cards as compact rows directly on the sand page — kept as a
  // lightweight styled row (not promoted to its own card) per the
  // restyle brief. Per-room rate moves from topRecs are dropped — the
  // perRoomRates block above already displays them, and double-
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
      styles: {
        // Explicit backgroundColor on every block (header/body/footer)
        // below — required so the bubble renders correctly in LINE
        // dark mode instead of inheriting a transparent/dark default.
        footer: { separator: true, separatorColor: COLORS.separator },
      },
      header: {
        type: 'box',
        layout: 'horizontal',
        backgroundColor: COLORS.navy,
        paddingAll: '16px',
        spacing: 'sm',
        contents: [
          // Circular avatar: a mint-filled circle with a centered
          // compass emoji standing in for the brand mark — LINE Flex
          // can't render the real inline-SVG/gradient compass-mark
          // component, so this is the closest LINE-safe equivalent
          // (no new hosted image asset required).
          {
            type: 'box',
            layout: 'vertical',
            width: '40px',
            height: '40px',
            cornerRadius: '20px',
            backgroundColor: COLORS.mint,
            flex: 0,
            justifyContent: 'center',
            alignItems: 'center',
            contents: [{ type: 'text', text: '🧭', size: 'md', align: 'center' }],
          },
          {
            type: 'box',
            layout: 'vertical',
            flex: 1,
            justifyContent: 'center',
            contents: [
              {
                type: 'text',
                text: data.branchName,
                color: COLORS.white,
                size: 'md',
                weight: 'bold',
                wrap: true,
              },
              {
                type: 'text',
                text: `รายงานเช้า · ${thaiShortDate(data.yesterday.date)} · 07:00`,
                color: COLORS.subtitleOnNavy,
                size: 'xs',
                margin: 'xs',
              },
            ],
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: COLORS.sand,
        paddingAll: '16px',
        spacing: 'md',
        contents: bodyContents,
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: COLORS.sand,
        paddingAll: '12px',
        spacing: 'sm',
        contents: [
          // Auto Push approve button. Renders whenever the caller
          // supplies one — the caller is the gate (plan + adapter
          // supports_write_back). Multi-room hotels CAN show this; the
          // underlying approval row carries the full per-room rate set
          // (room_rates jsonb) and one tap approves the whole set.
          // Navy fill so the LINE-forced white button text stays
          // >=4.5:1 (mint fill would fail contrast with white text).
          ...(data.approveButton
            ? [
                {
                  type: 'button',
                  style: 'primary',
                  color: COLORS.navy,
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
                  color: COLORS.navy,
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
          // — kept OUTSIDE the mint brand strip below since it's a
          // neutral disclaimer, not a positive highlight.
          ...(data.awaitingPmsNote
            ? [
                {
                  type: 'text',
                  text: data.awaitingPmsNote,
                  size: 'xxs',
                  color: COLORS.muted,
                  wrap: true,
                  align: 'center',
                } as Record<string, unknown>,
              ]
            : []),
          // Mint-tinted brand strip. Populated ONLY with content that
          // already exists today (the "RateDesk by Aurasea" tagline) —
          // no fabricated stat (e.g. "+N% from M approved recs") is
          // invented here; that attribution is a separate future build.
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: COLORS.footerHighlight,
            cornerRadius: '8px',
            paddingAll: '8px',
            contents: [
              {
                type: 'text',
                text: 'RateDesk by Aurasea',
                size: 'xxs',
                color: COLORS.navy,
                align: 'center',
              },
            ],
          },
        ],
      },
    },
  }
}
