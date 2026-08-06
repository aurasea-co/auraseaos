// LINE Flex Message builder for the hotel morning brief.
// Pure function — no I/O, no clock reads — so it's snapshot-testable
// and the route can dry-render it without touching LINE infra.
// Money is THB integers throughout (matches every other consumer in
// this codebase; satang doesn't apply).
//
// VISUAL SYSTEM (SME-clarity restyle, six blocks top to bottom):
//   A. Header — pretitle / branch name / date, navy background.
//   B. Greeting card.
//   C. Results — context pill (if a real calendar event exists),
//      occupancy vs weekday-norm verdict, ADR/RevPAR gloss line,
//      per-room-type rate rows.
//   D. Competitor callout (if a signal fired) — single most relevant
//      competitor gap, positioned right before Today's action.
//   E. Today's action — soft mint callout.
//   F. Footer — "ดูใน RateDesk" button, Auto Push note, brand strip.
// Every data value, threshold, and gating decision is driven by
// fields already computed upstream (engine.ts / per-branch-loader.ts)
// — this file only lays them out. LINE Flex has no custom fonts —
// size/weight/color only.

import type {
  PerRoomTypeRate,
  DailyAction,
  DerivedDayContext,
} from '@/lib/recommendations/hotel/engine'

export interface HotelBriefData {
  branchName: string
  /** RECIPIENT's first name (not the branch/org name) — this brief
   *  fans out to multiple people per branch (owner + any assigned
   *  managers each get their own push), so this varies per send, not
   *  per branch. Caller extracts it from whatever name data it has
   *  (e.g. profiles.display_name, the only name-like column that
   *  exists today — there's no dedicated first_name field). Null/
   *  omitted when the recipient has none on file — see greetingText()
   *  for the fallback. */
  recipientFirstName?: string | null
  /** Yesterday's KPIs in THB. */
  yesterday: {
    /** YYYY-MM-DD in Bangkok wall time. */
    date: string
    occupancyRate: number // 0..1
    adrThb: number
    revparThb: number
    revenueThb: number
  }
  /** "What does this weekday normally do" — same computation that
   *  feeds dailyAction's prose (see engine.ts's deriveDayContext),
   *  exposed as raw fields so this builder can render its own
   *  occupancy-vs-norm verdict line and calendar-event pill instead of
   *  parsing dailyAction.messageTh. Null/omitted when there's
   *  insufficient history — the verdict line and pill are then
   *  omitted rather than fabricated. Managers see this exactly like
   *  owners do — it's a rate-pacing signal, not a revenue figure. */
  weekdayContext?: DerivedDayContext | null
  /** Output of recommendPerRoomTypeRates() — one row per active room
   *  type, including holds. Used to render the per-room-type rate
   *  rows. Builder caps to the top 6 by impact and tags the rest as
   *  "+M more in RateDesk" so the bubble height stays bounded on
   *  properties with many room types. Pass an empty array (or omit)
   *  for legacy single-room properties that have no breakdown — the
   *  brief then falls back to the blended forecast strip. */
  perRoomRates?: PerRoomTypeRate[]
  /** Output of summarizePerRoomRates() — one bilingual action line
   *  derived from the rate-mix in perRoomRates. Rendered in the
   *  "Today's action" callout (block E) so the owner gets a
   *  one-glance "what to do today" prompt even when low-occupancy /
   *  weekend / competitor signals don't fire (typical for branches
   *  with <3 days of data). Omitted → no callout. */
  dailyAction?: DailyAction
  /** Output of forecastTomorrow(); used ONLY when perRoomRates is
   *  empty/absent (legacy single-room properties with no breakdown
   *  jsonb). Pass null when not enough data. */
  forecast: { expectedOccupancy: number; suggestedRateThb: number } | null
  /** Single most relevant competitor signal (from
   *  detectCompetitorUndercutting / detectOverpricing), picked by the
   *  caller — this builder just renders it. 'higher' = competitor is
   *  pricing above us (opportunity to raise); 'lower' = competitor is
   *  pricing below us (may need to reconsider). Null/omitted → block D
   *  is skipped entirely, never a list of signals. */
  competitorCallout?: {
    name: string
    gapThb: number
    direction: 'higher' | 'lower'
  } | null
  /** Deep-link URL to /ratedesk on the dashboard. ALWAYS render the
   *  "ดูใน RateDesk" button when this is provided — it's the only
   *  on-bubble action; there is no live Auto Push approve button in
   *  this brief for now. */
  dashboardUrl?: string
  /** Optional subtle note in the footer when the plan includes Auto
   *  Push but no write-back-capable PMS is connected yet. Caller
   *  decides when this should appear — see
   *  lib/ratedesk/auto-push-gating.ts shouldShowAwaitingPmsNote(). */
  awaitingPmsNote?: string
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
  /** "Below normal" occupancy verdict text — darker than the mint/
   *  attention pair above so it reads distinctly as its own third
   *  state rather than a re-used red. Checked for >=4.5:1 on white. */
  amber: '#B45309',
  /** "Above normal" occupancy verdict text. Raw mint (#5DCAA5) fails
   *  text contrast on white (it's a fill/chip color, per the note
   *  above) — this is a darker green reserved for verdict text only. */
  verdictAbove: '#0F7A5C',
  /** Light red-tinted background for the competitor callout card
   *  (block D). Navy text on top clears contrast easily. */
  attentionTint: '#FBEAEA',
} as const

const WEEKDAY_TH_SHORT = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสฯ', 'ศุกร์', 'เสาร์'] as const

// Header date line — "เสาร์ 15 ส.ค." style. Anchored at UTC midnight
// for the given calendar date (not the host TZ) so both the weekday
// and the day/month stay correct regardless of where this runs.
function thaiHeaderDate(yyyymmdd: string): string {
  const d = new Date(`${yyyymmdd}T00:00:00Z`)
  const dayMonth = d.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Bangkok',
  })
  return `${WEEKDAY_TH_SHORT[d.getUTCDay()]} ${dayMonth}`
}

function fmtThb(n: number): string {
  return Math.round(n).toLocaleString('th-TH')
}

// Single, easily-editable greeting template. ครับ is a MALE politeness
// particle — kept as the default per spec, but isolated here (rather
// than inlined at the call site) specifically so a neutral/female
// variant (e.g. ค่ะ, or dropping the particle) is a one-line swap
// later, not a hunt through the builder.
function greetingText(firstName: string | null | undefined): string {
  const name = firstName && firstName.trim() ? firstName.trim() : null
  // No empty "คุณ" / literal "undefined" when the recipient has no
  // name on file — drop the "คุณ{name}" clause entirely rather than
  // rendering a half-filled greeting.
  return name ? `สวัสดีตอนเช้าครับคุณ${name} ☀️` : `สวัสดีตอนเช้าครับ ☀️`
}

// Greeting card — first card in the body. `highlightCount` is null
// when there's no reliable basis to count (see the caller: legacy
// single-room branches with no per-room-type breakdown have nothing
// to count non-hold rows from) — line 2 is omitted rather than
// guessing or showing a stale/wrong number. Also omitted when the
// count is exactly 0: "today there are 0 important things" reads as a
// glitch, not information, so nothing-to-highlight renders as no
// subline at all rather than a literal zero.
function greetingCard(firstName: string | null | undefined, highlightCount: number | null): Record<string, unknown> {
  const contents: Array<Record<string, unknown>> = [
    { type: 'text', text: greetingText(firstName), size: 'lg', weight: 'bold', color: COLORS.navy, wrap: true },
  ]
  if (highlightCount != null && highlightCount > 0) {
    contents.push({
      type: 'text',
      text: `วันนี้มี ${highlightCount} เรื่องสำคัญ`,
      size: 'xs',
      color: COLORS.muted,
      wrap: true,
      margin: 'xs',
    })
  }
  return whiteCardShell(contents)
}

// Same 3-tier thresholds as before the restyle (>=80 / <40 / else) —
// only the color VALUES changed to the new palette.
function occColor(pct: number): string {
  if (pct >= 80) return COLORS.mint
  if (pct < 40) return COLORS.attention
  return COLORS.navy
}

// Occupancy-vs-weekday-norm verdict — three states so the owner never
// has to do the subtraction themselves. ±4pt band = "near normal";
// outside that, direction decides amber (quieter than usual) vs mint
// (busier than usual).
function verdictFor(gap: number): { emoji: string; text: string; color: string } {
  if (gap < -4) return { emoji: '🔻', text: 'เงียบกว่าปกติ', color: COLORS.amber }
  if (gap > 4) return { emoji: '🔺', text: 'ดีกว่าปกติ', color: COLORS.verdictAbove }
  return { emoji: '⚪', text: 'ใกล้เคียงปกติ', color: COLORS.muted }
}

// ── White card shell ─────────────────────────────────────────────────
// The bare card chrome (background/cornerRadius/padding) shared by
// every card in the body. bg defaults to white; the "Today's action"
// card (block E) passes the mint tint instead.
function whiteCardShell(contents: Array<Record<string, unknown>>, bg: string = COLORS.white): Record<string, unknown> {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: bg,
    cornerRadius: '12px',
    paddingAll: '12px',
    contents,
  }
}

// ── Section card shell ──────────────────────────────────────────────
// Card on the sand page background, led by one icon + a navy label
// row, thin separator beneath the label, then whatever content the
// section supplies. Every icon-led body section uses this same shell
// so the bubble reads as one consistent system.
function sectionCard(
  icon: string,
  labelTh: string,
  labelEn: string,
  contents: Array<Record<string, unknown>>,
  bg: string = COLORS.white,
): Record<string, unknown> {
  return {
    ...whiteCardShell([], bg),
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

// Mint pill floated above the results cards — renders only when the
// caller supplies real demand-calendar text (never hardcoded/guessed).
// Wrapped in a horizontal box so the pill hugs its own content width
// instead of stretching to the vertical body's full width.
function contextPill(text: string): Record<string, unknown> {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        flex: 0,
        backgroundColor: COLORS.mint,
        cornerRadius: '999px',
        paddingAll: '4px',
        paddingStart: '10px',
        paddingEnd: '10px',
        contents: [{ type: 'text', text, size: 'xxs', weight: 'bold', color: COLORS.navy, align: 'center', flex: 0 }],
      },
    ],
  }
}

// Per-room-type rate row — room type (navy, bold, left) vs the
// suggested rate (big bold navy, right) with a small muted subline
// beneath: "เมื่อวาน ฿{prev}" for a real change, "คงเดิม" for a hold
// (restating the identical previous rate there would be noise, not
// information — the hold marker carries the "considered, no change"
// signal instead).
function perRoomRateRow(row: PerRoomTypeRate): Record<string, unknown> {
  const suggestedStr = `฿${fmtThb(row.suggestedRateThb)}`
  const currentStr = `฿${fmtThb(row.currentRateThb)}`

  // Direction accent — a small colored ▲/▼ ahead of the "เมื่อวาน ฿X"
  // subline. The hero rate itself stays flat navy (per spec); this is
  // just enough of a signal to scan the sheet for what moved without
  // reading every number. Reuses already contrast-checked text colors
  // (verdictAbove / attention) rather than raw mint, which fails text
  // contrast on white — see the COLORS block's note on that.
  const sublineNode: Record<string, unknown> =
    row.direction === 'hold'
      ? { type: 'text', text: 'คงเดิม', size: 'xxs', color: COLORS.muted, align: 'end', margin: 'xs' }
      : {
          type: 'text',
          contents: [
            {
              type: 'span',
              text: row.direction === 'increase' ? '▲ ' : '▼ ',
              color: row.direction === 'increase' ? COLORS.verdictAbove : COLORS.attention,
              weight: 'bold',
            },
            { type: 'span', text: `เมื่อวาน ${currentStr}`, color: COLORS.muted },
          ],
          size: 'xxs',
          align: 'end',
          margin: 'xs',
        }

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
        contents: [
          { type: 'text', text: suggestedStr, size: 'md', weight: 'bold', color: COLORS.navy, align: 'end' },
          sublineNode,
        ],
      },
    ],
  }
}

// Competitor callout (block D) — the single most relevant signal, not
// a list. Both directions name the real competitor and a real ฿ gap;
// never a blended "คู่แข่งเฉลี่ย" figure.
function competitorCalloutBox(c: NonNullable<HotelBriefData['competitorCallout']>): Record<string, unknown> {
  const gapStr = `฿${fmtThb(c.gapThb)}`
  const text =
    c.direction === 'higher'
      ? `🔴 ${c.name} ตั้งราคาสูงกว่าคุณ ${gapStr} — มีโอกาสปรับราคาขึ้นได้`
      : `🔴 ${c.name} ตั้งราคาต่ำกว่าคุณ ${gapStr} — อาจต้องทบทวนราคาลง`
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: COLORS.attentionTint,
    cornerRadius: '12px',
    paddingAll: '12px',
    contents: [{ type: 'text', text, size: 'xs', color: COLORS.navy, wrap: true }],
  }
}

export function buildHotelBriefFlexMessage(data: HotelBriefData): FlexMessageEnvelope {
  const occPct = Math.round(data.yesterday.occupancyRate * 100)
  const adrStr = `฿${fmtThb(data.yesterday.adrThb)}`
  const revparStr = `฿${fmtThb(data.yesterday.revparThb)}`

  const altText = `☀️ ${data.branchName} — เมื่อคืน Occupancy ${occPct}% ADR ${adrStr}`

  const bodyContents: Array<Record<string, unknown>> = []

  // Context pill — only when a real demand-calendar event overlaps,
  // never a generic "expect a crowd" guess.
  const eventNameTh = data.weekdayContext?.demandCalendarEventNameTh
  if (eventNameTh) {
    bodyContents.push(contextPill(eventNameTh))
  }

  // ── Results: occupancy verdict + ADR/RevPAR gloss ──
  const resultsCardContents: Array<Record<string, unknown>> = [
    {
      type: 'text',
      contents: [
        { type: 'span', text: 'เมื่อวานนี้เข้าพัก ' },
        { type: 'span', text: `${occPct}%`, color: occColor(occPct) },
      ],
      size: 'xl',
      weight: 'bold',
      color: COLORS.navy,
      wrap: true,
    },
  ]
  const wc = data.weekdayContext
  if (wc && wc.weekdayNameTh != null && wc.weekdayOccupancyBaseline != null && wc.todayVsWeekdayNorm != null) {
    const v = verdictFor(wc.todayVsWeekdayNorm)
    resultsCardContents.push({
      type: 'text',
      contents: [
        { type: 'span', text: `ปกติ${wc.weekdayNameTh} ~${wc.weekdayOccupancyBaseline}% · ` },
        { type: 'span', text: `${v.emoji} ${v.text}`, color: v.color, weight: 'bold' },
      ],
      size: 'xs',
      color: COLORS.muted,
      wrap: true,
      margin: 'xs',
    })
  }
  resultsCardContents.push({
    type: 'text',
    text: `ราคาเฉลี่ย/คืน (ADR) ${adrStr} · รายได้ต่อห้อง (RevPAR) ${revparStr}`,
    size: 'xs',
    color: COLORS.muted,
    wrap: true,
    margin: 'sm',
  })
  bodyContents.push(sectionCard('📊', 'ผลเมื่อคืน', 'Last night', resultsCardContents))

  // ── Per-room-type rate rows — replaces the old single-blended-rate
  // forecast strip. Renders one row per active room type (currentRate
  // → suggestedRate, or "คงเดิม" for holds). Caps to MAX_PER_ROOM_ROWS
  // in the bubble; sorting picks the top N by impact so the owner sees
  // the most actionable moves first, then we restore the engine's
  // natural (input) order for display.
  //
  // The blended forecast strip stays as a fallback for properties
  // whose breakdown jsonb is empty (legacy single-room imports that
  // never went through the per-type entry form).
  const perRoomRates = data.perRoomRates ?? []
  const MAX_PER_ROOM_ROWS = 6
  let renderedRates: PerRoomTypeRate[] = perRoomRates
  let overflowCount = 0
  if (perRoomRates.length > MAX_PER_ROOM_ROWS) {
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
    bodyContents.push(sectionCard('🏨', 'ราคาห้องพักแนะนำวันนี้', 'Suggested Today Room rates', rateRowsContents))
  } else if (data.forecast) {
    // Legacy single-room fallback — no breakdown jsonb at all.
    const forecastOcc = Math.round(data.forecast.expectedOccupancy * 100)
    const suggested = `฿${fmtThb(data.forecast.suggestedRateThb)}`
    bodyContents.push(
      sectionCard('🏨', 'ราคาห้องพักแนะนำวันนี้', 'Suggested Today Room rates', [
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

  // ── Competitor callout (block D) — single most relevant signal,
  // positioned right before Today's action. ──
  const hasCompetitorCallout = !!(data.competitorCallout && data.competitorCallout.name)
  if (hasCompetitorCallout) {
    bodyContents.push(competitorCalloutBox(data.competitorCallout as NonNullable<HotelBriefData['competitorCallout']>))
  }

  // ── Today's action (block E) — soft mint callout. ──
  if (data.dailyAction) {
    bodyContents.push(
      sectionCard(
        '💡',
        'วันนี้ควรทำอะไร',
        "Today's action",
        [
          {
            type: 'text',
            text: data.dailyAction.messageTh,
            size: 'xs',
            color: COLORS.muted,
            wrap: true,
            margin: 'sm',
          },
        ],
        COLORS.footerHighlight,
      ),
    )
  }

  // Personalized greeting card — inserted as the FIRST body card, once
  // everything else above has run so the highlight count reflects the
  // same rate-mix/signals actually rendered below it. "Highlights" =
  // non-hold rate rows (things that actually changed) + the competitor
  // callout (1, if shown) — both already computed above, no new data.
  // perRoomRates empty → the legacy forecast-only fallback has no per-
  // room-type breakdown to count from at all, so there's no reliable
  // basis for a number — null, not a guess.
  const highlightCount =
    perRoomRates.length > 0
      ? perRoomRates.filter((r) => r.direction !== 'hold').length + (hasCompetitorCallout ? 1 : 0)
      : null
  bodyContents.unshift(greetingCard(data.recipientFirstName, highlightCount))

  return {
    altText,
    contents: {
      type: 'bubble',
      size: 'kilo',
      styles: {
        footer: { separator: true, separatorColor: COLORS.separator },
      },
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: COLORS.navy,
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: 'สรุปราคาห้องเช้านี้',
            color: COLORS.subtitleOnNavy,
            size: 'xs',
          },
          {
            type: 'text',
            text: data.branchName,
            color: COLORS.white,
            size: 'lg',
            weight: 'bold',
            wrap: true,
            margin: 'xs',
          },
          {
            type: 'text',
            text: thaiHeaderDate(data.yesterday.date),
            color: COLORS.subtitleOnNavy,
            size: 'xs',
            margin: 'xs',
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
          // "Review in RateDesk" deep-link — the only on-bubble action
          // for now (no live Auto Push approve button — see
          // HotelBriefData.dashboardUrl doc comment).
          //
          // style: 'primary' (not 'secondary') — a 'secondary' button's
          // own background chrome rendered dark in testing, making its
          // navy label text unreadable regardless of which text color
          // was set. 'primary' + color: navy fills the button with the
          // exact same navy as the header and forces white label text
          // automatically, guaranteed >=4.5:1 (white on navy is ~14:1).
          ...(data.dashboardUrl
            ? [
                {
                  type: 'button',
                  style: 'primary',
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
          // no fabricated stat is invented here.
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
