import { describe, it, expect } from 'vitest'
import { buildHotelBriefFlexMessage, type HotelBriefData } from './hotel-brief'
import type { HotelRecommendation } from '@/lib/recommendations/hotel/engine'

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

  it('renders the forecast strip with expected occupancy + suggested rate when present', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      forecast: { expectedOccupancy: 0.78, suggestedRateThb: 912 },
    })
    const texts = allText(env.contents).join(' ')
    expect(texts).toContain('คืนนี้คาด')
    expect(texts).toContain('Occupancy 78%')
    expect(texts).toContain('฿912')
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

  // ── Multi-room bubble: rooms-to-adjust panel + approve-all button ─────

  it('renders per-room rate signals in the rooms-to-adjust panel for multi-room hotels', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      hasMultipleRoomTypes: true,
      topRecs: [
        makeRec({
          roomType: 'Suite',
          currentRateThb: 1200,
          suggestedRateThb: 1080,
          type: 'rate_decrease',
        }),
        makeRec({
          roomType: 'Deluxe5',
          currentRateThb: 950,
          suggestedRateThb: 998,
          type: 'rate_increase',
        }),
      ],
    })
    const texts = allText(env.contents).join(' ')
    expect(texts).toContain('ห้องที่ควรปรับราคา')
    expect(texts).toContain('Suite: ฿1,200 → ฿1,080')
    expect(texts).toContain('Deluxe5: ฿950 → ฿998')
    // Single blended forecast strip must NOT appear when per-room is shown.
    expect(texts).not.toContain('คืนนี้คาด')
  })

  it('shows the approve button on MULTI-ROOM bubbles when caller passes one (set-wide approval)', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      hasMultipleRoomTypes: true,
      topRecs: [
        makeRec({ roomType: 'Suite', currentRateThb: 1200, suggestedRateThb: 1080, type: 'rate_decrease' }),
        makeRec({ roomType: 'Deluxe5', currentRateThb: 950, suggestedRateThb: 998, type: 'rate_increase' }),
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

  it('renders rich Flex (KPIs + per-room moves) WITHOUT approve button when plan-paid but no live PMS', () => {
    // Crystal Resort: Pro plan (could approve), no Cloudbeds connected
    // → no approveButton, dashboardUrl present, awaitingPmsNote present.
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      hasMultipleRoomTypes: true,
      topRecs: [
        makeRec({ roomType: 'Suite', currentRateThb: 1200, suggestedRateThb: 1080, type: 'rate_decrease' }),
      ],
      dashboardUrl: 'https://example.test/ratedesk',
      awaitingPmsNote: 'Auto Push จะเริ่มทำงานเมื่อเชื่อมต่อ PMS',
    })
    const texts = allText(env.contents).join(' ')
    // Body still rich.
    expect(texts).toContain('Occupancy')
    expect(texts).toContain('Suite: ฿1,200 → ฿1,080')
    // Footer carries the review-only path.
    const footer = (env.contents as { footer: { contents: Array<Record<string, unknown>> } }).footer
    const buttonActions = footer.contents
      .filter((c) => c.type === 'button')
      .map((c) => (c.action as { label: string }))
    expect(buttonActions.length).toBe(1)
    expect(buttonActions[0].label).toBe('ดูใน RateDesk')
    // Awaiting note rendered.
    expect(texts).toContain('Auto Push จะเริ่มทำงานเมื่อเชื่อมต่อ PMS')
  })

  it('omits awaiting-PMS note when not provided', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      dashboardUrl: 'https://example.test/ratedesk',
    })
    const texts = allText(env.contents).join(' ')
    expect(texts).not.toContain('Auto Push จะเริ่มทำงานเมื่อเชื่อมต่อ PMS')
  })

  it('shows "all room rates are appropriate" when multi-room but no per-room rec fired', () => {
    const env = buildHotelBriefFlexMessage({
      ...BASE,
      hasMultipleRoomTypes: true,
      topRecs: [],  // no per-room recs
    })
    const texts = allText(env.contents).join(' ')
    expect(texts).toContain('ราคาทุกประเภทห้องเหมาะสม')
  })
})
