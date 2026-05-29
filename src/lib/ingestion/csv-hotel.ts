import type {
  CanonicalHotelDay,
  IngestionError,
  IngestionParseResult,
  IngestionWarning,
  RoomTypeOccupancy,
} from './types'

// CSV → CanonicalHotelDay[] for hotel batch import.
//
// Expected columns (case-insensitive, order-flexible):
//   date         YYYY-MM-DD
//   room_type    e.g. "Deluxe" (optional → defaults to "Standard")
//   total_rooms  positive integer
//   occupied_rooms non-negative integer ≤ total_rooms
//   rate_thb     non-negative number (THB; no satang)
//
// Multiple rows per date (one per room type) aggregate into a single
// CanonicalHotelDay. The API route consumes the returned days array
// and writes one accommodation_daily_metrics row per date.

const REQUIRED_COLS = ['date', 'total_rooms', 'occupied_rooms', 'rate_thb'] as const
const ALL_COLS = [...REQUIRED_COLS, 'room_type'] as const
type ColName = (typeof ALL_COLS)[number]

interface ParsedRow {
  row: number
  date: string
  roomType: string
  totalRooms: number
  occupiedRooms: number
  rateThb: number
}

export function parseHotelCsv(input: string): IngestionParseResult {
  const warnings: IngestionWarning[] = []
  const errors: IngestionError[] = []

  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length < 2) {
    errors.push({
      row: 0,
      code: 'empty_file',
      messageTh: 'ไฟล์ CSV ว่าง หรือมีเฉพาะหัวคอลัมน์',
      messageEn: 'CSV is empty or contains only the header row',
    })
    return { days: [], warnings, errors }
  }

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().trim())
  const colIndex: Partial<Record<ColName, number>> = {}
  for (const col of ALL_COLS) {
    const idx = header.indexOf(col)
    if (idx >= 0) colIndex[col] = idx
  }
  for (const col of REQUIRED_COLS) {
    if (colIndex[col] === undefined) {
      errors.push({
        row: 1,
        code: 'missing_column',
        messageTh: `ไม่พบคอลัมน์ "${col}" ในไฟล์ CSV`,
        messageEn: `Missing required column "${col}" in CSV header`,
      })
    }
  }
  if (errors.length > 0) return { days: [], warnings, errors }

  // Today in Bangkok — used to warn on future dates without rejecting.
  const todayBkk = bkkDateString(new Date())

  const parsedRows: ParsedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1
    const cells = splitCsvLine(lines[i])

    const date = (cells[colIndex.date!] || '').trim()
    if (!isIsoDate(date)) {
      errors.push({
        row: rowNum,
        code: 'invalid_date',
        messageTh: `บรรทัด ${rowNum}: รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)`,
        messageEn: `Row ${rowNum}: invalid date format (expected YYYY-MM-DD)`,
      })
      continue
    }
    if (date > todayBkk) {
      warnings.push({
        row: rowNum,
        code: 'future_date',
        messageTh: `บรรทัด ${rowNum}: วันที่อยู่ในอนาคต`,
        messageEn: `Row ${rowNum}: date is in the future`,
      })
    }

    const totalRoomsRaw = (cells[colIndex.total_rooms!] || '').trim()
    const occupiedRaw = (cells[colIndex.occupied_rooms!] || '').trim()
    const rateRaw = (cells[colIndex.rate_thb!] || '').trim()

    const totalRooms = toNonNegativeNumber(totalRoomsRaw)
    const occupiedRooms = toNonNegativeNumber(occupiedRaw)
    const rateThb = toNonNegativeNumber(rateRaw)

    if (totalRooms === null || occupiedRooms === null || rateThb === null) {
      errors.push({
        row: rowNum,
        code: 'invalid_number',
        messageTh: `บรรทัด ${rowNum}: ค่าตัวเลขไม่ถูกต้อง (total_rooms, occupied_rooms หรือ rate_thb)`,
        messageEn: `Row ${rowNum}: invalid number in total_rooms, occupied_rooms, or rate_thb`,
      })
      continue
    }
    if (totalRooms === 0) {
      warnings.push({
        row: rowNum,
        code: 'zero_total_rooms',
        messageTh: `บรรทัด ${rowNum}: total_rooms = 0 — ข้ามบรรทัดนี้`,
        messageEn: `Row ${rowNum}: total_rooms is 0 — skipping`,
      })
      continue
    }
    if (occupiedRooms > totalRooms) {
      errors.push({
        row: rowNum,
        code: 'occupied_exceeds_total',
        messageTh: `บรรทัด ${rowNum}: occupied_rooms (${occupiedRooms}) เกิน total_rooms (${totalRooms})`,
        messageEn: `Row ${rowNum}: occupied_rooms (${occupiedRooms}) exceeds total_rooms (${totalRooms})`,
      })
      continue
    }

    let roomType =
      colIndex.room_type !== undefined ? (cells[colIndex.room_type!] || '').trim() : ''
    if (!roomType) {
      roomType = 'Standard'
      warnings.push({
        row: rowNum,
        code: 'missing_room_type',
        messageTh: `บรรทัด ${rowNum}: ไม่ระบุ room_type — ใช้ "Standard" แทน`,
        messageEn: `Row ${rowNum}: missing room_type — defaulted to "Standard"`,
      })
    }

    parsedRows.push({ row: rowNum, date, roomType, totalRooms, occupiedRooms, rateThb })
  }

  if (errors.length > 0) return { days: [], warnings, errors }

  const days = aggregateByDate(parsedRows, warnings)
  return { days, warnings, errors }
}

// Group parsed rows by date, merging duplicate room_type entries
// per date (sum totals + occupied, recompute weighted rate) and
// emitting a warning when this happens.
function aggregateByDate(rows: ParsedRow[], warnings: IngestionWarning[]): CanonicalHotelDay[] {
  const byDate = new Map<string, ParsedRow[]>()
  for (const r of rows) {
    const arr = byDate.get(r.date) || []
    arr.push(r)
    byDate.set(r.date, arr)
  }

  const days: CanonicalHotelDay[] = []
  for (const [date, dateRows] of Array.from(byDate.entries())) {
    const breakdownByType = new Map<string, RoomTypeOccupancy>()
    for (const r of dateRows) {
      const existing = breakdownByType.get(r.roomType)
      if (existing) {
        warnings.push({
          row: r.row,
          code: 'duplicate_room_type',
          messageTh: `บรรทัด ${r.row}: room_type "${r.roomType}" ปรากฏซ้ำในวันที่ ${date} — รวมเข้าด้วยกัน`,
          messageEn: `Row ${r.row}: room_type "${r.roomType}" appears twice for date ${date} — merged`,
        })
        const mergedOccupied = existing.occupiedRooms + r.occupiedRooms
        // Weighted average rate by occupiedRooms; falls back to
        // simple mean when neither side has occupancy.
        const totalOccupied = mergedOccupied
        existing.rateThb = totalOccupied > 0
          ? (existing.rateThb * existing.occupiedRooms + r.rateThb * r.occupiedRooms) /
            totalOccupied
          : (existing.rateThb + r.rateThb) / 2
        existing.totalRooms += r.totalRooms
        existing.occupiedRooms = mergedOccupied
      } else {
        breakdownByType.set(r.roomType, {
          roomType: r.roomType,
          totalRooms: r.totalRooms,
          occupiedRooms: r.occupiedRooms,
          rateThb: r.rateThb,
        })
      }
    }

    const breakdown = Array.from(breakdownByType.values()).sort((a, b) =>
      a.roomType.localeCompare(b.roomType),
    )

    const totalRooms = breakdown.reduce((acc, b) => acc + b.totalRooms, 0)
    const totalOccupied = breakdown.reduce((acc, b) => acc + b.occupiedRooms, 0)
    const totalRevenueThb = breakdown.reduce(
      (acc, b) => acc + b.rateThb * b.occupiedRooms,
      0,
    )
    const occupancyRate = totalRooms > 0 ? totalOccupied / totalRooms : 0
    const adrThb = totalOccupied > 0 ? totalRevenueThb / totalOccupied : 0
    const revparThb = adrThb * occupancyRate

    days.push({
      date,
      roomTypeBreakdown: breakdown,
      occupancyRate: round4(occupancyRate),
      adrThb: round2(adrThb),
      revparThb: round2(revparThb),
      totalRevenueThb: round2(totalRevenueThb),
    })
  }

  // Newest-first for the preview UI.
  days.sort((a, b) => b.date.localeCompare(a.date))
  return days
}

// ---- helpers ----------------------------------------------------------------

function splitCsvLine(line: string): string[] {
  // Minimal CSV split: handles quoted fields with embedded commas.
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s + 'T00:00:00Z')
  return !Number.isNaN(d.getTime())
}

function toNonNegativeNumber(raw: string): number | null {
  if (raw === '') return null
  // Allow comma thousand-separators in numeric input.
  const cleaned = raw.replace(/,/g, '')
  const n = Number(cleaned)
  if (Number.isNaN(n) || n < 0) return null
  return n
}

function bkkDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}
