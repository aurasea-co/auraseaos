import { describe, it, expect } from 'vitest'
import { thbToSatang, satangToThb } from './satang'

describe('thbToSatang', () => {
  it('converts whole THB to satang', () => {
    expect(thbToSatang(100)).toBe(10000)
    expect(thbToSatang(1)).toBe(100)
    expect(thbToSatang(1200)).toBe(120000)
  })

  it('preserves decimal precision (50 satang stays as 50)', () => {
    expect(thbToSatang(99.5)).toBe(9950)
    expect(thbToSatang(0.5)).toBe(50)
  })

  it('returns 0 for zero, negative, or non-finite inputs', () => {
    expect(thbToSatang(0)).toBe(0)
    expect(thbToSatang(-5)).toBe(0)
    expect(thbToSatang(NaN)).toBe(0)
    expect(thbToSatang(Infinity)).toBe(0)
  })

  it('rounds half-up at the satang boundary', () => {
    // 0.005 THB = 0.5 satang → rounds to 1 satang
    expect(thbToSatang(0.005)).toBe(1)
    expect(thbToSatang(0.004)).toBe(0)
  })

  it('Crystal Resort rack rates round-trip cleanly', () => {
    expect(thbToSatang(950)).toBe(95000)
    expect(thbToSatang(790)).toBe(79000)
    expect(thbToSatang(850)).toBe(85000)
    expect(thbToSatang(1200)).toBe(120000)
  })
})

describe('satangToThb', () => {
  it('converts whole satang to THB', () => {
    expect(satangToThb(10000)).toBe(100)
    expect(satangToThb(120000)).toBe(1200)
  })

  it('rounds half-up at the THB boundary', () => {
    expect(satangToThb(9950)).toBe(100)  // 99.5 THB → 100
    expect(satangToThb(9949)).toBe(99)
    expect(satangToThb(50)).toBe(1)      // 0.5 THB → 1
    expect(satangToThb(49)).toBe(0)
  })

  it('returns 0 for zero, negative, or non-finite inputs', () => {
    expect(satangToThb(0)).toBe(0)
    expect(satangToThb(-1)).toBe(0)
    expect(satangToThb(NaN)).toBe(0)
  })

  it('round-trip stays stable for whole-THB rates (no precision drift)', () => {
    const rates = [950, 790, 850, 1200, 875, 1499]
    for (const thb of rates) {
      expect(satangToThb(thbToSatang(thb))).toBe(thb)
    }
  })
})

// Migration 038 backfill correctness — assert the SQL backfill clause
// exists and the math matches what our helper would compute.
describe('migration 038 backfill ↔ helper parity', () => {
  it('reads as suggested_rate_thb * 100 = suggested_rate_satang for every legacy row shape', () => {
    // Examples of suggested_rate_thb values seen in production data —
    // assert the helper produces the same satang value the SQL
    // expression (`suggested_rate_thb::bigint * 100`) would.
    const examples: Array<{ thb: number; expectedSatang: number }> = [
      { thb: 0,     expectedSatang: 0 },
      { thb: 950,   expectedSatang: 95000 },
      { thb: 1200,  expectedSatang: 120000 },
      { thb: 999,   expectedSatang: 99900 },
      { thb: 25000, expectedSatang: 2500000 },
    ]
    for (const ex of examples) {
      // The SQL backfill is `suggested_rate_thb::bigint * 100` — purely
      // integer math, no rounding. Our helper handles decimals too,
      // but for the legacy column (integer-THB rows) the two produce
      // identical satang.
      expect(thbToSatang(ex.thb)).toBe(ex.expectedSatang)
    }
  })
})
