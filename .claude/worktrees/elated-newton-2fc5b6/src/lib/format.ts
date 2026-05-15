const currencyFormatter = new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat('th-TH')

export function formatCurrency(n: number): string {
  return `฿${currencyFormatter.format(Math.round(n))}`
}

export function formatNumber(n: number): string {
  return numberFormatter.format(n)
}

export function formatDate(
  dateStr: string,
  locale: string = 'th',
  options?: Intl.DateTimeFormatOptions
): string {
  try {
    // Handle both date-only (YYYY-MM-DD) and full ISO timestamps
    const date = dateStr.includes('T')
      ? new Date(dateStr)
      : new Date(dateStr + 'T00:00:00+07:00')

    if (isNaN(date.getTime())) return '—'

    const defaultOpts: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Bangkok',
      calendar: locale === 'th' ? 'buddhist' : undefined,
      ...options,
    }

    return date.toLocaleDateString(
      locale === 'th' ? 'th-TH' : 'en-US',
      defaultOpts
    )
  } catch {
    return '—'
  }
}

export function formatWeekday(dateStr: string, locale: string = 'th'): string {
  try {
    const date = dateStr.includes('T')
      ? new Date(dateStr)
      : new Date(dateStr + 'T00:00:00+07:00')
    if (isNaN(date.getTime())) return '—'
    return date.toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-US', {
      weekday: 'narrow',
      timeZone: 'Asia/Bangkok',
    })
  } catch {
    return '—'
  }
}

export function formatPercent(n: number): string {
  return `${Math.round(n)}%`
}
