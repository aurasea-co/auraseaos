// Menu-items CSV parser. Owner uploads a sheet listing the branch's
// menu so /settings/menu doesn't require typing each item by hand
// (most cafes have 50-200 items at onboarding).
//
// Schema (header row required):
//   name,category,price_baht,cost_baht
//
//   - name        : Free-text, required. Must be unique within the
//                    branch (existing items with the same name are
//                    UPDATED, not duplicated).
//   - category    : Free-text, optional. Items without one bucket
//                    under "—" in the dashboard's category grouping.
//   - price_baht  : Required, integer THB ≥ 0. Decimal rounded.
//                   Accepts the alias "price_thb" to match our
//                   house style (THB, not satang). The "_baht"
//                   form is the spec's user-facing column name.
//   - cost_baht   : Optional integer THB ≥ 0. Blank → cost_thb=NULL
//                   in DB → margin shows "—" on the dashboard.
//                   Also accepts "cost_thb".
//
// Pure function, no I/O. Returns the standard
// { rows, warnings, totalDataLines } shape used by the other
// ingestion parsers in src/lib/ingestion/.

export interface MenuItemCsvRow {
  name: string
  category: string | null
  priceThb: number
  costThb: number | null
}

export interface MenuItemCsvWarning {
  /** 1-indexed line number including the header. */
  lineNumber: number
  code:
    | 'missing_columns'
    | 'blank_row'
    | 'missing_name'
    | 'name_too_long'
    | 'invalid_price'
    | 'invalid_cost'
  /** Diagnostic detail or raw offending line truncated to 200 chars. */
  raw: string
}

export interface MenuItemCsvParseResult {
  rows: MenuItemCsvRow[]
  warnings: MenuItemCsvWarning[]
  totalDataLines: number
}

// Auto-detect comma/semicolon/tab separator (same Excel-locale issue
// as csv-fnb-sales — Thai/EU Excel saves CSVs with semicolons).
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

export function parseMenuItemsCsv(input: string): MenuItemCsvParseResult {
  const text = input.replace(/^﻿/, '')
  const lines = text.split(/\r?\n/)
  const rows: MenuItemCsvRow[] = []
  const warnings: MenuItemCsvWarning[] = []
  let totalDataLines = 0

  if (lines.length === 0) {
    return { rows, warnings, totalDataLines }
  }

  const headerLine = lines[0] || ''
  const sep = detectSeparator(headerLine)
  const header = splitCsvLine(headerLine, sep).map((h) => h.toLowerCase())

  // Required: name + price (price_baht OR price_thb). Optional:
  // category + cost (cost_baht OR cost_thb).
  const hasName = header.includes('name')
  const priceIdx = header.findIndex((h) => h === 'price_baht' || h === 'price_thb')
  if (!hasName || priceIdx < 0) {
    const sepLabel = sep === '\t' ? 'TAB' : `"${sep}"`
    const nonBlankLines = lines.filter((l) => l.trim().length > 0).length
    const byteSize = new Blob([text]).size
    warnings.push({
      lineNumber: 1,
      code: 'missing_columns',
      raw:
        `Expected columns: name, price_baht (or price_thb), optional category + cost_baht. ` +
        `Found (separator=${sepLabel}, ${byteSize} bytes, ${nonBlankLines} non-blank line${nonBlankLines === 1 ? '' : 's'}): ` +
        `${header.join(', ') || '(none — header line empty)'}`,
    })
    return { rows, warnings, totalDataLines: 0 }
  }
  const idxName = header.indexOf('name')
  const idxCat = header.indexOf('category')         // -1 ok
  const idxPrice = priceIdx
  const costIdx = header.findIndex((h) => h === 'cost_baht' || h === 'cost_thb')  // -1 ok

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

    const name = (cells[idxName] ?? '').trim()
    if (!name) {
      warnings.push({ lineNumber, code: 'missing_name', raw: line.slice(0, 200) })
      continue
    }
    if (name.length > 120) {
      warnings.push({ lineNumber, code: 'name_too_long', raw: line.slice(0, 200) })
      continue
    }

    const priceRaw = (cells[idxPrice] ?? '').trim()
    const priceNum = Number(priceRaw)
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      warnings.push({ lineNumber, code: 'invalid_price', raw: line.slice(0, 200) })
      continue
    }

    let costThb: number | null = null
    if (costIdx >= 0) {
      const costRaw = (cells[costIdx] ?? '').trim()
      if (costRaw !== '') {
        const costNum = Number(costRaw)
        if (!Number.isFinite(costNum) || costNum < 0) {
          warnings.push({ lineNumber, code: 'invalid_cost', raw: line.slice(0, 200) })
          continue
        }
        costThb = Math.round(costNum)
      }
    }

    const category = idxCat >= 0 ? (cells[idxCat] ?? '').trim() : ''

    rows.push({
      name,
      category: category || null,
      priceThb: Math.round(priceNum),
      costThb,
    })
  }

  return { rows, warnings, totalDataLines }
}

// Build a CSV template the page offers as a download. Header + a few
// hint rows pre-filled with representative entries so the owner sees
// the expected format. The hint rows are intentionally placeholders
// ("Pad Krapow" / "Iced Coffee") — owner deletes them before
// uploading.
export function buildMenuItemsCsvTemplate(): string {
  return [
    'name,category,price_baht,cost_baht',
    'Pad Krapow,Main,120,45',
    'Iced Coffee,Drinks,70,18',
    'Mango Sticky Rice,Dessert,80,',  // blank cost example
  ].join('\n') + '\n'
}
