import { describe, it, expect } from 'vitest'
import { buildHotelBriefFlexMessage, type HotelBriefData } from './hotel-brief'
import type { PerRoomTypeRate } from '@/lib/recommendations/hotel/engine'

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
  // Deliberately a different calendar day from yesterday.date below —
  // this is the this-morning summary framing under test: the header
  // shows the send date, "เมื่อวานนี้" reports yesterday.date's data.
  sendDate: '2026-05-30',
  yesterday: {
    date: '2026-05-29',
    occupancyRate: 0.42,
    adrThb: 869,
    revparThb: 365,
    revenueThb: 30410,
  },
  forecast: null,
}

// Recursively flatten every nested `text` field (including span
// children) in the Flex JSON so assertions can check "did the message
// mention this string?" without caring about which sub-box it lives in.
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

// Joins allText() so substring assertions can span adjacent span nodes
// (e.g. "เมื่อวานนี้เข้าพัก " + "42%" rendered as sibling spans).
function joinedText(node: unknown): string {
  return allText(node).join('')
}

// Finds the color of the text/span node whose text exactly matches
// `value` — resilient to nesting depth.
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

describe('buildHotelBriefFlexMessage', () => {
  it('renders the alt-text with the branch name and KPI summary', () => {
    const env = buildHotelBriefFlexMessage(BASE)
    expect(env.altText).toContain('Crystal Resort')
    expect(env.altText).toContain('42%')
    expect(env.altText).toContain('฿869')
  })

  it('returns a top-level shape ready for sendLineFlexMessage()', () => {
    const env = buildHotelBriefFlexMessage(BASE)
    expect(typeof env.altText).toBe('string')
    expect(env.contents).toMatchObject({ type: 'bubble', size: 'kilo' })
    const c = env.contents as { header: object; body: object; footer: object }
    expect(c.header).toBeDefined()
    expect(c.body).toBeDefined()
    expect(c.footer).toBeDefined()
  })

  // ── Block A: header — 3 lines in order ──────────────────────────────

  it('renders the header as 3 lines in order: pretitle, branch name, date', () => {
    const env = buildHotelBriefFlexMessage(BASE)
    const header = (env.contents as { header: { contents: Array<Record<string, unknown>> } }).header
    expect(header.contents).toHaveLength(3)
    expect(header.contents[0].text).toBe('สรุปราคาห้องเช้านี้')
    expect(header.contents[1].text).toBe('Crystal Resort')
    expect(header.contents[1].weight).toBe('bold')
    expect(header.contents[1].color).toBe('#FFFFFF')
    // Header tracks sendDate (2026-05-30, a Saturday) — the delivery
    // date — NOT yesterday.date (2026-05-29). Proves the header no
    // longer reads as "today" while actually showing the reported
    // night's own date.
    expect(header.contents[2].text).toMatch(/^เสาร์ 30 พ\.?ค/)
  })

  // ── Block B: greeting card ───────────────────────────────────────────

  function greetingCardLines(env: ReturnType<typeof buildHotelBriefFlexMessage>): string[] {
    const body = (env.contents as { body: { contents: Array<Record<string, unknown>> } }).body
    const card = body.contents[0] as { type: string; contents: Array<{ text: string }> }
    expect(card.type).toBe('box')
    return card.contents.map((c) => c.text)
  }

  describe('personalized greeting card — name line', () => {
    it('is the first body card, greeting the recipient by first name', () => {
      const env = buildHotelBriefFlexMessage({ ...BASE, recipientFirstName: 'สมชาย' })
      expect(greetingCardLines(env)[0]).toBe('สวัสดีตอนเช้าครับคุณสมชาย ☀️')
    })

    it('falls back to a nameless greeting — no empty "คุณ" or literal "undefined" — when recipientFirstName is omitted', () => {
      const env = buildHotelBriefFlexMessage(BASE)
      const greeting = greetingCardLines(env)[0]
      expect(greeting).toBe('สวัสดีตอนเช้าครับ ☀️')
      expect(greeting).not.toContain('คุณ')
      expect(greeting).not.toContain('undefined')
      expect(greeting).not.toContain('null')
    })

    it('falls back cleanly when recipientFirstName is explicitly null', () => {
      const env = buildHotelBriefFlexMessage({ ...BASE, recipientFirstName: null })
      expect(greetingCardLines(env)[0]).toBe('สวัสดีตอนเช้าครับ ☀️')
    })
  })

  describe('personalized greeting card — dynamic highlight count subline', () => {
    it('counts non-hold rate rows + the competitor callout (1, if shown), never a hardcoded number', () => {
      const env = buildHotelBriefFlexMessage({
        ...BASE,
        recipientFirstName: 'Nok',
        perRoomRates: [
          makePerRoomRate({ roomType: 'Deluxe2', direction: 'increase' }),
          makePerRoomRate({ roomType: 'Deluxe5', direction: 'hold' }), // not counted
          makePerRoomRate({ roomType: 'Deluxe6', direction: 'decrease' }),
        ],
        competitorCallout: { name: 'Sima Thani', gapThb: 221, direction: 'higher' },
      })
      // 2 non-hold rates + 1 competitor callout = 3 — but derived, not literal.
      expect(greetingCardLines(env)[1]).toBe('วันนี้มี 3 เรื่องสำคัญ')
    })

    it('omits the subline entirely when the count is zero — never "วันนี้มี 0 เรื่องสำคัญ"', () => {
      const env = buildHotelBriefFlexMessage({
        ...BASE,
        perRoomRates: [makePerRoomRate({ direction: 'hold' })],
      })
      expect(greetingCardLines(env)).toHaveLength(1)
    })

    it('omits the subline when perRoomRates is empty — no reliable basis to count (legacy forecast-only branch)', () => {
      const env = buildHotelBriefFlexMessage({
        ...BASE,
        perRoomRates: undefined,
        forecast: { expectedOccupancy: 0.6, suggestedRateThb: 900 },
        competitorCallout: { name: 'Sima Thani', gapThb: 221, direction: 'higher' },
      })
      expect(greetingCardLines(env)).toHaveLength(1)
    })

    it('is completely independent of "ผลเมื่อคืน" (yesterday\'s occupancy/ADR/RevPAR) — the results card never contributes to the count', () => {
      const rates = [
        makePerRoomRate({ roomType: 'Deluxe2', direction: 'increase' }),
        makePerRoomRate({ roomType: 'Deluxe6', direction: 'decrease' }),
        makePerRoomRate({ roomType: 'Suite', direction: 'decrease' }),
      ]
      const low = buildHotelBriefFlexMessage({
        ...BASE,
        yesterday: { date: '2026-05-29', occupancyRate: 0.05, adrThb: 100, revparThb: 5, revenueThb: 500 },
        perRoomRates: rates,
      })
      const high = buildHotelBriefFlexMessage({
        ...BASE,
        yesterday: { date: '2026-05-29', occupancyRate: 0.99, adrThb: 9999, revparThb: 9899, revenueThb: 999999 },
        perRoomRates: rates,
      })
      expect(greetingCardLines(low)[1]).toBe('วันนี้มี 3 เรื่องสำคัญ')
      expect(greetingCardLines(high)[1]).toBe('วันนี้มี 3 เรื่องสำคัญ')
    })
  })

  // ── Block C: context pill ────────────────────────────────────────────

  describe('context pill', () => {
    it('renders the real calendar event name when weekdayContext carries one', () => {
      const env = buildHotelBriefFlexMessage({
        ...BASE,
        weekdayContext: {
          occPct: 42,
          belowTargetPct: null,
          trend: 'steady',
          isWeekend: false,
          competitorGapPct: null,
          weekdayOccupancyBaseline: null,
          todayVsWeekdayNorm: null,
          wowDirection: null,
          weekdaySampleCount: 0,
          weekdayNameTh: null,
          weekdayNameEn: null,
          demandCalendarEventNameTh: 'วันสงกรานต์',
          demandCalendarEventNameEn: 'Songkran Festival',
        },
      })
      expect(joinedText(env.contents)).toContain('วันสงกรานต์')
    })

    it('omits the pill entirely when there is no calendar event — never a hardcoded "long weekend" string', () => {
      const env = buildHotelBriefFlexMessage(BASE)
      const texts = joinedText(env.contents)
      expect(texts).not.toContain('วันหยุดยาว')
    })
  })

  // ── Block C: occupancy verdict line ──────────────────────────────────

  describe('occupancy block', () => {
    it('renders "เมื่อวานนี้เข้าพัก {occ}%" as the prominent line, never "วันนี้"', () => {
      const env = buildHotelBriefFlexMessage(BASE)
      const texts = joinedText(env.contents)
      expect(texts).toContain('เมื่อวานนี้เข้าพัก 42%')
      expect(texts).not.toContain('วันนี้เข้าพัก')
    })

    it('colors the occupancy number by threshold (same >=80/<40 tiers as before)', () => {
      const high = buildHotelBriefFlexMessage({ ...BASE, yesterday: { ...BASE.yesterday, occupancyRate: 0.9 } })
      const low = buildHotelBriefFlexMessage({ ...BASE, yesterday: { ...BASE.yesterday, occupancyRate: 0.2 } })
      const mid = buildHotelBriefFlexMessage({ ...BASE, yesterday: { ...BASE.yesterday, occupancyRate: 0.5 } })
      expect(findColorFor(high.contents, '90%')).toBe('#5DCAA5')
      expect(findColorFor(low.contents, '20%')).toBe('#C4453D')
      expect(findColorFor(mid.contents, '50%')).toBe('#042C53')
    })

    const baseWeekdayContext = {
      occPct: 62,
      belowTargetPct: null,
      trend: 'steady' as const,
      isWeekend: false,
      competitorGapPct: null,
      wowDirection: null,
      weekdaySampleCount: 4,
      weekdayNameTh: 'วันเสาร์',
      weekdayNameEn: 'Sat',
      demandCalendarEventNameTh: null,
      demandCalendarEventNameEn: null,
    }

    it('names the day of week in "ปกติวัน{dow}" and shows the mint "ดีกว่าปกติ" verdict when gap > +4', () => {
      const env = buildHotelBriefFlexMessage({
        ...BASE,
        weekdayContext: { ...baseWeekdayContext, weekdayOccupancyBaseline: 50, todayVsWeekdayNorm: 12 },
      })
      const texts = joinedText(env.contents)
      expect(texts).toContain('ปกติวันเสาร์ ~50%')
      expect(texts).toContain('🔺 ดีกว่าปกติ')
      expect(findColorFor(env.contents, '🔺 ดีกว่าปกติ')).toBe('#0F7A5C')
    })

    it('shows the amber "เงียบกว่าปกติ" verdict when gap < -4', () => {
      const env = buildHotelBriefFlexMessage({
        ...BASE,
        weekdayContext: { ...baseWeekdayContext, weekdayOccupancyBaseline: 80, todayVsWeekdayNorm: -18 },
      })
      expect(findColorFor(env.contents, '🔻 เงียบกว่าปกติ')).toBe('#B45309')
    })

    it('shows the gray "ใกล้เคียงปกติ" verdict within the ±4 band, never "-" as a separator', () => {
      const env = buildHotelBriefFlexMessage({
        ...BASE,
        weekdayContext: { ...baseWeekdayContext, weekdayOccupancyBaseline: 60, todayVsWeekdayNorm: 2 },
      })
      const texts = joinedText(env.contents)
      expect(texts).toContain('⚪ ใกล้เคียงปกติ')
      expect(texts).not.toContain('ปกติวันเสาร์ ~60% - ')
    })

    it('omits the verdict line entirely when weekdayContext has insufficient history — never a fabricated norm', () => {
      const env = buildHotelBriefFlexMessage({
        ...BASE,
        weekdayContext: { ...baseWeekdayContext, weekdayOccupancyBaseline: null, todayVsWeekdayNorm: null },
      })
      const texts = joinedText(env.contents)
      expect(texts).not.toContain('ปกติวัน')
    })

    it('omits the verdict line when weekdayContext is not provided at all', () => {
      const env = buildHotelBriefFlexMessage(BASE)
      const texts = joinedText(env.contents)
      expect(texts).not.toContain('ปกติวัน')
    })
  })

  // ── Block C: ADR & RevPAR gloss line ─────────────────────────────────

  it('renders the ADR/RevPAR line with Thai glosses, visible regardless of role (no revenue gate on this bubble)', () => {
    const env = buildHotelBriefFlexMessage(BASE)
    const texts = joinedText(env.contents)
    expect(texts).toContain('ราคาเฉลี่ย/คืน (ADR) ฿869 · รายได้ต่อห้อง (RevPAR) ฿365')
  })

  // ── Block C: per-room-type rate rows ─────────────────────────────────

  it('omits the forecast section when forecast is null and perRoomRates is empty', () => {
    const env = buildHotelBriefFlexMessage(BASE)
    const texts = joinedText(env.contents)
    expect(texts).not.toContain('คืนนี้คาด')
  })

  it('renders the legacy blended forecast strip as fallback when no perRoomRates is passed', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      forecast: { expectedOccupancy: 0.78, suggestedRateThb: 912 },
    })
    const texts = joinedText(env.contents)
    expect(texts).toContain('คืนนี้คาด')
    expect(texts).toContain('Occupancy 78%')
    expect(texts).toContain('฿912')
  })

  it('prefers the per-room rate block over the blended forecast strip when perRoomRates is non-empty', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      forecast: { expectedOccupancy: 0.78, suggestedRateThb: 912 },
      perRoomRates: [
        makePerRoomRate({ roomType: 'Suite', currentRateThb: 1200, suggestedRateThb: 1320, impactThb: 120 }),
      ],
    })
    const texts = joinedText(env.contents)
    expect(texts).not.toContain('คืนนี้คาด')
    expect(texts).toContain('ราคาห้องพัก')
    expect(texts).toContain('Suite')
  })

  it('renders all 4 Crystal Resort room types, each with a bold room name (left) and a big bold suggested rate (right, navy)', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      perRoomRates: [
        makePerRoomRate({ roomType: 'Deluxe2', currentRateThb: 950, suggestedRateThb: 1045, direction: 'increase', impactThb: 95 }),
        makePerRoomRate({ roomType: 'Deluxe5', currentRateThb: 790, suggestedRateThb: 790, direction: 'hold', impactThb: 0 }),
        makePerRoomRate({ roomType: 'Deluxe6', currentRateThb: 850, suggestedRateThb: 799, direction: 'decrease', impactThb: 51 }),
        makePerRoomRate({ roomType: 'Suite', currentRateThb: 1200, suggestedRateThb: 1320, direction: 'increase', impactThb: 120 }),
      ],
    })
    const texts = joinedText(env.contents)
    expect(texts).toContain('Deluxe2')
    expect(texts).toContain('Deluxe5')
    expect(texts).toContain('Deluxe6')
    expect(texts).toContain('Suite')
    // Suggested rate is the hero figure — big, bold, navy.
    expect(findColorFor(env.contents, '฿1,045')).toBe('#042C53')
    const suggestedNode = findNodeFor(env.contents, '฿1,045')
    expect(suggestedNode?.weight).toBe('bold')
    // "เมื่อวาน ฿{prev}" subline for real changes.
    expect(texts).toContain('เมื่อวาน ฿950')
    expect(texts).toContain('เมื่อวาน ฿850')
    expect(texts).toContain('เมื่อวาน ฿1,200')
    // Hold case shows "คงเดิม" instead of restating the same rate.
    expect(texts).toContain('คงเดิม')
    expect(texts).not.toContain('เมื่อวาน ฿790')
    expect(texts).not.toContain('คืนนี้คาด')
  })

  it('accents the subline with a colored ▲/▼ direction marker, hero rate stays flat navy', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      perRoomRates: [
        makePerRoomRate({ roomType: 'Deluxe2', currentRateThb: 950, suggestedRateThb: 1045, direction: 'increase', impactThb: 95 }),
        makePerRoomRate({ roomType: 'Deluxe6', currentRateThb: 850, suggestedRateThb: 799, direction: 'decrease', impactThb: 51 }),
        makePerRoomRate({ roomType: 'Deluxe5', currentRateThb: 790, suggestedRateThb: 790, direction: 'hold', impactThb: 0 }),
      ],
    })
    // Increase → dark-green ▲; decrease → attention-red ▼. Both are
    // contrast-checked text colors reused from elsewhere in the file
    // (not raw mint, which fails text contrast on white).
    expect(findColorFor(env.contents, '▲ ')).toBe('#0F7A5C')
    expect(findColorFor(env.contents, '▼ ')).toBe('#C4453D')
    // The hero rate numbers themselves are unaffected — still flat navy.
    expect(findColorFor(env.contents, '฿1,045')).toBe('#042C53')
    expect(findColorFor(env.contents, '฿799')).toBe('#042C53')
    // Hold rows carry no arrow at all.
    const holdRow = findNodeFor(env.contents, 'คงเดิม')
    expect(holdRow?.contents).toBeUndefined() // plain text node, not a spans array
  })

  it('caps to top 6 by impact and renders "+M more in RateDesk" when many room types', () => {
    const perRoomRates: PerRoomTypeRate[] = [
      makePerRoomRate({ roomType: 'TypeA', currentRateThb: 1000, suggestedRateThb: 1000, direction: 'hold', impactThb: 0 }),
      makePerRoomRate({ roomType: 'TypeB', currentRateThb: 1000, suggestedRateThb: 1100, direction: 'increase', impactThb: 100 }),
      makePerRoomRate({ roomType: 'TypeC', currentRateThb: 1000, suggestedRateThb: 1300, direction: 'increase', impactThb: 300 }),
      makePerRoomRate({ roomType: 'TypeD', currentRateThb: 1000, suggestedRateThb: 1000, direction: 'hold', impactThb: 0 }),
      makePerRoomRate({ roomType: 'TypeE', currentRateThb: 1000, suggestedRateThb: 1200, direction: 'increase', impactThb: 200 }),
      makePerRoomRate({ roomType: 'TypeF', currentRateThb: 1000, suggestedRateThb: 800, direction: 'decrease', impactThb: 200 }),
      makePerRoomRate({ roomType: 'TypeG', currentRateThb: 1000, suggestedRateThb: 900, direction: 'decrease', impactThb: 100 }),
      makePerRoomRate({ roomType: 'TypeH', currentRateThb: 1000, suggestedRateThb: 1000, direction: 'hold', impactThb: 0 }),
    ]
    const env = buildHotelBriefFlexMessage({ ...BASE, perRoomRates })
    const texts = joinedText(env.contents)
    expect(texts).toContain('+2 ห้องอื่นใน RateDesk')
    expect(texts).toContain('+2 more in RateDesk')
    expect(texts).toContain('TypeC')
    expect(texts).toContain('TypeE')
    expect(texts).toContain('TypeF')
  })

  it('renders all rooms without the overflow tail when count ≤ 6', () => {
    const perRoomRates: PerRoomTypeRate[] = [
      makePerRoomRate({ roomType: 'A', currentRateThb: 1000, suggestedRateThb: 1100 }),
      makePerRoomRate({ roomType: 'B', currentRateThb: 1000, suggestedRateThb: 1100 }),
    ]
    const env = buildHotelBriefFlexMessage({ ...BASE, perRoomRates })
    const texts = joinedText(env.contents)
    expect(texts).not.toContain('more in RateDesk')
    expect(texts).not.toContain('ห้องอื่นใน RateDesk')
  })

  // ── Block D: competitor callout ──────────────────────────────────────

  describe('competitor callout', () => {
    it('renders the "competitor higher" direction with the real name and gap, opportunity framing', () => {
      const env = buildHotelBriefFlexMessage({
        ...BASE,
        competitorCallout: { name: 'Sima Thani', gapThb: 221, direction: 'higher' },
      })
      const texts = joinedText(env.contents)
      expect(texts).toContain('🔴 Sima Thani ตั้งราคาสูงกว่าคุณ ฿221 — มีโอกาสปรับราคาขึ้นได้')
    })

    it('renders the "competitor lower" direction with the real name and gap, review framing', () => {
      const env = buildHotelBriefFlexMessage({
        ...BASE,
        competitorCallout: { name: 'Sima Thani', gapThb: 150, direction: 'lower' },
      })
      const texts = joinedText(env.contents)
      expect(texts).toContain('🔴 Sima Thani ตั้งราคาต่ำกว่าคุณ ฿150 — อาจต้องทบทวนราคาลง')
    })

    it('never renders a blended "คู่แข่งแถวนี้เฉลี่ย · ราคาพี่ตอนนี้" line', () => {
      const env = buildHotelBriefFlexMessage({
        ...BASE,
        competitorCallout: { name: 'Sima Thani', gapThb: 221, direction: 'higher' },
      })
      const texts = joinedText(env.contents)
      expect(texts).not.toContain('คู่แข่งแถวนี้เฉลี่ย')
      expect(texts).not.toContain('ราคาพี่ตอนนี้')
    })

    it('omits the callout entirely when not provided', () => {
      const env = buildHotelBriefFlexMessage(BASE)
      expect(joinedText(env.contents)).not.toContain('ตั้งราคา')
    })

    it('is positioned immediately before the Today\'s action card', () => {
      const env = buildHotelBriefFlexMessage({
        ...BASE,
        competitorCallout: { name: 'Sima Thani', gapThb: 221, direction: 'higher' },
        dailyAction: { messageTh: 'ACTION-TEXT', messageEn: 'action text' },
      })
      const body = (env.contents as { body: { contents: Array<Record<string, unknown>> } }).body
      const calloutIndex = body.contents.findIndex((c) => joinedText(c).includes('ตั้งราคาสูงกว่าคุณ'))
      const actionIndex = body.contents.findIndex((c) => joinedText(c).includes('ACTION-TEXT'))
      expect(calloutIndex).toBeGreaterThan(-1)
      expect(actionIndex).toBe(calloutIndex + 1)
    })
  })

  // ── Block E: Today's action ──────────────────────────────────────────

  it('renders the dailyAction callout in a soft mint box', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      dailyAction: {
        messageTh: 'ทุกห้องมีโอกาสจองต่ำ — เปิดโปรโมชั่น last-minute',
        messageEn: 'All rooms showing soft demand — open a last-minute promo',
      },
    })
    const texts = joinedText(env.contents)
    expect(texts).toContain('วันนี้ควรทำอะไร')
    expect(texts).toContain("Today's action")
    expect(texts).toContain('ทุกห้องมีโอกาสจองต่ำ')
    const body = (env.contents as { body: { contents: Array<Record<string, unknown>> } }).body
    const actionCard = body.contents.find((c) => joinedText(c).includes('ทุกห้องมีโอกาสจองต่ำ')) as
      | { backgroundColor?: string }
      | undefined
    expect(actionCard?.backgroundColor).toBe('#EAF6F0')
  })

  it('omits the dailyAction callout when not provided', () => {
    const env = buildHotelBriefFlexMessage(BASE)
    const texts = joinedText(env.contents)
    expect(texts).not.toContain('วันนี้ควรทำอะไร')
    expect(texts).not.toContain("Today's action")
  })

  // ── Block F: footer ───────────────────────────────────────────────────

  it('renders only the "ดูใน RateDesk" button — no live Auto Push approve button', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      perRoomRates: [makePerRoomRate({ roomType: 'Suite' })],
      dashboardUrl: 'https://example.test/ratedesk',
    })
    const footer = (env.contents as { footer: { contents: Array<Record<string, unknown>> } }).footer
    const buttons = footer.contents.filter((c) => c.type === 'button')
    expect(buttons.length).toBe(1)
    const action = buttons[0].action as { label: string; uri: string }
    expect(action.label).toBe('ดูใน RateDesk')
    expect(buttons[0].style).toBe('primary')
    expect(buttons[0].color).toBe('#042C53')
  })

  it('omits the dashboard button entirely when no dashboardUrl is provided', () => {
    const env = buildHotelBriefFlexMessage(BASE)
    const footer = (env.contents as { footer: { contents: Array<Record<string, unknown>> } }).footer
    expect(footer.contents.filter((c) => c.type === 'button')).toHaveLength(0)
  })

  it('renders the awaiting-PMS note when provided, omits it otherwise', () => {
    const withNote = buildHotelBriefFlexMessage({
      ...BASE,
      dashboardUrl: 'https://example.test/ratedesk',
      awaitingPmsNote: 'Auto Push จะเริ่มทำงานเมื่อเชื่อมต่อ PMS',
    })
    expect(joinedText(withNote.contents)).toContain('Auto Push จะเริ่มทำงานเมื่อเชื่อมต่อ PMS')

    const withoutNote = buildHotelBriefFlexMessage({ ...BASE, dashboardUrl: 'https://example.test/ratedesk' })
    expect(joinedText(withoutNote.contents)).not.toContain('Auto Push จะเริ่มทำงานเมื่อเชื่อมต่อ PMS')
  })

  it('renders the "RateDesk by Aurasea" brand strip in the footer', () => {
    const env = buildHotelBriefFlexMessage(BASE)
    expect(joinedText(env.contents)).toContain('RateDesk by Aurasea')
  })

  // ── Role gating (canSeeRevenue) — discovery finding ────────────────────
  //
  // buildHotelBriefFlexMessage() takes no role parameter and never reads
  // HotelBriefData.yesterday.revenueThb — this bubble has never shown a
  // Total Revenue figure. ADR/RevPAR ARE shown to every recipient
  // (owner + manager) by product decision — canSeeRevenue() gates a
  // DIFFERENT artifact entirely (the raw Total Revenue number, shown
  // nowhere in this bubble). So an owner variant and a manager variant
  // of the same underlying data are byte-for-byte identical.
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
      competitorCallout: { name: 'Sima Thani', gapThb: 221, direction: 'higher' },
      dashboardUrl: 'https://example.test/ratedesk',
    }
    const ownerVariant = buildHotelBriefFlexMessage(richData)
    const managerVariant = buildHotelBriefFlexMessage(richData)
    expect(managerVariant).toEqual(ownerVariant)

    const texts = allText(ownerVariant.contents)
    expect(texts.join(' ')).not.toContain('30,410')
  })
})
