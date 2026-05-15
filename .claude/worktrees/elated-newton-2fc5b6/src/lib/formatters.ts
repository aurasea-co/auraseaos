/** Format date for chart x-axis: "2026-04-07" → "7/4" */
export function formatChartDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}`
}

/** Format currency: 12345 → "฿12,345" */
export function formatBaht(value: number, decimals = 0): string {
  return '฿' + value.toLocaleString('th-TH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** Format percentage: 80.123 → "80.1%" */
export function formatPct(value: number, decimals = 1): string {
  return value.toFixed(decimals) + '%'
}

/** Thai date: "2026-04-07" → "7 เม.ย. 2569" */
export function formatThaiDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

/** Week label: ["2026-03-31","2026-04-06"] → "31 มี.ค. – 6 เม.ย." */
export function formatWeekRange(dates: string[]): string {
  if (dates.length === 0) return ''
  const first = new Date(dates[0] + 'T00:00:00')
  const last = new Date(dates[dates.length - 1] + 'T00:00:00')
  const f = `${first.getDate()} ${first.toLocaleDateString('th-TH', { month: 'short' })}`
  const l = `${last.getDate()} ${last.toLocaleDateString('th-TH', { month: 'short' })}`
  return `${f} – ${l}`
}

/** Group metrics by week (Mon-Sun), return array of week groups */
export function groupByWeek<T extends { metric_date: string }>(data: T[]): T[][] {
  const weeks: T[][] = []
  let currentWeek: T[] = []
  let currentWeekStart = -1

  data.forEach((item) => {
    const d = new Date(item.metric_date + 'T00:00:00')
    const weekStart = getMonday(d).getTime()
    if (weekStart !== currentWeekStart) {
      if (currentWeek.length > 0) weeks.push(currentWeek)
      currentWeek = [item]
      currentWeekStart = weekStart
    } else {
      currentWeek.push(item)
    }
  })
  if (currentWeek.length > 0) weeks.push(currentWeek)
  return weeks
}

function getMonday(d: Date): Date {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.getFullYear(), d.getMonth(), diff)
}
