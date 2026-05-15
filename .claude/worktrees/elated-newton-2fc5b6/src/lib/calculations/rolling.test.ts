import { describe, it, expect } from 'vitest'
import { rollingAvg } from './rolling'

describe('rollingAvg', () => {
  it('returns null when the window has fewer than minSamples real values', () => {
    const entries = [
      { date: '2026-04-18', value: 20 },
      { date: '2026-04-19', value: 30 },
    ]
    // 7-day window with default minSamples=4 → only 2 points in range
    expect(rollingAvg(entries, '2026-04-20', 7)).toBeNull()
  })

  it('averages only real values within the window (skips missing days)', () => {
    const entries = [
      { date: '2026-04-14', value: 10 },
      { date: '2026-04-15', value: null }, // missing
      { date: '2026-04-16', value: 20 },
      { date: '2026-04-17', value: null }, // missing
      { date: '2026-04-18', value: 30 },
      { date: '2026-04-19', value: null }, // missing
      { date: '2026-04-20', value: 40 },
    ]
    // 4 real values — exactly at default minSamples for a 7-day window
    const avg = rollingAvg(entries, '2026-04-20', 7)
    expect(avg).not.toBeNull()
    // (10+20+30+40)/4 = 25
    expect(avg).toBeCloseTo(25, 6)
  })

  it('does not zero-fill missing days (the fix for the spiky chart)', () => {
    const entries = [
      { date: '2026-04-14', value: 25 },
      { date: '2026-04-15', value: 25 },
      { date: '2026-04-16', value: 25 },
      { date: '2026-04-17', value: 25 },
      // 3 missing days — if zero-filled the avg would be 25*4/7 ≈ 14.3
    ]
    const avg = rollingAvg(entries, '2026-04-20', 7)
    expect(avg).toBeCloseTo(25, 6)
  })

  it('treats all-zero days as real (zero is a valid margin reading)', () => {
    const entries = [
      { date: '2026-04-14', value: 0 },
      { date: '2026-04-15', value: 0 },
      { date: '2026-04-16', value: 0 },
      { date: '2026-04-17', value: 0 },
      { date: '2026-04-18', value: 0 },
      { date: '2026-04-19', value: 0 },
      { date: '2026-04-20', value: 0 },
    ]
    expect(rollingAvg(entries, '2026-04-20', 7)).toBe(0)
  })

  it('excludes entries outside the window', () => {
    const entries = [
      // All before the 7-day window ending 2026-04-20 (window = 04-14..04-20)
      { date: '2026-04-01', value: 999 },
      { date: '2026-04-02', value: 999 },
      { date: '2026-04-14', value: 10 },
      { date: '2026-04-15', value: 20 },
      { date: '2026-04-16', value: 30 },
      { date: '2026-04-17', value: 40 },
    ]
    const avg = rollingAvg(entries, '2026-04-20', 7)
    // Only the 4 in-window values count: (10+20+30+40)/4 = 25
    expect(avg).toBeCloseTo(25, 6)
  })

  it('supports a 14-day window with the stricter minSamples default', () => {
    // Default minSamples = ceil(14/2) = 7
    const fewEntries = Array.from({ length: 6 }, (_, i) => ({
      date: `2026-04-${String(10 + i).padStart(2, '0')}`,
      value: 20,
    }))
    expect(rollingAvg(fewEntries, '2026-04-20', 14)).toBeNull()

    const enoughEntries = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-04-${String(10 + i).padStart(2, '0')}`,
      value: 20,
    }))
    expect(rollingAvg(enoughEntries, '2026-04-20', 14)).toBeCloseTo(20, 6)
  })

  it('honours an explicit minSamples override', () => {
    const entries = [
      { date: '2026-04-19', value: 50 },
      { date: '2026-04-20', value: 50 },
    ]
    // Default minSamples would reject (4 > 2), but override allows it
    expect(rollingAvg(entries, '2026-04-20', 7, 2)).toBeCloseTo(50, 6)
  })

  it('returns null when given an empty array', () => {
    expect(rollingAvg([], '2026-04-20', 7)).toBeNull()
  })

  it('regression — callers must normalise UTC-timestamp dates first', () => {
    // Issue 2: the branch_daily_metrics view returns metric_date as a
    // UTC timestamp ("…T17:00:00+00:00" = midnight Bangkok next day).
    // `rollingAvg` does pure string comparison on YYYY-MM-DD, so passing
    // timestamps silently produces no window matches and the chart is
    // empty. The fix lives in the caller (FnbTrendsView normalises via
    // toBangkokDateStr once); this test documents the contract.
    const timestampEntries = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-04-${String(13 + i).padStart(2, '0')}T17:00:00+00:00`,
      value: 25,
    }))
    // With timestamp dates: no entry matches the plain-date window → null.
    expect(
      rollingAvg(timestampEntries, '2026-04-19T17:00:00+00:00', 7),
    ).toBeNull()

    // After normalising (what the Trends view now does): 7 in-window → avg.
    const normalised = timestampEntries.map((e) => ({
      ...e,
      date: e.date.substring(0, 10), // same shape as toBangkokDateStr output
    }))
    expect(rollingAvg(normalised, '2026-04-19', 7)).toBeCloseTo(25, 6)
  })
})
