import { describe, it, expect } from 'vitest'
import { assessPlausibility, DEFAULT_PLAUSIBILITY_CONFIG } from './competitor-rate-plausibility'

describe('assessPlausibility — invalid rates always flag, regardless of reference data', () => {
  it('flags zero', () => {
    expect(assessPlausibility(0, [1200]).flagged).toBe(true)
  })
  it('flags negative', () => {
    expect(assessPlausibility(-500, [1200]).flagged).toBe(true)
  })
  it('flags NaN', () => {
    expect(assessPlausibility(NaN, [1200]).flagged).toBe(true)
  })
})

describe('assessPlausibility — no reference data means "can\'t assess", not flagged', () => {
  it('does not flag when referenceRates is empty', () => {
    const r = assessPlausibility(9999999, [])
    expect(r.flagged).toBe(false)
  })
  it('does not flag when every reference is invalid (0/negative/NaN)', () => {
    const r = assessPlausibility(1200, [0, -5, NaN])
    expect(r.flagged).toBe(false)
  })
})

describe('assessPlausibility — within range', () => {
  it('does not flag a rate close to the reference median', () => {
    const r = assessPlausibility(1250, [1200, 1180, 1220])
    expect(r.flagged).toBe(false)
  })
  it('does not flag a genuine promo dip within the default 0.2x-5x band', () => {
    const r = assessPlausibility(300, [1200]) // 25% of reference — inside the 20% floor
    expect(r.flagged).toBe(false)
  })
})

describe('assessPlausibility — out of range', () => {
  it('flags a rate far below the reference (e.g. a stray missing digit)', () => {
    const r = assessPlausibility(120, [1200]) // 10% of reference
    expect(r.flagged).toBe(true)
    expect(r.reasonEn).toContain('low')
  })
  it('flags a rate far above the reference (e.g. a vision model misreading 1,200 as 12,000)', () => {
    const r = assessPlausibility(12000, [1200])
    expect(r.flagged).toBe(true)
    expect(r.reasonEn).toContain('high')
  })
  it('uses the MEDIAN of multiple references, resistant to one outlier', () => {
    // Median of [1000, 1050, 1100, 9000] = 1075 — a rate near 1075
    // should NOT flag even though one reference (9000) is an outlier.
    const r = assessPlausibility(1080, [1000, 1050, 1100, 9000])
    expect(r.flagged).toBe(false)
  })
})

describe('assessPlausibility — custom config', () => {
  it('respects a tighter band when the caller supplies one', () => {
    const tight = { minRatio: 0.8, maxRatio: 1.2 }
    const r = assessPlausibility(1400, [1200], tight) // 116% — inside tight band
    expect(r.flagged).toBe(false)
    const r2 = assessPlausibility(1600, [1200], tight) // 133% — outside tight band
    expect(r2.flagged).toBe(true)
  })
  it('default config is exported and matches the documented 0.2/5 band', () => {
    expect(DEFAULT_PLAUSIBILITY_CONFIG).toEqual({ minRatio: 0.2, maxRatio: 5 })
  })
})
