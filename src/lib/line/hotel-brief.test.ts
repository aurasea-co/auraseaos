import { describe, it, expect } from 'vitest'
import { buildHotelBriefFlexMessage, type HotelBriefData } from './hotel-brief'
import type {
  HotelRecommendation,
  PerRoomTypeRate,
} from '@/lib/recommendations/hotel/engine'

function makePerRoomRate(partial: Partial<PerRoomTypeRate> = {}): PerRoomTypeRate {
  // Base = increase from 1000 → 1100 THB; if the caller overrides the
  // *_Thb fields without providing satang, derive satang from those
  // overrides so the test object stays internally consistent (the
  // engine's invariant: satang = thb * 100).
  const base: PerRoomTypeRate = {
    roomType: 'Deluxe',
    currentRateThb: 1000,
    suggestedRateThb: 1100,
    currentRateSatang: 100000,
    suggestedRateSatang: 110000,
    direction: 'increase',
    reasonTh: 'Occupancy 88% สูง — แนะนำขึ้น',
    reasonEn: '88% occupancy — suggest raise',
    impactThb: 100,
  }
  const merged = { ...base, ...partial }
  if (partial.currentRateThb != null && partial.currentRateSatang == null) {
    merged.currentRateSatang = partial.currentRateThb * 100
  }
  if (partial.suggestedRateThb != null && partial.suggestedRateSatang == null) {
    merged.suggestedRateSatang = partial.suggestedRateThb * 100
  }
  return merged
}

const BASE: HotelBriefData = {
  branchName: 'Crystal Resort',
  yesterday: {
    date: '2026-05-29',
    occupancyRate: 0.42,
    adrThb: 869,
    revparThb: 365,
    revenueThb: 30410,
  },
  topRecs: [],
  forecast: null,
}

// Recursively flatten every nested `text` field in the Flex JSON so
// assertions can check "did the message mention this string?" without
// caring about which sub-box it lives in.
function allText(node: unknown): string[] {
  if (!node || typeof node !== 'object') return []
  const out: string[] = []
  if ('text' in node && typeof (node as { text: unknown }).text === 'string') {
    out.push((node as { text: string }).text)
  }
  for (const v of Object.values(node as Record<string, unknown>)) {
    if (Array.isArray(v)) v.forEach((c) => out.push(...allText(c)))
    else if (typeof v === 'object') out.push(...allText(v))
  }
  return out
}

// Finds the color of the text node whose text exactly matches `value`
// — resilient to nesting depth, unlike a fixed index path into the
// JSON tree.
function findColorFor(node: unknown, value: string): string | undefined {
  if (!node || typeof node !== 'object') return undefined
  const n = node as { text?: unknown; color?: unknown }
  if (n.text === value) return n.color as string | undefined
  for (const v of Object.values(node as Record<string, unknown>)) {
    if (Array.isArray(v)) {
      for (const c of v) {
        const found = findColorFor(c, value)
        if (found) return found
      }
    } else if (typeof v === 'object') {
      const found = findColorFor(v, value)
      if (found) return found
    }
  }
  return undefined
}

// Finds the full text-node object whose text exactly matches `value` —
// same traversal as findColorFor but returns the whole node so a test
// can inspect properties other than color (e.g. flex, wrap).
function findNodeFor(node: unknown, value: string): Record<string, unknown> | undefined {
  if (!node || typeof node !== 'object') return undefined
  const n = node as Record<string, unknown>
  if (n.text === value) return n
  for (const v of Object.values(n)) {
    if (Array.isArray(v)) {
      for (const c of v) {
        const found = findNodeFor(c, value)
        if (found) return found
      }
    } else if (typeof v === 'object') {
      const found = findNodeFor(v, value)
      if (found) return found
    }
  }
  return undefined
}

function makeRec(
  partial: Partial<HotelRecommendation> = {},
): HotelRecommendation {
  return {
    type: 'rate_increase',
    date: '2026-05-30',
    suggestedRateThb: 956,
    currentRateThb: 869,
    messageTh: 'Occupancy สูง 90% ติดต่อกัน 3 วัน — แนะนำขึ้นราคา ฿87',
    messageEn: 'High occupancy 90% for 3 days — suggest raising rate by ฿87',
    urgency: 'high',
    supportingData: {},
    requiresMinDays: 3,
    ...partial,
  }
}

describe('buildHotelBriefFlexMessage', () => {
  it('renders the alt-text with the branch name and KPI summary', () => {
    const env = buildHotelBriefFlexMessage(BASE)
    expect(env.altText).toContain('Crystal Resort')
    expect(env.altText).toContain('42%')
    expect(env.altText).toContain('฿869')
  })

  it('renders all three KPI cards with rounded values (labels uppercase per the tile style)', () => {
    const env = buildHotelBriefFlexMessage(BASE)
    const texts = allText(env.contents)
    expect(texts).toContain('OCCUPANCY')
    expect(texts).toContain('42%')
    expect(texts).toContain('ADR')
    expect(texts).toContain('฿869')
    expect(texts).toContain('REVPAR')
    expect(texts).toContain('฿365')
  })

  it('formats yesterday\'s date in Thai short style with TZ-safe parsing', () => {
    const env = buildHotelBriefFlexMessage(BASE)
    const texts = allText(env.contents).join(' ')
    // "29 พ.ค." — the Thai abbreviation for May. We don't assert the
    // exact dot pattern (locale data can vary) but we do require the
    // numeric day to appear next to the month.
    expect(texts).toMatch(/29 พ\.?ค/)
  })

  it('omits the forecast section when forecast is null', () => {
    const env = buildHotelBriefFlexMessage(BASE)
    const texts = allText(env.contents).join(' ')
    expect(texts).not.toContain('คืนนี้คาด')
  })

  it('renders the legacy blended forecast strip as fallback when no perRoomRates is passed', () => {
    // No breakdown jsonb (legacy single-room property without per-type
    // entry) → perRoomRates absent, forecast present → blended strip
    // is the right shape.
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      forecast: { expectedOccupancy: 0.78, suggestedRateThb: 912 },
    })
    const texts = allText(env.contents).join(' ')
    expect(texts).toContain('คืนนี้คาด')
    expect(texts).toContain('Occupancy 78%')
    expect(texts).toContain('฿912')
  })

  it('prefers the per-room rate block over the blended forecast strip when perRoomRates is non-empty', () => {
    // Even if forecast IS passed, perRoomRates wins — we don't want
    // a multi-room property to also show a meaningless blended ฿X.
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      forecast: { expectedOccupancy: 0.78, suggestedRateThb: 912 },
      perRoomRates: [
        makePerRoomRate({ roomType: 'Suite', currentRateThb: 1200, suggestedRateThb: 1320, impactThb: 120 }),
      ],
    })
    const texts = allText(env.contents).join(' ')
    expect(texts).not.toContain('คืนนี้คาด')
    expect(texts).toContain('ราคาห้องพัก')
    expect(texts).toContain('Suite')
  })

  it('renders up to 2 recommendations even when more are passed', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      topRecs: [
        makeRec({ messageTh: 'REC ONE' }),
        makeRec({ messageTh: 'REC TWO' }),
        makeRec({ messageTh: 'REC THREE — should not appear' }),
      ],
    })
    const texts = allText(env.contents).join(' ')
    expect(texts).toContain('REC ONE')
    expect(texts).toContain('REC TWO')
    expect(texts).not.toContain('REC THREE')
  })

  it('uses the Thai (not English) message when both are available', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      topRecs: [makeRec({ messageTh: 'TH-COPY', messageEn: 'EN-COPY' })],
    })
    const texts = allText(env.contents).join(' ')
    expect(texts).toContain('TH-COPY')
    expect(texts).not.toContain('EN-COPY')
  })

  it('colors the occupancy KPI by threshold (same >=80/<40 tiers, new palette values)', () => {
    // pct >= 80 → mint
    const high = buildHotelBriefFlexMessage({
      ...BASE,
      yesterday: { ...BASE.yesterday, occupancyRate: 0.9 },
    })
    // pct < 40 → attention (red)
    const low = buildHotelBriefFlexMessage({
      ...BASE,
      yesterday: { ...BASE.yesterday, occupancyRate: 0.2 },
    })
    // mid → navy
    const mid = buildHotelBriefFlexMessage({
      ...BASE,
      yesterday: { ...BASE.yesterday, occupancyRate: 0.5 },
    })
    expect(findColorFor(high.contents, '90%')).toBe('#5DCAA5')
    expect(findColorFor(low.contents, '20%')).toBe('#C4453D')
    expect(findColorFor(mid.contents, '50%')).toBe('#042C53')
  })

  it('returns a top-level shape ready for sendLineFlexMessage()', () => {
    const env = buildHotelBriefFlexMessage(BASE)
    expect(typeof env.altText).toBe('string')
    expect(env.contents).toMatchObject({ type: 'bubble', size: 'kilo' })
    // header / body / footer are all present so LINE accepts the bubble.
    const c = env.contents as { header: object; body: object; footer: object }
    expect(c.header).toBeDefined()
    expect(c.body).toBeDefined()
    expect(c.footer).toBeDefined()
  })

  // ── "Today's recommended rates" block — one row per room type ─────────

  it('renders the bilingual block title above the rate rows', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      perRoomRates: [
        makePerRoomRate({ roomType: 'Deluxe2', currentRateThb: 950, suggestedRateThb: 1045 }),
      ],
    })
    const texts = allText(env.contents).join(' ')
    expect(texts).toContain('ราคาห้องพัก')
    expect(texts).toContain('Room rates')
  })

  it('renders all 4 Crystal Resort room types each with their own current → suggested rate', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      perRoomRates: [
        makePerRoomRate({
          roomType: 'Deluxe2',
          currentRateThb: 950,
          suggestedRateThb: 1045,
          direction: 'increase',
          impactThb: 95,
        }),
        makePerRoomRate({
          roomType: 'Deluxe5',
          currentRateThb: 790,
          suggestedRateThb: 790,
          direction: 'hold',
          impactThb: 0,
        }),
        makePerRoomRate({
          roomType: 'Deluxe6',
          currentRateThb: 850,
          suggestedRateThb: 799,
          direction: 'decrease',
          impactThb: 51,
        }),
        makePerRoomRate({
          roomType: 'Suite',
          currentRateThb: 1200,
          suggestedRateThb: 1320,
          direction: 'increase',
          impactThb: 120,
        }),
      ],
    })
    const texts = allText(env.contents).join(' ')
    // Each room type renders.
    expect(texts).toContain('Deluxe2')
    expect(texts).toContain('Deluxe5')
    expect(texts).toContain('Deluxe6')
    expect(texts).toContain('Suite')
    // Each carries its own rate transition — previous rate and the new
    // rate now render as SEPARATE text nodes (previous muted, new rate
    // in its own direction-colored chip) rather than one joined arrow
    // string, per the restyle. Check both values are present as
    // distinct texts rather than one joined string.
    expect(texts).toContain('฿950')
    expect(texts).toContain('฿1,045')
    expect(texts).toContain('฿850')
    expect(texts).toContain('฿799')
    expect(texts).toContain('฿1,200')
    expect(texts).toContain('฿1,320')
    // Hold case shows "คงเดิม" instead of a chip.
    expect(texts).toContain('฿790 · คงเดิม')
    // No single blended ฿X anywhere.
    expect(texts).not.toContain('คืนนี้คาด')
  })

  it('the increase chip is mint-filled with navy text; the decrease chip is attention-filled with white text', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      perRoomRates: [
        makePerRoomRate({ roomType: 'Deluxe2', currentRateThb: 950, suggestedRateThb: 1045, direction: 'increase' }),
        makePerRoomRate({ roomType: 'Deluxe6', currentRateThb: 850, suggestedRateThb: 799, direction: 'decrease' }),
      ],
    })
    // Chip fill is the box's backgroundColor; chip text color is on
    // the nested text node carrying the suggested-rate string. Post-
    // order (children checked before self) so the innermost box with
    // a matching direct text child wins — not an outer ancestor (e.g.
    // the sand page background) whose *descendants* happen to contain
    // the text somewhere deeper.
    const findChipBg = (node: unknown, chipText: string): string | undefined => {
      if (!node || typeof node !== 'object') return undefined
      for (const v of Object.values(node as Record<string, unknown>)) {
        if (Array.isArray(v)) {
          for (const c of v) {
            const found = findChipBg(c, chipText)
            if (found) return found
          }
        } else if (typeof v === 'object') {
          const found = findChipBg(v, chipText)
          if (found) return found
        }
      }
      const n = node as { backgroundColor?: unknown; contents?: unknown }
      if (
        n.backgroundColor &&
        Array.isArray(n.contents) &&
        n.contents.some((c) => c && typeof c === 'object' && (c as { text?: unknown }).text === chipText)
      ) {
        return n.backgroundColor as string
      }
      return undefined
    }
    expect(findChipBg(env.contents, '฿1,045')).toBe('#5DCAA5') // mint
    expect(findColorFor(env.contents, '฿1,045')).toBe('#042C53') // navy text on mint
    expect(findChipBg(env.contents, '฿799')).toBe('#C4453D') // attention
    expect(findColorFor(env.contents, '฿799')).toBe('#FFFFFF') // white text on attention
  })

  // Regression — caught by pasting the actual output into LINE's own
  // Flex Message Simulator (a local CSS-flexbox proxy renderer did NOT
  // reproduce this). Two siblings with no `flex` set both silently
  // default to flex:1 in LINE Flex, splitting the row's width evenly
  // instead of sizing to their own content — the chip's rate text then
  // gets truncated ("฿1,045" rendered as "฿1,…").
  it('previous-rate text and the chip both pin flex:0 so LINE cannot truncate the chip text by splitting space evenly', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      perRoomRates: [
        makePerRoomRate({ roomType: 'Deluxe2', currentRateThb: 950, suggestedRateThb: 1045, direction: 'increase' }),
      ],
    })
    const previousRateNode = findNodeFor(env.contents, '฿950')
    const chipTextNode = findNodeFor(env.contents, '฿1,045')
    expect(previousRateNode?.flex).toBe(0)
    expect(chipTextNode?.flex).toBe(0)
  })

  // Regression — same simulator finding: the OCCUPANCY tile label
  // truncated to "OCCUPAN…" because it lacked wrap:true. ADR/REVPAR
  // happened to fit on one line so the bug only showed on the longest
  // label — asserting on the longest one specifically.
  it('the occupancy stat tile label wraps instead of truncating, and the tile is content-sized (not forced-equal-thirds)', () => {
    // wrap:true is still a safety net; the actual fix for the observed
    // "OCCUPANC" / "Y" mid-word break (from a fixed 1/3-width tile) is
    // content-sizing (flex:0) + the stat row's space-between — pin
    // both so the underlying cause can't silently come back.
    const env = buildHotelBriefFlexMessage(BASE)
    const labelNode = findNodeFor(env.contents, 'OCCUPANCY')
    expect(labelNode?.wrap).toBe(true)
    const valueNode = findNodeFor(env.contents, '42%')
    // The tile is the parent box one level up from the value text.
    const statRow = (
      (env.contents as { body: { contents: Array<Record<string, unknown>> } }).body.contents[0] as {
        contents: Array<Record<string, unknown>>
      }
    ).contents[2] as { justifyContent?: unknown; contents: Array<{ flex?: unknown }> }
    expect(statRow.justifyContent).toBe('space-between')
    expect(statRow.contents[0].flex).toBe(0)
    expect(valueNode).toBeDefined()
  })

  it('shows "คงเดิม" marker for hold rows with no rate transition arrow', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      perRoomRates: [
        makePerRoomRate({
          roomType: 'Standard',
          currentRateThb: 800,
          suggestedRateThb: 800,
          direction: 'hold',
          impactThb: 0,
        }),
      ],
    })
    const texts = allText(env.contents).join(' ')
    expect(texts).toContain('฿800 · คงเดิม')
    expect(texts).not.toContain('฿800 → ฿800')
  })

  it('caps to top 6 by impact and renders "+M more in RateDesk" when many room types', () => {
    // 8 room types — 6 fit in the bubble, 2 overflow.
    const perRoomRates: PerRoomTypeRate[] = [
      makePerRoomRate({ roomType: 'TypeA', currentRateThb: 1000, suggestedRateThb: 1000, direction: 'hold',  impactThb: 0 }),
      makePerRoomRate({ roomType: 'TypeB', currentRateThb: 1000, suggestedRateThb: 1100, direction: 'increase', impactThb: 100 }),
      makePerRoomRate({ roomType: 'TypeC', currentRateThb: 1000, suggestedRateThb: 1300, direction: 'increase', impactThb: 300 }),
      makePerRoomRate({ roomType: 'TypeD', currentRateThb: 1000, suggestedRateThb: 1000, direction: 'hold',  impactThb: 0 }),
      makePerRoomRate({ roomType: 'TypeE', currentRateThb: 1000, suggestedRateThb: 1200, direction: 'increase', impactThb: 200 }),
      makePerRoomRate({ roomType: 'TypeF', currentRateThb: 1000, suggestedRateThb:  800, direction: 'decrease', impactThb: 200 }),
      makePerRoomRate({ roomType: 'TypeG', currentRateThb: 1000, suggestedRateThb:  900, direction: 'decrease', impactThb: 100 }),
      makePerRoomRate({ roomType: 'TypeH', currentRateThb: 1000, suggestedRateThb: 1000, direction: 'hold',  impactThb: 0 }),
    ]
    const env = buildHotelBriefFlexMessage({ ...BASE, perRoomRates })
    const texts = allText(env.contents).join(' ')
    // Top by impact: TypeC (300), TypeE (200), TypeF (200), TypeB (100), TypeG (100), and one of the holds.
    // The "+2 more" tail covers the rest.
    expect(texts).toContain('+2 ห้องอื่นใน RateDesk')
    expect(texts).toContain('+2 more in RateDesk')
    // High-impact ones must appear.
    expect(texts).toContain('TypeC')
    expect(texts).toContain('TypeE')
    expect(texts).toContain('TypeF')
  })

  it('renders all rooms without the overflow tail when count ≤ 6', () => {
    const perRoomRates: PerRoomTypeRate[] = [
      makePerRoomRate({ roomType: 'A', currentRateThb: 1000, suggestedRateThb: 1100 }),
      makePerRoomRate({ roomType: 'B', currentRateThb: 1000, suggestedRateThb: 1100 }),
      makePerRoomRate({ roomType: 'C', currentRateThb: 1000, suggestedRateThb: 1100 }),
      makePerRoomRate({ roomType: 'D', currentRateThb: 1000, suggestedRateThb: 1100 }),
    ]
    const env = buildHotelBriefFlexMessage({ ...BASE, perRoomRates })
    const texts = allText(env.contents).join(' ')
    expect(texts).not.toContain('more in RateDesk')
    expect(texts).not.toContain('ห้องอื่นใน RateDesk')
  })

  // ── Footer button gating unchanged ─────────────────────────────────────

  it('shows the approve button on MULTI-ROOM bubbles when caller passes one (set-wide approval)', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      hasMultipleRoomTypes: true,
      perRoomRates: [
        makePerRoomRate({ roomType: 'Suite', currentRateThb: 1200, suggestedRateThb: 1080, direction: 'decrease', impactThb: 120 }),
        makePerRoomRate({ roomType: 'Deluxe5', currentRateThb: 950, suggestedRateThb: 998, direction: 'increase', impactThb: 48 }),
      ],
      approveButton: {
        url: 'https://example.test/api/line/approve-rate?token=multi-token-123',
        label: '✓ อนุมัติทั้งหมด',
      },
      dashboardUrl: 'https://example.test/ratedesk',
    })
    const footer = (env.contents as { footer: { contents: Array<Record<string, unknown>> } }).footer
    const buttonActions = footer.contents
      .filter((c) => c.type === 'button')
      .map((c) => (c.action as { label: string; uri: string }))
    // 2 buttons: approve + review. Approve sits first.
    expect(buttonActions.length).toBe(2)
    expect(buttonActions[0].label).toBe('✓ อนุมัติทั้งหมด')
    expect(buttonActions[0].uri).toContain('multi-token-123')
    expect(buttonActions[1].label).toBe('ดูใน RateDesk')
  })

  // ── Crystal Resort case: rich Flex, but no live approve button ─────────

  it('Crystal Resort: 4 rate rows + review link + awaiting-PMS note, no live approve', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      hasMultipleRoomTypes: true,
      perRoomRates: [
        makePerRoomRate({ roomType: 'Deluxe2', currentRateThb: 950, suggestedRateThb: 1045, direction: 'increase', impactThb: 95 }),
        makePerRoomRate({ roomType: 'Deluxe5', currentRateThb: 790, suggestedRateThb: 790, direction: 'hold', impactThb: 0 }),
        makePerRoomRate({ roomType: 'Deluxe6', currentRateThb: 850, suggestedRateThb: 850, direction: 'hold', impactThb: 0 }),
        makePerRoomRate({ roomType: 'Suite', currentRateThb: 1200, suggestedRateThb: 1320, direction: 'increase', impactThb: 120 }),
      ],
      dashboardUrl: 'https://example.test/ratedesk',
      awaitingPmsNote: 'Auto Push จะเริ่มทำงานเมื่อเชื่อมต่อ PMS',
    })
    const texts = allText(env.contents).join(' ')
    // All 4 types render.
    expect(texts).toContain('Deluxe2')
    expect(texts).toContain('Deluxe5')
    expect(texts).toContain('Deluxe6')
    expect(texts).toContain('Suite')
    // Block title.
    expect(texts).toContain('ราคาห้องพัก')
    // Footer: review-only path.
    const footer = (env.contents as { footer: { contents: Array<Record<string, unknown>> } }).footer
    const buttonActions = footer.contents
      .filter((c) => c.type === 'button')
      .map((c) => (c.action as { label: string }))
    expect(buttonActions.length).toBe(1)
    expect(buttonActions[0].label).toBe('ดูใน RateDesk')
    expect(texts).toContain('Auto Push จะเริ่มทำงานเมื่อเชื่อมต่อ PMS')
    // No blended single ฿X anywhere.
    expect(texts).not.toContain('คืนนี้คาด')
  })

  it('omits awaiting-PMS note when not provided', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      dashboardUrl: 'https://example.test/ratedesk',
    })
    const texts = allText(env.contents).join(' ')
    expect(texts).not.toContain('Auto Push จะเริ่มทำงานเมื่อเชื่อมต่อ PMS')
  })

  // ── "What to do today" insight callout ────────────────────────────────

  it('renders the dailyAction callout below the rate sheet when provided', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      perRoomRates: [
        makePerRoomRate({ roomType: 'Deluxe2', currentRateThb: 950, suggestedRateThb: 893, direction: 'decrease', impactThb: 57 }),
      ],
      dailyAction: {
        messageTh: 'ทุกห้องมีโอกาสจองต่ำ — เปิดโปรโมชั่น last-minute',
        messageEn: 'All rooms showing soft demand — open a last-minute promo',
      },
    })
    const texts = allText(env.contents).join(' ')
    expect(texts).toContain('วันนี้ควรทำอะไร')
    expect(texts).toContain('Today\'s action')
    expect(texts).toContain('ทุกห้องมีโอกาสจองต่ำ')
  })

  it('omits the dailyAction callout when not provided', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      perRoomRates: [
        makePerRoomRate({ roomType: 'Deluxe2', currentRateThb: 950, suggestedRateThb: 893, direction: 'decrease', impactThb: 57 }),
      ],
    })
    const texts = allText(env.contents).join(' ')
    expect(texts).not.toContain('วันนี้ควรทำอะไร')
    expect(texts).not.toContain('Today\'s action')
  })

  it('dailyAction renders even when topRecs is empty (the Crystal Resort case)', () => {
    // The original bug: branches with <3 days of data → topRecs empty
    // → brief had no "what to do" line at all. With dailyAction the
    // insight always shows.
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      topRecs: [],
      perRoomRates: [
        makePerRoomRate({ roomType: 'Deluxe2', currentRateThb: 950, suggestedRateThb: 893, direction: 'decrease', impactThb: 57 }),
        makePerRoomRate({ roomType: 'Suite',   currentRateThb: 1200, suggestedRateThb: 1128, direction: 'decrease', impactThb: 72 }),
      ],
      dailyAction: {
        messageTh: 'ทุกห้องมีโอกาสจองต่ำ — เปิดโปรโมชั่น last-minute หรือเพิ่มช่องทาง OTA',
        messageEn: 'All rooms showing soft demand — open a last-minute promo or add an OTA channel',
      },
    })
    const texts = allText(env.contents).join(' ')
    // Body of the callout is Thai-first (matches the existing
    // messageTh-only convention in recRow). The bilingual title is
    // verified by the other test above.
    expect(texts).toContain('ทุกห้องมีโอกาสจองต่ำ')
    expect(texts).toContain('last-minute')
  })

  // ── Role gating (canSeeRevenue) — discovery finding ────────────────────
  //
  // buildHotelBriefFlexMessage() takes no role parameter and never reads
  // HotelBriefData.yesterday.revenueThb — this bubble has never shown a
  // Total Revenue figure. canSeeRevenue() gates a DIFFERENT artifact
  // entirely (buildMorningFlashLine, the legacy text-message fallback,
  // and the F&B email) — see morning-flash/route.tsx. So "preserve
  // canSeeRevenue gating exactly" for THIS builder means: an owner
  // variant and a manager variant of the same underlying data are
  // byte-for-byte identical, because there is nothing revenue-class
  // here to hide in the first place. This test proves that invariant
  // rather than inventing a gate that doesn't exist in this file.
  it('owner and manager variants are identical — this bubble has no role param and never renders revenueThb', () => {
    const richData: HotelBriefData = {
      ...BASE,
      perRoomRates: [
        makePerRoomRate({ roomType: 'Deluxe2', currentRateThb: 950, suggestedRateThb: 1045, direction: 'increase', impactThb: 95 }),
        makePerRoomRate({ roomType: 'Suite', currentRateThb: 1200, suggestedRateThb: 1080, direction: 'decrease', impactThb: 120 }),
      ],
      dailyAction: {
        messageTh: 'ดีมานด์สูง — แนะนำขึ้นราคา',
        messageEn: 'High demand — suggest raising rates',
      },
      dashboardUrl: 'https://example.test/ratedesk',
    }
    // No role is threaded into the builder at all — calling it twice
    // with the same data (as an "owner" call and a "manager" call
    // would, since the route never differentiates) yields identical
    // output.
    const ownerVariant = buildHotelBriefFlexMessage(richData)
    const managerVariant = buildHotelBriefFlexMessage(richData)
    expect(managerVariant).toEqual(ownerVariant)

    // And neither variant contains a revenue figure anywhere — the raw
    // ฿30,410 revenueThb value passed in BASE.yesterday never appears.
    const texts = allText(ownerVariant.contents)
    expect(texts.join(' ')).not.toContain('30,410')
  })
})
