import { describe, it, expect } from 'vitest'
import { summarizePerRoomRates, type PerRoomTypeRate } from './engine'

function makeRate(partial: Partial<PerRoomTypeRate> = {}): PerRoomTypeRate {
  return {
    roomType: 'Deluxe',
    currentRateThb: 1000,
    suggestedRateThb: 1000,
    currentRateSatang: 100000,
    suggestedRateSatang: 100000,
    direction: 'hold',
    reasonTh: '',
    reasonEn: '',
    impactThb: 0,
    ...partial,
  }
}

describe('summarizePerRoomRates — actionable insight line', () => {
  it('returns null for empty input', () => {
    expect(summarizePerRoomRates([])).toBeNull()
  })

  it('all decreases — soft demand → promo + OTA action', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Deluxe2', direction: 'decrease', suggestedRateThb: 893, impactThb: 57 }),
      makeRate({ roomType: 'Deluxe5', direction: 'decrease', suggestedRateThb: 743, impactThb: 47 }),
      makeRate({ roomType: 'Suite',   direction: 'decrease', suggestedRateThb: 1128, impactThb: 72 }),
    ]
    const out = summarizePerRoomRates(rates)
    expect(out).not.toBeNull()
    expect(out!.messageTh).toContain('ทุกห้องมีโอกาสจองต่ำ')
    expect(out!.messageTh).toContain('last-minute')
    expect(out!.messageEn).toContain('soft demand')
    expect(out!.messageEn).toContain('OTA')
  })

  it('Crystal Resort 4-decrease case (matches the screenshot)', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Deluxe2', direction: 'decrease', currentRateThb: 950,  suggestedRateThb: 893,  impactThb: 57 }),
      makeRate({ roomType: 'Deluxe5', direction: 'decrease', currentRateThb: 790,  suggestedRateThb: 743,  impactThb: 47 }),
      makeRate({ roomType: 'Deluxe6', direction: 'decrease', currentRateThb: 850,  suggestedRateThb: 799,  impactThb: 51 }),
      makeRate({ roomType: 'Suite',   direction: 'decrease', currentRateThb: 1200, suggestedRateThb: 1128, impactThb: 72 }),
    ]
    const out = summarizePerRoomRates(rates)
    expect(out).not.toBeNull()
    // The brief MUST carry an actionable line in this case (the
    // original bug — see screenshot).
    expect(out!.messageTh.length).toBeGreaterThan(20)
    expect(out!.messageEn.length).toBeGreaterThan(20)
  })

  it('all increases — hot demand → close discounts + weekend premium', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Suite',   direction: 'increase', impactThb: 120 }),
      makeRate({ roomType: 'Deluxe2', direction: 'increase', impactThb: 95 }),
    ]
    const out = summarizePerRoomRates(rates)
    expect(out!.messageTh).toContain('ดีมานด์สูงทุกห้อง')
    expect(out!.messageTh).toContain('ปิดส่วนลด')
    expect(out!.messageEn).toContain('High demand')
    expect(out!.messageEn).toContain('discount')
  })

  it('all holds — focus on channels + reviews', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Standard', direction: 'hold' }),
      makeRate({ roomType: 'Suite',    direction: 'hold' }),
    ]
    const out = summarizePerRoomRates(rates)
    expect(out!.messageTh).toContain('ราคาทุกห้องเหมาะสม')
    expect(out!.messageEn).toContain('All rates appropriate')
    expect(out!.messageEn).toContain('channels')
  })

  it('mixed: increases dominate → names the top-impact type to raise', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Suite',   direction: 'increase', impactThb: 200 }),
      makeRate({ roomType: 'Deluxe5', direction: 'increase', impactThb: 80 }),
      makeRate({ roomType: 'Deluxe6', direction: 'hold' }),
    ]
    const out = summarizePerRoomRates(rates)
    // Suite has the largest impact → it's the named type.
    expect(out!.messageTh.startsWith('Suite ')).toBe(true)
    expect(out!.messageEn.startsWith('Suite ')).toBe(true)
    expect(out!.messageEn).toContain('high demand')
  })

  it('mixed: decreases dominate → calls out the count needing a push', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Deluxe2', direction: 'decrease' }),
      makeRate({ roomType: 'Deluxe5', direction: 'decrease' }),
      makeRate({ roomType: 'Suite',   direction: 'hold' }),
    ]
    const out = summarizePerRoomRates(rates)
    expect(out!.messageTh).toContain('2 ประเภทห้อง')
    expect(out!.messageEn).toContain('2 room types')
    expect(out!.messageEn).toContain('last-minute')
  })

  it('mixed: equal split → tells the owner to manage by type', () => {
    const rates: PerRoomTypeRate[] = [
      makeRate({ roomType: 'Suite',   direction: 'increase', impactThb: 100 }),
      makeRate({ roomType: 'Deluxe2', direction: 'decrease', impactThb: 50 }),
    ]
    const out = summarizePerRoomRates(rates)
    expect(out!.messageTh).toContain('บริหารราคาตามประเภทห้อง')
    expect(out!.messageEn).toContain('manage rates by room type')
  })

  it('single hold-only row → still emits the all-holds action', () => {
    const rates: PerRoomTypeRate[] = [makeRate({ roomType: 'Standard', direction: 'hold' })]
    const out = summarizePerRoomRates(rates)
    expect(out).not.toBeNull()
    expect(out!.messageEn).toContain('All rates appropriate')
  })
})
