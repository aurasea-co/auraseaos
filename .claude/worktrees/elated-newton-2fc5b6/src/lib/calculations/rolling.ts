/**
 * Calculate a rolling 7-day average, filling missing days with historical ratio.
 * @param entries - array of {date, value} sorted ascending
 * @param referenceDate - YYYY-MM-DD string (Bangkok local) to centre the window on
 * @returns 7-day average value
 *
 * Date arithmetic uses pure YYYY-MM-DD string math so the result is
 * timezone-agnostic — no Date() parsing that could shift the window by a day
 * depending on server vs. client TZ.
 */
function addDaysToDateStr(dateStr: string, delta: number): string {
  // Treat YYYY-MM-DD as UTC midnight so ±days never crosses a DST/TZ boundary.
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function rolling7DayAvg(
  entries: { date: string; value: number | null }[],
  referenceDate: string
): number {
  const startStr = addDaysToDateStr(referenceDate, -6)

  // Filter entries in the 7-day window
  const windowEntries = entries.filter(
    (e) => e.date >= startStr && e.date <= referenceDate
  )

  // Calculate historical average from all non-null entries (for fallback)
  const allValid = entries.filter((e) => e.value != null && e.value > 0)
  const historicalAvg =
    allValid.length > 0
      ? allValid.reduce((sum, e) => sum + (e.value || 0), 0) / allValid.length
      : 0

  // Build 7-day values, filling missing days with historical avg
  const values: number[] = []
  for (let i = 0; i < 7; i++) {
    const dateStr = addDaysToDateStr(startStr, i)
    const entry = windowEntries.find((e) => e.date === dateStr)
    if (entry && entry.value != null && entry.value > 0) {
      values.push(entry.value)
    } else {
      values.push(historicalAvg)
    }
  }

  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Rolling average over the last `window` days ending at `referenceDate`.
 *
 * Unlike `rolling7DayAvg`, this one is *strict*: missing days are excluded
 * from the average entirely (no historical back-fill, no zero-fill). Returns
 * `null` until the window contains at least `minSamples` real values — so
 * the chart draws an honest gap at the start of the series instead of a
 * warm-up line drawn from a single data point.
 *
 * Used by the Trends margin chart: treating a missing day as 0% dragged the
 * line to the floor, making daily margin look catastrophically spiky.
 */
export function rollingAvg(
  entries: { date: string; value: number | null }[],
  referenceDate: string,
  window: number,
  minSamples: number = Math.ceil(window / 2),
): number | null {
  if (window <= 0) return null
  const startStr = addDaysToDateStr(referenceDate, -(window - 1))
  const windowEntries = entries.filter(
    (e) => e.date >= startStr && e.date <= referenceDate && e.value != null,
  )
  if (windowEntries.length < minSamples) return null
  const sum = windowEntries.reduce((s, e) => s + (e.value as number), 0)
  return sum / windowEntries.length
}
