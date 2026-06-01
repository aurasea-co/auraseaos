// F&B daily-sales CSV parser. Each row is one (date × menu item ×
// units sold) fact. Owner uploads a sheet typically extracted from
// their POS (Loyverse, FoodStory, Storehub) or hand-rolled in Excel.
//
// Schema (header row required):
//   date,item_name,external_item_id,units_sold
//
//   - date              : ISO YYYY-MM-DD. The day the sales occurred.
//   - item_name         : Free-text. Matched case-insensitive against
//                          menu_items.name within the branch.
//   - external_item_id  : Optional POS SKU. When present, takes
//                          priority over item_name for matching.
//   - units_sold        : Integer ≥ 0. Decimals rounded.
//
// At least ONE of item_name / external_item_id must be present per
// row. The API route resolves each row to a menu_items.id by matching
// (external_item_id → name → unknown); unknowns are skipped with a
// per-row warning so the owner can fix the CSV and re-upload.
//
// Pure function. No I/O. Returns the standard
// { rows, warnings, totalDataLines } shape used by csv-competitor.ts.

export interface FnbSalesCsvRow {
  date: string
  itemName: string | null
  externalItemId: string | null
  unitsSold: number
}

export interface FnbSalesCsvWarning {
  /** 1-indexed line number including the header. */
  lineNumber: number
  code:
    | 'missing_columns'
    | 'blank_row'
    | 'invalid_date'
    | 'missing_item_identifier'
    | 'invalid_units'
  /** Truncated raw line for the owner's reference. For missing_columns
   *  this carries the diagnostic detail (expected columns + columns we
   *  actually found) so the operator can spot the mismatch quickly. */
  raw: string
}

// Auto-detect the field separator on the header line. Excel saves
// CSVs with semicolons in locales that use comma as decimal separator
// (Thai, German, French, etc); some POS exports use tabs. We try the
// three common candidates and pick whichever produces the most fields
// on the header line.
//
// Returns the comma if no clear winner (single-column file → comma
// fallback gives a deterministic answer for the rest of the pipeline).
function detectSeparator(headerLine: string): ',' | ';' | '\t' {
  const counts = {
    ',': (headerLine.match(/,/g) || []).length,
    ';': (headerLine.match(/;/g) || []).length,
    '\t': (headerLine.match(/\t/g) || []).length,
  }
  const best = (Object.entries(counts) as Array<[',' | ';' | '\t', number]>)
    .sort((a, b) => b[1] - a[1])[0]
  return best[1] > 0 ? best[0] : ','
}

export interface FnbSalesCsvParseResult {
  rows: FnbSalesCsvRow[]
  warnings: FnbSalesCsvWarning[]
  totalDataLines: number
}

// CSV splitter that handles quoted cells containing the separator
// character. Takes the separator as a parameter so we can auto-detect
// comma / semicolon / tab on the header line.
function splitCsvLine(line: string, sep: ',' | ';' | '\t'): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (c === sep && !inQuotes) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function normaliseDate(raw: string): string | null {
  const s = raw.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const parts = s.split('-').map(Number)
  const m = parts[1]
  const d = parts[2]
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return s
}

export function parseFnbSalesCsv(input: string): FnbSalesCsvParseResult {
  const text = input.replace(/^﻿/, '')
  const lines = text.split(/\r?\n/)
  const rows: FnbSalesCsvRow[] = []
  const warnings: FnbSalesCsvWarning[] = []
  let totalDataLines = 0

  if (lines.length === 0) {
    return { rows, warnings, totalDataLines }
  }

  // Auto-detect separator: comma / semicolon / tab. Excel in Thai
  // (and other comma-decimal locales) saves CSVs with semicolons by
  // default — without this, those exports would all fail the header
  // check below because the entire header lands in a single field.
  const headerLine = lines[0] || ''
  const sep = detectSeparator(headerLine)

  const header = splitCsvLine(headerLine, sep).map((h) => h.toLowerCase())
  // Required: date + units_sold. EITHER item_name OR external_item_id
  // must be present in the header — the per-row identifier check
  // below catches "neither filled" warnings on a row-by-row basis.
  const required: ReadonlyArray<string> = ['date', 'units_sold']
  const missing = required.filter((c) => !header.includes(c))
  const hasName = header.includes('item_name')
  const hasExternal = header.includes('external_item_id')
  if (missing.length > 0 || (!hasName && !hasExternal)) {
    // Diagnostic detail: what we expected vs what the file gave us,
    // plus which separator the auto-detect picked. Surfaces the
    // root cause when an owner's Excel exported with semicolons or
    // when they hand-typed a different schema.
    const sepLabel = sep === '\t' ? 'TAB' : `"${sep}"`
    warnings.push({
      lineNumber: 1,
      code: 'missing_columns',
      raw: `Expected columns: ${[...required, 'item_name or external_item_id'].join(', ')}. Found (separator=${sepLabel}): ${header.join(', ') || '(none — header line empty)'}`,
    })
    return { rows, warnings, totalDataLines: 0 }
  }

  const idxDate = header.indexOf('date')
  const idxName = header.indexOf('item_name')        // -1 ok when only external is provided
  const idxExtId = header.indexOf('external_item_id') // -1 ok when only name is provided
  const idxUnits = header.indexOf('units_sold')

  for (let i = 1; i < lines.length; i += 1) {
    const lineNumber = i + 1
    const line = lines[i] ?? ''
    if (line.trim() === '') continue
    totalDataLines += 1
    const cells = splitCsvLine(line, sep)

    if (cells.every((c) => c === '')) {
      warnings.push({ lineNumber, code: 'blank_row', raw: line.slice(0, 200) })
      continue
    }

    const date = normaliseDate(cells[idxDate] ?? '')
    if (!date) {
      warnings.push({ lineNumber, code: 'invalid_date', raw: line.slice(0, 200) })
      continue
    }

    const itemName = idxName >= 0 ? (cells[idxName] ?? '').trim() : ''
    const externalItemId = idxExtId >= 0 ? (cells[idxExtId] ?? '').trim() : ''

    if (!itemName && !externalItemId) {
      warnings.push({ lineNumber, code: 'missing_item_identifier', raw: line.slice(0, 200) })
      continue
    }

    const unitsRaw = (cells[idxUnits] ?? '').trim()
    const unitsNum = Number(unitsRaw)
    if (!Number.isFinite(unitsNum) || unitsNum < 0) {
      warnings.push({ lineNumber, code: 'invalid_units', raw: line.slice(0, 200) })
      continue
    }

    rows.push({
      date,
      itemName: itemName || null,
      externalItemId: externalItemId || null,
      unitsSold: Math.round(unitsNum),
    })
  }

  return { rows, warnings, totalDataLines }
}

// CSV template generator. Given the branch's known menu items, emits
// one row per (item × date) for the next `days` calendar days starting
// at startDate (default 7). units_sold left blank for the owner to fill.
//
// external_item_id is populated when the menu_items row has one —
// downstream import will match on that column first, falling back to
// name. This gives owners with POS-imported items the more robust
// match path without making them re-type IDs.
export function buildFnbSalesCsvTemplate(input: {
  items: ReadonlyArray<{ name: string; external_item_id?: string | null }>
  startDate: string
  days?: number
}): string {
  const days = Math.max(1, Math.min(input.days ?? 7, 31))
  const lines: string[] = ['date,item_name,external_item_id,units_sold']
  const start = new Date(`${input.startDate}T00:00:00Z`)
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start)
    d.setUTCDate(d.getUTCDate() + i)
    const dateStr = d.toISOString().slice(0, 10)
    for (const item of input.items) {
      const nameCell = item.name.includes(',') ? `"${item.name}"` : item.name
      const extCell = item.external_item_id
        ? (item.external_item_id.includes(',') ? `"${item.external_item_id}"` : item.external_item_id)
        : ''
      lines.push(`${dateStr},${nameCell},${extCell},`)
    }
  }
  return lines.join('\n') + '\n'
}
