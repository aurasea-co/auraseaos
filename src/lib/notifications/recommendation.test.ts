import { describe, it, expect } from 'vitest'
import { pickVariantForDate } from './recommendation'

// pickVariantForDate is the core abstraction behind the morning-flash
// "never same wording two consecutive days" guarantee. The tests below
// pin three properties:
//   1. Idempotent per day (same date + same variants → same pick)
//   2. Adjacent days never collide (so an owner staring at the same
//      condition for a week sees a different angle each morning)
//   3. The rotation fully cycles through N variants over N days, then
//      repeats (so we don't accidentally favour a subset)

const D = (iso: string) => new Date(`${iso}T05:00:00Z`)

describe('pickVariantForDate', () => {
  it('is idempotent on the same date', () => {
    const variants = ['A', 'B', 'C']
    const day = D('2026-05-28')
    const first = pickVariantForDate(variants, day)
    const second = pickVariantForDate(variants, day)
    expect(first).toBe(second)
  })

  it('returns a different variant on consecutive days', () => {
    const variants = ['A', 'B', 'C']
    // Walk 30 consecutive days — every adjacent pair must differ.
    let prev = pickVariantForDate(variants, D('2026-01-01'))
    for (let i = 1; i < 30; i++) {
      const date = new Date(D('2026-01-01').getTime() + i * 86400000)
      const next = pickVariantForDate(variants, date)
      expect(next, `day ${i} matched day ${i - 1}: both were "${prev}"`).not.toBe(prev)
      prev = next
    }
  })

  it('fully cycles through N variants over N days', () => {
    const variants = ['A', 'B', 'C', 'D']
    const seen = new Set<string>()
    for (let i = 0; i < variants.length; i++) {
      const date = new Date(D('2026-03-01').getTime() + i * 86400000)
      seen.add(pickVariantForDate(variants, date))
    }
    expect(seen.size).toBe(variants.length)
  })

  it('handles a single-variant array', () => {
    expect(pickVariantForDate(['only'], D('2026-05-28'))).toBe('only')
    // Same answer for any other day — degenerate case, no rotation.
    expect(pickVariantForDate(['only'], D('2026-05-29'))).toBe('only')
  })

  it('preserves the same pick across the Bangkok day boundary', () => {
    // 19:00 UTC = 02:00 next-day Bangkok. Both should map to the same
    // Bangkok day-of-year, so the same variant. Anchor on a known wall
    // clock to make the assertion explicit.
    const noonBkk = new Date('2026-05-28T05:00:00Z') // 12:00 Bangkok
    const lateBkk = new Date('2026-05-28T16:30:00Z') // 23:30 Bangkok same day
    const variants = ['A', 'B', 'C', 'D', 'E']
    expect(pickVariantForDate(variants, noonBkk)).toBe(
      pickVariantForDate(variants, lateBkk),
    )
  })

  it('produces a different pick once Bangkok rolls past midnight', () => {
    // 23:30 UTC on 2026-05-28 = 06:30 Bangkok on 2026-05-29 — already
    // the next day in BKK. Should differ from 12:00 BKK on 2026-05-28.
    const noon28 = new Date('2026-05-28T05:00:00Z')
    const morning29 = new Date('2026-05-28T23:30:00Z')
    const variants = ['A', 'B', 'C', 'D', 'E']
    expect(pickVariantForDate(variants, noon28)).not.toBe(
      pickVariantForDate(variants, morning29),
    )
  })
})
