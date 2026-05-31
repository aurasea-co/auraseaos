// Competitor-rate CSV parser. Owners (or staff) prepare a sheet listing
// a week or more of competitor rates per (date × competitor × room
// type × channel) in spreadsheet form and upload it instead of typing
// each row through the daily grid UI. Less friction than 7 × 5 × 4 =
// 140 manual entries.
//
// Schema (header row required):
//   date,competitor,room_type,channel,rate_thb,source
//
//   - date:       ISO YYYY-MM-DD. The day the rate was observed.
//   - competitor: Free-text name; must match an existing competitor
//                 row (the import route validates against the
//                 branch's competitor list). Case-insensitive match.
//   - room_type:  Free-text. Matched case-insensitive against the
//                 branch's room_type_breakdown history; unknown types
//                 are accepted (the data model is permissive).
//   - channel:    One of ota | walk_in | package | promo. Optional;
//                 defaults to 'ota' when blank (matches the daily
//                 grid default).
//   - rate_thb:   Integer THB > 0. Decimals are rounded.
//   - source:     Optional free-text label ("Agoda", "Booking phone",
//                 etc). When blank, defaults to "CSV import".
//
// The parser is pure (no I/O). Returns a structured result the API
// route can interpret: validated rows ready for upsert, and a list
// of per-line warnings the UI surfaces to the owner.

const ALLOWED_CHANNELS = new Set(['ota', 'walk_in', 'package', 'promo'])

export interface CompetitorCsvRow {
  date: string
  competitor: string
  roomType: string
  channel: 'ota' | 'walk_in' | 'package' | 'promo'
  rateThb: number
  source: string
}

export interface CompetitorCsvWarning {
  /** 1-indexed line number including the header row, so the owner
   *  can find the offending row in their spreadsheet quickly. */
  lineNumber: number
  /** Stable code so the API route can localise messages. */
  code:
    | 'missing_columns'
    | 'blank_row'
    | 'invalid_date'
    | 'missing_competitor'
    | 'missing_room_type'
    | 'invalid_channel'
    | 'invalid_rate'
  /** Raw line text for the owner's reference (truncated). */
  raw: string
}

export interface CompetitorCsvParseResult {
  rows: CompetitorCsvRow[]
  warnings: CompetitorCsvWarning[]
  /** Total non-blank data lines we attempted to parse (= rows.length
   *  + warnings of types that caused skips). */
  totalDataLines: number
}

// Tolerant CSV splitter — handles quoted values containing commas
// (e.g. `"Pullman, Korat",Suite,ota,...`). Doesn't support escaped
// quotes within a quoted field because hotel CSVs don't need them
// and the complexity isn't worth it for this scope.
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (c === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

// Normalise ISO date — accepts YYYY-MM-DD as-is, rejects everything
// else with a warning so the API doesn't insert malformed rows.
function normaliseDate(raw: string): string | null {
  const s = raw.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  // Cheap sanity check — Date constructor would accept "2026-02-31"
  // which we don't want to silently coerce. Year isn't validated (we
  // accept any 4-digit year because owners might be filing historical
  // shopping data).
  const parts = s.split('-').map(Number)
  const m = parts[1]
  const d = parts[2]
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return s
}

export function parseCompetitorCsv(input: string): CompetitorCsvParseResult {
  const text = input.replace(/^﻿/, '')  // strip BOM if Excel added one
  const lines = text.split(/\r?\n/)
  const rows: CompetitorCsvRow[] = []
  const warnings: CompetitorCsvWarning[] = []
  let totalDataLines = 0

  if (lines.length === 0) {
    return { rows, warnings, totalDataLines }
  }

  // Validate header presence — case-insensitive, in any order, but
  // every required column must appear.
  const header = splitCsvLine(lines[0] || '').map((h) => h.toLowerCase())
  const required: ReadonlyArray<string> = ['date', 'competitor', 'room_type', 'rate_thb']
  const missing = required.filter((c) => !header.includes(c))
  if (missing.length > 0) {
    warnings.push({
      lineNumber: 1,
      code: 'missing_columns',
      raw: `missing: ${missing.join(', ')}`,
    })
    return { rows, warnings, totalDataLines: 0 }
  }
  const colIndex = (name: string): number => header.indexOf(name)
  const idxDate = colIndex('date')
  const idxComp = colIndex('competitor')
  const idxRoom = colIndex('room_type')
  const idxChan = colIndex('channel')   // optional
  const idxRate = colIndex('rate_thb')
  const idxSrc = colIndex('source')     // optional

  for (let i = 1; i < lines.length; i += 1) {
    const lineNumber = i + 1
    const line = lines[i] ?? ''
    if (line.trim() === '') continue
    totalDataLines += 1
    const cells = splitCsvLine(line)

    // Blank-row safety — treat all-empty cells as a skip (covers
    // trailing blank lines from spreadsheets).
    if (cells.every((c) => c === '')) {
      warnings.push({ lineNumber, code: 'blank_row', raw: line.slice(0, 200) })
      continue
    }

    const date = normaliseDate(cells[idxDate] ?? '')
    if (!date) {
      warnings.push({ lineNumber, code: 'invalid_date', raw: line.slice(0, 200) })
      continue
    }

    const competitor = (cells[idxComp] ?? '').trim()
    if (!competitor) {
      warnings.push({ lineNumber, code: 'missing_competitor', raw: line.slice(0, 200) })
      continue
    }

    const roomType = (cells[idxRoom] ?? '').trim()
    if (!roomType) {
      warnings.push({ lineNumber, code: 'missing_room_type', raw: line.slice(0, 200) })
      continue
    }

    const channelRaw = idxChan >= 0 ? (cells[idxChan] ?? '').trim().toLowerCase() : ''
    const channel = channelRaw === '' ? 'ota' : channelRaw
    if (!ALLOWED_CHANNELS.has(channel)) {
      warnings.push({ lineNumber, code: 'invalid_channel', raw: line.slice(0, 200) })
      continue
    }

    const rateRaw = (cells[idxRate] ?? '').trim()
    const rateNum = Number(rateRaw)
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
      warnings.push({ lineNumber, code: 'invalid_rate', raw: line.slice(0, 200) })
      continue
    }

    const source = idxSrc >= 0 ? (cells[idxSrc] ?? '').trim() : ''

    rows.push({
      date,
      competitor,
      roomType,
      channel: channel as CompetitorCsvRow['channel'],
      rateThb: Math.round(rateNum),
      source: source || 'CSV import',
    })
  }

  return { rows, warnings, totalDataLines }
}

// Build a CSV template the UI offers as a download. Given the
// branch's existing competitors + the latest known room types, emits
// one row per (competitor × room type) for the next `days` calendar
// dates (default 7). The owner edits the rate_thb column and uploads.
export function buildCompetitorCsvTemplate(input: {
  competitors: ReadonlyArray<string>
  roomTypes: ReadonlyArray<string>
  startDate: string  // YYYY-MM-DD; usually tomorrow's BKK date
  days?: number
}): string {
  const days = Math.max(1, Math.min(input.days ?? 7, 30))
  const lines: string[] = ['date,competitor,room_type,channel,rate_thb,source']
  const start = new Date(`${input.startDate}T00:00:00Z`)
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start)
    d.setUTCDate(d.getUTCDate() + i)
    const dateStr = d.toISOString().slice(0, 10)
    for (const comp of input.competitors) {
      // Quote competitor names containing commas so they survive the
      // round-trip through splitCsvLine.
      const compCell = comp.includes(',') ? `"${comp}"` : comp
      for (const rt of input.roomTypes) {
        const rtCell = rt.includes(',') ? `"${rt}"` : rt
        lines.push(`${dateStr},${compCell},${rtCell},ota,,Agoda`)
      }
    }
  }
  return lines.join('\n') + '\n'
}
