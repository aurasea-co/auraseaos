import { describe, it, expect } from 'vitest'
import { hasFeature, type HotelFeatureKey } from './plan-features'

const ALL_FEATURES: HotelFeatureKey[] = [
  'line_brief',
  'competitor_monitoring',
  'auto_push',
]

describe('hasFeature — by plan', () => {
  it('starter has only line_brief', () => {
    expect(hasFeature('starter', 'line_brief')).toBe(true)
    expect(hasFeature('starter', 'competitor_monitoring')).toBe(false)
    expect(hasFeature('starter', 'auto_push')).toBe(false)
  })

  it('growth has line_brief + competitor_monitoring (no auto_push)', () => {
    expect(hasFeature('growth', 'line_brief')).toBe(true)
    expect(hasFeature('growth', 'competitor_monitoring')).toBe(true)
    expect(hasFeature('growth', 'auto_push')).toBe(false)
  })

  it('pro has every hotel feature including auto_push', () => {
    for (const f of ALL_FEATURES) {
      expect(hasFeature('pro', f)).toBe(true)
    }
  })

  it('enterprise mirrors pro feature access', () => {
    for (const f of ALL_FEATURES) {
      expect(hasFeature('enterprise', f)).toBe(true)
    }
  })
})

describe('hasFeature — edge cases', () => {
  it('returns false for null plan (not throwing)', () => {
    expect(hasFeature(null, 'auto_push')).toBe(false)
    expect(hasFeature(null, 'line_brief')).toBe(false)
  })

  it('returns false for undefined plan', () => {
    expect(hasFeature(undefined, 'auto_push')).toBe(false)
  })

  it('returns false for unknown plan string', () => {
    // Defensive: a DB seed bug producing 'platinum' shouldn't 500.
    expect(hasFeature('platinum', 'line_brief')).toBe(false)
  })

  it('returns false for empty plan string', () => {
    expect(hasFeature('', 'line_brief')).toBe(false)
  })
})

describe('hasFeature — protects against tier regressions', () => {
  // These tests pin the business model: removing them requires a
  // conscious product decision, not an accident.
  it('auto_push is gated to pro+ (never starter or growth)', () => {
    expect(hasFeature('starter', 'auto_push')).toBe(false)
    expect(hasFeature('growth', 'auto_push')).toBe(false)
    expect(hasFeature('pro', 'auto_push')).toBe(true)
    expect(hasFeature('enterprise', 'auto_push')).toBe(true)
  })

  it('line_brief is available on every paid plan (the floor feature)', () => {
    expect(hasFeature('starter', 'line_brief')).toBe(true)
    expect(hasFeature('growth', 'line_brief')).toBe(true)
    expect(hasFeature('pro', 'line_brief')).toBe(true)
    expect(hasFeature('enterprise', 'line_brief')).toBe(true)
  })
})
