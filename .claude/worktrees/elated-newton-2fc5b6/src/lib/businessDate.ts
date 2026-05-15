const BANGKOK_TZ = 'Asia/Bangkok'

/**
 * Get current time in Bangkok timezone.
 * Uses Intl API — no external dependency needed.
 */
function nowBangkok(): Date {
  const nowStr = new Date().toLocaleString('en-US', { timeZone: BANGKOK_TZ })
  return new Date(nowStr)
}

/**
 * Format a Date as YYYY-MM-DD
 */
function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Given the current UTC time and a branch's cutoff time,
 * returns the correct business date as YYYY-MM-DD.
 *
 * If current Bangkok time >= cutoffTime → business date = today (Bangkok)
 * If current Bangkok time < cutoffTime → business date = yesterday (Bangkok)
 *
 * Default cutoff is 05:00 (late-night F&B closing window). Accommodation
 * branches use 14:00 via their own stored cutoff so owners can still file
 * "last night" mid-afternoon.
 *
 * Examples:
 *   F&B (cutoff 05:00), entry at 02:30 → yesterday ✓ (same-night cash-out)
 *   F&B (cutoff 05:00), entry at 17:30 → today ✓
 *   Hotel (cutoff 14:00), entry at 09:00 → yesterday ✓ (morning night-audit)
 *   Hotel (cutoff 14:00), entry at 15:00 → today ✓
 */
export function getBusinessDate(cutoffTime: string = '05:00:00'): string {
  const now = nowBangkok()

  const [cutoffHour, cutoffMin] = cutoffTime.split(':').map(Number)
  const cutoffMinutes = cutoffHour * 60 + (cutoffMin || 0)
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  if (currentMinutes >= cutoffMinutes) {
    return toDateStr(now)
  } else {
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    return toDateStr(yesterday)
  }
}

/**
 * Get today's date in Bangkok timezone as YYYY-MM-DD
 */
export function getTodayBangkok(): string {
  return toDateStr(nowBangkok())
}

/**
 * Normalize any date/timestamp string to its Bangkok YYYY-MM-DD form.
 *
 * Handles three common shapes:
 *   "2026-04-17"                      → "2026-04-17"  (plain date, passthrough)
 *   "2026-04-17T00:00:00"             → "2026-04-17"  (naive timestamp, passthrough)
 *   "2026-04-16T17:00:00+00:00"       → "2026-04-17"  (UTC timestamptz — the
 *                                                      DB persisted midnight
 *                                                      Bangkok = 17:00Z the
 *                                                      previous calendar day)
 *
 * This is the one source of truth for the client-side "what day does this
 * metric belong to?" question. Use it instead of `x.substring(0, 10)` which
 * naively slices UTC and can land on the wrong Bangkok day.
 */
export function toBangkokDateStr(input: string | null | undefined): string {
  if (!input) return ''
  // Plain YYYY-MM-DD — no timezone involved, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input
  // Naive "YYYY-MM-DDTHH:MM:SS" without a timezone suffix — the date portion
  // is already the intended calendar day, don't shift it
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(input)) {
    return input.substring(0, 10)
  }
  // Anything else (ISO with Z or +hh:mm) is a real instant — convert to Bangkok
  const d = new Date(input)
  if (isNaN(d.getTime())) return input.substring(0, 10)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const y = parts.find((p) => p.type === 'year')?.value ?? ''
  const m = parts.find((p) => p.type === 'month')?.value ?? ''
  const day = parts.find((p) => p.type === 'day')?.value ?? ''
  return `${y}-${m}-${day}`
}

/**
 * Get the minimum allowed backdate
 */
export function getMinAllowedDate(maxBackDays: number): string {
  const now = nowBangkok()
  now.setDate(now.getDate() - maxBackDays)
  return toDateStr(now)
}

/**
 * Format a YYYY-MM-DD business date for display
 * Returns label (วันนี้/เมื่อวาน) and formatted date string
 */
export function formatBusinessDateDisplay(
  businessDate: string,
  lang: 'th' | 'en' = 'th'
): { label: string; dateStr: string; daysBack: number } {
  const today = getTodayBangkok()
  const now = nowBangkok()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = toDateStr(yesterday)

  const dateObj = new Date(businessDate + 'T00:00:00')
  const dateStr = dateObj.toLocaleDateString(
    lang === 'th' ? 'th-TH' : 'en-GB',
    { day: 'numeric', month: 'short', year: 'numeric' }
  )

  // Calculate days back
  const todayDate = new Date(today + 'T00:00:00')
  const bizDate = new Date(businessDate + 'T00:00:00')
  const diffMs = todayDate.getTime() - bizDate.getTime()
  const daysBack = Math.round(diffMs / 86400000)

  if (businessDate === today) {
    return { label: lang === 'th' ? 'วันนี้' : 'Today', dateStr, daysBack: 0 }
  } else if (businessDate === yesterdayStr) {
    return { label: lang === 'th' ? 'เมื่อวาน' : 'Yesterday', dateStr, daysBack: 1 }
  } else {
    return { label: '', dateStr, daysBack }
  }
}
