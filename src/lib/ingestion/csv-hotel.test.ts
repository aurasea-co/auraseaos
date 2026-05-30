import { describe, it, expect } from 'vitest'
import { parseHotelCsv } from './csv-hotel'

const HEADER = 'date,room_type,total_rooms,occupied_rooms,rate_thb'

describe('parseHotelCsv', () => {
  it('parses a single-row file into one CanonicalHotelDay', () => {
    const csv = `${HEADER}
2026-05-01,Deluxe,10,7,1500`
    const { days, errors, warnings } = parseHotelCsv(csv)
    expect(errors).toHaveLength(0)
    expect(warnings).toHaveLength(0)
    expect(days).toHaveLength(1)
    expect(days[0]).toEqual({
      date: '2026-05-01',
      roomTypeBreakdown: [
        { roomType: 'Deluxe', totalRooms: 10, occupiedRooms: 7, rateThb: 1500 },
      ],
      occupancyRate: 0.7,
      adrThb: 1500,
      revparThb: 1050,
      totalRevenueThb: 10500,
    })
  })

  it('aggregates multiple room types for the same date with weighted ADR', () => {
    // Deluxe: 10 rooms, 8 occupied at 2000
    // Standard: 20 rooms, 12 occupied at 1000
    // Aggregate: 30 rooms, 20 occupied
    // Total revenue = 8*2000 + 12*1000 = 16000 + 12000 = 28000
    // ADR = 28000 / 20 = 1400 (weighted)
    // Occupancy = 20/30 ≈ 0.6667
    // RevPAR ≈ 1400 * 0.6667 = 933.33
    const csv = `${HEADER}
2026-05-01,Deluxe,10,8,2000
2026-05-01,Standard,20,12,1000`
    const { days, errors } = parseHotelCsv(csv)
    expect(errors).toHaveLength(0)
    expect(days).toHaveLength(1)
    const [d] = days
    expect(d.totalRevenueThb).toBe(28000)
    expect(d.occupancyRate).toBeCloseTo(0.6667, 4)
    expect(d.adrThb).toBe(1400)
    expect(d.revparThb).toBeCloseTo(933.33, 1)
    expect(d.roomTypeBreakdown.map((r) => r.roomType)).toEqual(['Deluxe', 'Standard'])
  })

  it('splits multiple dates into separate days, newest first', () => {
    const csv = `${HEADER}
2026-05-01,Standard,10,5,1000
2026-05-03,Standard,10,9,1500
2026-05-02,Standard,10,7,1200`
    const { days } = parseHotelCsv(csv)
    expect(days.map((d) => d.date)).toEqual(['2026-05-03', '2026-05-02', '2026-05-01'])
  })

  it('defaults missing room_type to "Standard" with a warning', () => {
    const csv = `date,total_rooms,occupied_rooms,rate_thb
2026-05-01,10,5,1200`
    const { days, warnings } = parseHotelCsv(csv)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].code).toBe('missing_room_type')
    expect(days[0].roomTypeBreakdown[0].roomType).toBe('Standard')
  })

  it('skips rows where total_rooms is 0 with a warning', () => {
    const csv = `${HEADER}
2026-05-01,Suite,0,0,3000
2026-05-01,Deluxe,10,5,1500`
    const { days, warnings, errors } = parseHotelCsv(csv)
    expect(errors).toHaveLength(0)
    expect(warnings.map((w) => w.code)).toContain('zero_total_rooms')
    // Only Deluxe survives → revenue = 5*1500 = 7500
    expect(days[0].totalRevenueThb).toBe(7500)
    expect(days[0].roomTypeBreakdown).toHaveLength(1)
  })

  it('errors when occupied_rooms exceeds total_rooms', () => {
    const csv = `${HEADER}
2026-05-01,Suite,10,15,2000`
    const { errors, days } = parseHotelCsv(csv)
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('occupied_exceeds_total')
    expect(days).toHaveLength(0)
  })

  it('errors when a required column is missing', () => {
    const csv = `date,room_type,total_rooms,rate_thb
2026-05-01,Standard,10,1500`
    const { errors } = parseHotelCsv(csv)
    expect(errors.some((e) => e.code === 'missing_column')).toBe(true)
  })

  it('errors when the date format is genuinely unparseable', () => {
    const csv = `${HEADER}
not-a-date,Standard,10,5,1500`
    const { errors } = parseHotelCsv(csv)
    expect(errors[0].code).toBe('invalid_date')
    expect(errors[0].messageTh).toContain('not-a-date')
  })

  it('errors on a calendar-invalid date like 2026-02-30', () => {
    const csv = `${HEADER}
2026-02-30,Standard,10,5,1500`
    const { errors } = parseHotelCsv(csv)
    expect(errors[0].code).toBe('invalid_date')
  })

  it('accepts a Numbers/Excel datetime export ("YYYY-MM-DD HH:MM:SS")', () => {
    // Apple Numbers exports dates as a datetime even when only the
    // date is meaningful — strip the time silently so the import
    // doesn't fail at the first row.
    const csv = `${HEADER}
2026-05-27 00:00:00,Standard,10,5,1500`
    const { days, errors } = parseHotelCsv(csv)
    expect(errors).toHaveLength(0)
    expect(days).toHaveLength(1)
    expect(days[0].date).toBe('2026-05-27')
  })

  it('accepts a full ISO timestamp with Z suffix', () => {
    const csv = `${HEADER}
2026-05-27T00:00:00Z,Standard,10,5,1500`
    const { days, errors } = parseHotelCsv(csv)
    expect(errors).toHaveLength(0)
    expect(days[0].date).toBe('2026-05-27')
  })

  it('accepts Thai DMY slash format ("DD/MM/YYYY")', () => {
    // 27/05/2026 → 2026-05-27. Day=27 disambiguates as DMY because
    // 27 > 12 so it can't be a month.
    const csv = `${HEADER}
27/05/2026,Standard,10,5,1500`
    const { days, errors } = parseHotelCsv(csv)
    expect(errors).toHaveLength(0)
    expect(days[0].date).toBe('2026-05-27')
  })

  it('disambiguates US MDY when the first component is > 12', () => {
    // 05/27/2026 → first=5 (month), second=27 (day, must be day
    // because >12) → 2026-05-27.
    const csv = `${HEADER}
05/27/2026,Standard,10,5,1500`
    const { days, errors } = parseHotelCsv(csv)
    expect(errors).toHaveLength(0)
    expect(days[0].date).toBe('2026-05-27')
  })

  it('defaults ambiguous slash dates to DMY (Thai convention)', () => {
    // 5/7/2026 → both components ≤ 12 → DMY → 2026-07-05.
    const csv = `${HEADER}
5/7/2026,Standard,10,5,1500`
    const { days, errors } = parseHotelCsv(csv)
    expect(errors).toHaveLength(0)
    expect(days[0].date).toBe('2026-07-05')
  })

  it('errors on an empty or header-only file', () => {
    expect(parseHotelCsv('').errors[0].code).toBe('empty_file')
    expect(parseHotelCsv(HEADER).errors[0].code).toBe('empty_file')
  })

  it('allows future dates but warns', () => {
    // 100 years in the future is unambiguously past today.
    const csv = `${HEADER}
2126-01-01,Standard,10,5,1500`
    const { days, warnings, errors } = parseHotelCsv(csv)
    expect(errors).toHaveLength(0)
    expect(days).toHaveLength(1)
    expect(warnings.some((w) => w.code === 'future_date')).toBe(true)
  })

  it('accepts comma thousand-separators in numeric cells', () => {
    const csv = `${HEADER}
2026-05-01,Standard,"1,000","500","1,200"`
    const { days, errors } = parseHotelCsv(csv)
    expect(errors).toHaveLength(0)
    expect(days[0].totalRevenueThb).toBe(600_000)
  })

  it('merges duplicate room_type rows for the same date with a warning', () => {
    // Same room_type twice for the same date — sum totals + occupied,
    // recompute weighted rate.
    const csv = `${HEADER}
2026-05-01,Standard,10,5,1000
2026-05-01,Standard,5,3,1500`
    const { days, warnings } = parseHotelCsv(csv)
    expect(warnings.some((w) => w.code === 'duplicate_room_type')).toBe(true)
    const r = days[0].roomTypeBreakdown[0]
    expect(r.totalRooms).toBe(15)
    expect(r.occupiedRooms).toBe(8)
    // Weighted: (1000*5 + 1500*3) / 8 = 9500/8 = 1187.5
    expect(r.rateThb).toBeCloseTo(1187.5)
  })

  it('header column order is flexible (case-insensitive)', () => {
    const csv = `RATE_THB,DATE,OCCUPIED_ROOMS,TOTAL_ROOMS,ROOM_TYPE
2000,2026-05-01,7,10,Deluxe`
    const { days, errors } = parseHotelCsv(csv)
    expect(errors).toHaveLength(0)
    expect(days[0].totalRevenueThb).toBe(14000)
    expect(days[0].roomTypeBreakdown[0].roomType).toBe('Deluxe')
  })
})
