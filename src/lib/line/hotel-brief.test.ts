import { describe, it, expect } from 'vitest'
import { buildHotelBriefFlexMessage, type HotelBriefData } from './hotel-brief'
import type {
  HotelRecommendation,
  PerRoomTypeRate,
} from '@/lib/recommendations/hotel/engine'

function makePerRoomRate(partial: Partial<PerRoomTypeRate> = {}): PerRoomTypeRate {
  return {
    roomType: 'Deluxe',
    currentRateThb: 1000,
    suggestedRateThb: 1100,
    direction: 'increase',
    reasonTh: 'Occupancy 88% สูง — แนะนำขึ้น',
    reasonEn: '88% occupancy — suggest raise',
    impactThb: 100,
    ...partial,
  }
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

  it('renders all three KPI cards with rounded values', () => {
    const env = buildHotelBriefFlexMessage(BASE)
    const texts = allText(env.contents)
    expect(texts).toContain('Occupancy')
    expect(texts).toContain('42%')
    expect(texts).toContain('ADR')
    expect(texts).toContain('฿869')
    expect(texts).toContain('RevPAR')
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
    expect(texts).toContain('แนะนำราคาวันนี้')
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

  it('colors the occupancy KPI by threshold', () => {
    // pct >= 80 → green
    const high = buildHotelBriefFlexMessage({
      ...BASE,
      yesterday: { ...BASE.yesterday, occupancyRate: 0.9 },
    })
    // pct < 40 → red
    const low = buildHotelBriefFlexMessage({
      ...BASE,
      yesterday: { ...BASE.yesterday, occupancyRate: 0.2 },
    })
    // mid → purple
    const mid = buildHotelBriefFlexMessage({
      ...BASE,
      yesterday: { ...BASE.yesterday, occupancyRate: 0.5 },
    })
    const findOccColor = (env: ReturnType<typeof buildHotelBriefFlexMessage>): string => {
      const body = (env.contents as { body: { contents: Array<{ contents: Array<{ contents: Array<{ text: string; color?: string }> }> }> } }).body
      const kpiRow = body.contents[0]
      const occCard = kpiRow.contents[0]
      // Second child of the KPI card is the value Text with the
      // threshold-driven color attribute.
      return (occCard.contents[1] as { text: string; color: string }).color
    }
    expect(findOccColor(high)).toBe('#1D9E75')
    expect(findOccColor(low)).toBe('#DC2626')
    expect(findOccColor(mid)).toBe('#534AB7')
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
    expect(texts).toContain('แนะนำราคาวันนี้')
    expect(texts).toContain('Today')  // "Today's recommended rates"
    expect(texts).toContain('recommended rates')
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
    // Each carries its own rate transition (increase + decrease cases).
    expect(texts).toContain('฿950 → ฿1,045')
    expect(texts).toContain('฿850 → ฿799')
    expect(texts).toContain('฿1,200 → ฿1,320')
    // Hold case shows "คงเดิม" instead of an arrow.
    expect(texts).toContain('฿790 · คงเดิม')
    // No single blended ฿X anywhere.
    expect(texts).not.toContain('คืนนี้คาด')
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
    expect(texts).toContain('แนะนำราคาวันนี้')
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
})
