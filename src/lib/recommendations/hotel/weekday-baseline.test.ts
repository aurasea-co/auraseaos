import { describe, it, expect } from 'vitest'
import {
  computeWeekdayBaseline,
  recommendPerRoomTypeRates,
  summarizePerRoomRates,
  type RecommendationInput,
} from './engine'

// Weekday-pattern baseline (computeWeekdayBaseline) + its narrative
// consumers. The baseline is text/insight only — these tests also pin
// the scope guarantee that it never changes suggested rates, direction,
// or which room types appear on the sheet.

// day('2026-07-03', …) — 2026-07-03 is a Friday; convenient anchors:
//   Fridays: 06-12, 06-19, 06-26, 07-03   Thursdays: 06-11, …, 07-09
function day(
  date: string,
  occ: number,
  adr = 1000,
  breakdown?: RecommendationInput['roomTypeBreakdown'],
): RecommendationInput {
  return { date, occupancyRate: occ, adrThb: adr, ...(breakdown ? { roomTypeBreakdown: breakdown } : {}) }
}

// Consecutive daily inputs ending at `endDate`, occupancy from a lookup
// by UTC day-of-week (0=Sun..6=Sat).
function seriesEndingAt(endDate: string, count: number, occByDow: number[]): RecommendationInput[] {
  const out: RecommendationInput[] = []
  const end = new Date(`${endDate}T00:00:00Z`)
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(end)
    d.setUTCDate(d.getUTCDate() - i)
    const iso = d.toISOString().slice(0, 10)
    out.push(day(iso, occByDow[d.getUTCDay()]))
  }
  return out
}

describe('computeWeekdayBaseline', () => {
  it('returns the same-weekday MEDIAN with >=3 samples (spike-resistant)', () => {
    // Four Fridays: 0.80, 0.84, 0.86, and one 0.10 outlier. Median of
    // [0.10, 0.80, 0.84, 0.86] = 0.82 — a mean would be dragged to 0.65.
    const days = [
      day('2026-06-12', 0.10),
      day('2026-06-19', 0.80),
      day('2026-06-26', 0.84),
      day('2026-07-03', 0.86),
      day('2026-07-05', 0.30), // Sunday noise — must not contaminate
    ]
    const b = computeWeekdayBaseline(days, '2026-07-10') // a Friday
    expect(b.insufficient).toBe(false)
    expect(b.source).toBe('weekday')
    expect(b.sampleCount).toBe(4)
    expect(b.occupancyMedian).toBeCloseTo(0.82, 5)
  })

  it('falls back to the all-day median when the weekday has <3 samples', () => {
    const days = [
      day('2026-07-03', 0.80), // the only Friday
      day('2026-07-06', 0.40),
      day('2026-07-07', 0.50),
      day('2026-07-08', 0.60),
    ]
    const b = computeWeekdayBaseline(days, '2026-07-10')
    expect(b.insufficient).toBe(false)
    expect(b.source).toBe('all_day')
    expect(b.sampleCount).toBe(4)
    expect(b.occupancyMedian).toBeCloseTo(0.55, 5) // median of .4 .5 .6 .8
  })

  it('reports insufficient (and fabricates nothing) below 3 all-day samples', () => {
    const b = computeWeekdayBaseline([day('2026-07-08', 0.5), day('2026-07-09', 0.6)], '2026-07-10')
    expect(b).toEqual({ insufficient: true, sampleCount: 0 })
  })

  it('excludes the target date from its own baseline', () => {
    const days = [
      day('2026-06-19', 0.80),
      day('2026-06-26', 0.80),
      day('2026-07-03', 0.80),
      day('2026-07-10', 0.10), // target itself — must not contaminate
    ]
    const b = computeWeekdayBaseline(days, '2026-07-10')
    expect(b.occupancyMedian).toBeCloseTo(0.80, 5)
    expect(b.sampleCount).toBe(3)
  })

  it('scopes per-room-type samples to that type and medians its rate for display', () => {
    const bd = (occupied: number, rate: number) => [
      { roomType: 'Deluxe', totalRooms: 10, occupiedRooms: occupied, rateThb: rate },
      { roomType: 'Suite', totalRooms: 2, occupiedRooms: 2, rateThb: 4000 },
    ]
    const days = [
      day('2026-06-19', 0.9, 1000, bd(6, 1200)),
      day('2026-06-26', 0.9, 1000, bd(7, 1300)),
      day('2026-07-03', 0.9, 1000, bd(8, 1250)),
    ]
    const b = computeWeekdayBaseline(days, '2026-07-10', 'Deluxe')
    expect(b.source).toBe('weekday')
    expect(b.occupancyMedian).toBeCloseTo(0.7, 5)
    expect(b.rateThbMedian).toBe(1250)
  })
})

describe('per-room reason enrichment', () => {
  // 22 consecutive days ending Thu 2026-07-09 → rec target night is
  // Fri 2026-07-10, and the window holds 3 Fridays. 'Deluxe' has a
  // breakdown row every day; 'Suite' only on the last 2 days (thin).
  const days: RecommendationInput[] = seriesEndingAt('2026-07-09', 22, [0.5, 0.5, 0.5, 0.5, 0.5, 0.8, 0.8]).map(
    (d, i, arr) => ({
      ...d,
      roomTypeBreakdown: [
        { roomType: 'Deluxe', totalRooms: 10, occupiedRooms: 5, rateThb: 1200 },
        ...(i >= arr.length - 2
          ? [{ roomType: 'Suite', totalRooms: 2, occupiedRooms: 1, rateThb: 4000 }]
          : []),
      ],
    }),
  )

  it('cites a matched-weekday comparison (latest day vs its OWN weekday norm)', () => {
    // Latest data day is Thu 2026-07-09 at 50%; prior Thursdays (06-18,
    // 06-25, 07-02) all 50% → norm 50% (n=3, latest day excluded).
    const rows = recommendPerRoomTypeRates(days)
    const deluxe = rows.find((r) => r.roomType === 'Deluxe')!
    expect(deluxe.reasonEn).toContain('Thu 50% vs Thu norm 50% (n=3) → near norm')
    expect(deluxe.reasonTh).toContain('พฤหัสฯนี้ 50% · ปกติพฤหัสฯ 50% (n=3) → ใกล้เคียงปกติ')
    // Like-for-like scope: no 3-day figure sits in the same sentence.
    expect(deluxe.reasonEn).not.toMatch(/\d+% occupancy/)
  })

  it('keeps thin types (Suite) on the sheet with plain copy — no fabricated norm', () => {
    const rows = recommendPerRoomTypeRates(days)
    const suite = rows.find((r) => r.roomType === 'Suite')
    expect(suite).toBeDefined()
    expect(suite!.reasonEn).not.toContain('norm')
    // Direct check of the fallback ladder for the thin type: 2 samples
    // on any day → insufficient, never a fabricated baseline.
    const b = computeWeekdayBaseline(days, '2026-07-10', 'Suite')
    expect(b.insufficient).toBe(true)
  })

  it('does not alter satang values or direction (text-only scope)', () => {
    const rows = recommendPerRoomTypeRates(days)
    const deluxe = rows.find((r) => r.roomType === 'Deluxe')!
    // 50% occupancy → comfortable band → hold at the 1200 baseline.
    expect(deluxe.direction).toBe('hold')
    expect(deluxe.currentRateSatang).toBe(120000)
    expect(deluxe.suggestedRateSatang).toBe(120000)
  })
})

describe('daily action weekday narrative', () => {
  it('anchors the line on the weekday norm when history supports it', () => {
    // 29 days ending Sat 2026-07-04: Saturdays normally 0.88, but the
    // final Saturday limps at 0.62.
    const inputs = seriesEndingAt('2026-07-04', 29, [0.5, 0.5, 0.5, 0.5, 0.5, 0.7, 0.88])
    inputs[inputs.length - 1] = day('2026-07-04', 0.62)
    const rates = recommendPerRoomTypeRates(inputs.map((d) => ({
      ...d,
      roomTypeBreakdown: [{ roomType: 'Deluxe', totalRooms: 10, occupiedRooms: Math.round(d.occupancyRate * 10), rateThb: 1200 }],
    })))
    const action = summarizePerRoomRates(rates, { inputs })!
    expect(action.messageEn).toContain('Sat norm 88%, today 62% — 26pts below norm')
    expect(action.messageTh).toContain('วันเสาร์ปกติ 88% วันนี้ 62% ต่ำกว่าปกติ 26pts')
  })

  it('falls back to the plain occ% wording with thin history', () => {
    const inputs = [day('2026-07-02', 0.6), day('2026-07-03', 0.6), day('2026-07-04', 0.62)]
    const rates = recommendPerRoomTypeRates(inputs.map((d) => ({
      ...d,
      roomTypeBreakdown: [{ roomType: 'Deluxe', totalRooms: 10, occupiedRooms: 6, rateThb: 1200 }],
    })))
    const action = summarizePerRoomRates(rates, { inputs })!
    expect(action.messageEn).toContain('(occ 62%')
    expect(action.messageEn).not.toContain('norm')
  })
})
