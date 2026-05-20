/**
 * Shared aggregation for the weekly-report email + PDF.
 *
 * One `BranchReport` per branch, optional `PortfolioSummary` when an owner
 * has more than one branch. Margin is gross-only (excl. salary), matching
 * the rest of the app.
 */

import { periodAvgMargin, type MarginInputRow } from '@/lib/calculations/marginAggregates'
import { generateWeeklyHotelRecommendation, generateWeeklyFnbRecommendation } from './recommendation'

export interface DailyRow {
  date: string
  revenue: number | null
  adr?: number | null
  occupancy?: number | null
  revpar?: number | null
  customers?: number | null
  avgTicket?: number | null
  /** Gross margin (excl. salary), computed from revenue + additional_cost_today. */
  margin?: number | null
  /**
   * Rolling 30-day gross-margin average ending on this row's date.
   * Used as a "~" prefixed fallback in the daily table for F&B rows where
   * `margin` is null (no cost entered or out-of-band). Undefined when the
   * window has no qualifying days at all.
   */
  marginFallback?: number
  onTarget: boolean
}

export interface BranchWeekly {
  totalRevenue: number
  daysWithData: number
  avgAdr?: number
  avgOccupancy?: number
  avgRevpar?: number
  avgMargin?: number
  totalCovers?: number
  avgSpend?: number
}

export interface BranchTargets {
  adr?: number
  occupancy?: number
  margin?: number  // 100 - cogs_target
  covers?: number  // per-day target * 7
  avgSpend?: number
}

export type WeekScore = 'on-track' | 'needs-attention' | 'critical'

export interface BranchReport {
  branchId: string
  branchName: string
  branchType: 'accommodation' | 'fnb'
  weekStartLabel: string  // "12 May"
  weekEndLabel: string    // "18 May"
  current: BranchWeekly
  previous?: BranchWeekly
  targets: BranchTargets
  daily: DailyRow[]
  weekScore: WeekScore
  recommendation: string
  /**
   * Simple mean of (margin ?? marginFallback) across the daily rows.
   * Used for the daily-table footer and the week-over-week Margin card
   * so both displays match the numbers the reader sees row by row. F&B
   * only; undefined for hotel branches where the daily table tracks ADR
   * instead.
   */
  avgMarginDisplay?: number
}

export interface PortfolioSummary {
  totalRevenueCurrent: number
  totalRevenuePrevious?: number
  revenueChangePct?: number  // signed
  bestBranchName?: string
  bestBranchReason?: string  // e.g. "Margin 35% vs target 32%"
}

// --- helpers -------------------------------------------------------------

/**
 * Bangkok-local date formatter. Thai output uses Buddhist calendar with a
 * 2-digit year (e.g. "17 พ.ค. 69"); English uses en-GB ("17 May 26"). The
 * year is only appended when `withYear` is true so date ranges read
 * cleanly: "10 พ.ค. – 17 พ.ค. 69".
 */
export function formatBangkokDate(d: Date, locale: 'th' | 'en', opts: { withYear: boolean }): string {
  if (locale === 'th') {
    const out = d.toLocaleDateString('th-TH-u-ca-buddhist', {
      day: 'numeric',
      month: 'short',
      ...(opts.withYear ? { year: 'numeric' } : {}),
      timeZone: 'Asia/Bangkok',
    })
    // 2-digit BE year: '2569' → '69'. Idempotent on output that doesn't
    // include a year at all.
    return out.replace(/25(\d{2})/, '$1')
  }
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(opts.withYear ? { year: '2-digit' } : {}),
    timeZone: 'Asia/Bangkok',
  })
}

const num = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const meanDefined = (vals: Array<number | null>): number | undefined => {
  const present = vals.filter((v): v is number => v != null)
  if (present.length === 0) return undefined
  return present.reduce((s, v) => s + v, 0) / present.length
}

const sumDefined = (vals: Array<number | null>): number =>
  vals.reduce<number>((s, v) => s + (v ?? 0), 0)

/** Gross margin (excl. salary) for one daily row. */
function dailyGrossMargin(revenue: number | null, cost: number | null): number | null {
  if (!revenue || revenue <= 0) return null
  if (cost == null || cost <= 0) return null
  const pct = (1 - cost / revenue) * 100
  if (pct > 85 || pct < 0) return null
  return Math.round(pct * 10) / 10
}

function aggregateWeek(rows: Array<Record<string, unknown>>): BranchWeekly {
  const revenues = rows.map((r) => num(r.revenue)).filter((v): v is number => v != null && v > 0)
  const adrs = rows.map((r) => num(r.adr)).filter((v): v is number => v != null && v > 0)
  const occs = rows.map((r) => num(r.occupancy_rate))
  const revpars = rows.map((r) => num(r.revpar)).filter((v): v is number => v != null && v > 0)
  const covers = rows.map((r) => num(r.customers))
  const avgTickets = rows.map((r) => num(r.avg_ticket)).filter((v): v is number => v != null && v > 0)
  const margins = rows
    .map((r) => dailyGrossMargin(num(r.revenue), num(r.additional_cost_today)))
    .filter((v): v is number => v != null)

  return {
    totalRevenue: sumDefined(revenues),
    daysWithData: rows.length,
    avgAdr: adrs.length ? adrs.reduce((s, v) => s + v, 0) / adrs.length : undefined,
    avgOccupancy: meanDefined(occs),
    avgRevpar: revpars.length ? revpars.reduce((s, v) => s + v, 0) / revpars.length : undefined,
    avgMargin: margins.length ? margins.reduce((s, v) => s + v, 0) / margins.length : undefined,
    totalCovers: covers.filter((v): v is number => v != null).reduce((s, v) => s + v, 0) || undefined,
    avgSpend: avgTickets.length ? avgTickets.reduce((s, v) => s + v, 0) / avgTickets.length : undefined,
  }
}

function buildDaily(
  currentRows: Array<Record<string, unknown>>,
  allHistoryRows: Array<Record<string, unknown>>,
  targets: BranchTargets,
  isHotel: boolean,
): DailyRow[] {
  // Pre-build MarginInputRow shape over the full history so we can
  // compute the rolling 30-day fallback per current-day below.
  const historyMargin: MarginInputRow[] = allHistoryRows.map((row) => ({
    metric_date: String(row.metric_date),
    revenue: num(row.revenue),
    variableCost: num(row.additional_cost_today),
  }))

  return currentRows.map((r) => {
    const revenue = num(r.revenue)
    const adr = num(r.adr)
    const occ = num(r.occupancy_rate)
    const covers = num(r.customers)
    const avgTicket = num(r.avg_ticket)
    const margin = dailyGrossMargin(revenue, num(r.additional_cost_today))
    const revpar = num(r.revpar)
    const onTarget = isHotel
      ? (adr != null && targets.adr != null && targets.adr > 0)
        ? adr >= targets.adr
        : revenue != null && revenue > 0
      : (margin != null && targets.margin != null)
        ? margin >= targets.margin
        : revenue != null && revenue > 0

    // F&B fallback: when the day's own margin is null (no cost entered or
    // out-of-band), surface a rolling 30-day gross-margin average over
    // every row ending on (and including) this date. periodAvgMargin runs
    // in gross mode when monthlySalary + operatingDays are both 0.
    let marginFallback: number | undefined
    if (!isHotel && margin == null) {
      const cutoff = String(r.metric_date)
      const window = historyMargin.filter((h) => h.metric_date <= cutoff)
      marginFallback = periodAvgMargin(window, 0, 0)?.value
    }

    return {
      date: String(r.metric_date),
      revenue,
      adr,
      occupancy: occ,
      revpar,
      customers: covers,
      avgTicket,
      margin,
      marginFallback,
      onTarget,
    }
  })
}

function scoreWeek(current: BranchWeekly, targets: BranchTargets, isHotel: boolean): WeekScore {
  const primary = isHotel ? current.avgAdr : current.avgMargin
  const target = isHotel ? targets.adr : targets.margin
  if (primary == null || target == null || target <= 0) {
    // No target configured — judge by data completeness instead.
    return current.daysWithData >= 5 ? 'on-track' : 'needs-attention'
  }
  const ratio = primary / target
  if (ratio >= 1) return 'on-track'
  if (ratio >= 0.8) return 'needs-attention'
  return 'critical'
}

function buildRecommendation(
  current: BranchWeekly,
  previous: BranchWeekly | undefined,
  targets: BranchTargets,
  isHotel: boolean,
  currentRows: Array<Record<string, unknown>>,
  daily: DailyRow[],
  avgMarginDisplay: number | undefined,
  locale: 'th' | 'en',
): string {
  // Revenue extremes across the current week (skip null/zero days so a
  // missing entry doesn't masquerade as a "worst day").
  const revenues = currentRows
    .map((m) => Number(m.revenue))
    .filter((v) => Number.isFinite(v) && v > 0)
  const bestDayRevenue = revenues.length > 0 ? Math.max(...revenues) : 0
  const worstDayRevenue = revenues.length > 0 ? Math.min(...revenues) : 0

  if (isHotel) {
    const adrTarget = targets.adr ?? 0
    const occupancyTarget = targets.occupancy ?? 80
    let daysAboveAdrTarget = 0
    let daysAboveOccTarget = 0
    for (const m of currentRows) {
      const adr = Number(m.adr)
      const occ = Number(m.occupancy_rate)
      if (adrTarget > 0 && Number.isFinite(adr) && adr >= adrTarget) daysAboveAdrTarget++
      if (occupancyTarget > 0 && Number.isFinite(occ) && occ >= occupancyTarget) daysAboveOccTarget++
    }
    return generateWeeklyHotelRecommendation({
      avgAdr: current.avgAdr ?? 0,
      adrTarget,
      avgOccupancy: current.avgOccupancy ?? 0,
      occupancyTarget,
      totalRevenue: current.totalRevenue,
      prevWeekRevenue: previous?.totalRevenue ?? 0,
      bestDayRevenue,
      worstDayRevenue,
      daysAboveAdrTarget,
      daysAboveOccTarget,
      totalDays: currentRows.length,
    })
  }

  // F&B aggregates from the daily rows.
  const totalCovers = currentRows.reduce((s, r) => s + (Number(r.customers) || 0), 0)
  const daysWithCost = currentRows.filter((r) => Number(r.additional_cost_today) > 0).length
  const daysWithRevenue = currentRows.filter((r) => Number(r.revenue) > 0).length
  const avgSpend = totalCovers > 0 ? current.totalRevenue / totalCovers : 0

  // Lowest actual-margin day (rolling-avg fallback rows are excluded so
  // the message points at a real, investigable day).
  let lowestMarginDay: string | null = null
  let lowestMarginValue = Number.POSITIVE_INFINITY
  for (const d of daily) {
    if (d.margin == null) continue
    if (d.margin < lowestMarginValue) {
      lowestMarginValue = d.margin
      lowestMarginDay = formatBangkokDate(new Date(d.date + 'T00:00:00'), locale, { withYear: false })
    }
  }

  // Weekly cover target ≈ daily target × 7.
  const dailyCoversTarget = targets.covers ?? 0
  const weeklyCoversTarget = dailyCoversTarget > 0 ? dailyCoversTarget * 7 : 0

  return generateWeeklyFnbRecommendation({
    // Display avg matches the number rendered in the email/PDF table.
    avgMargin: avgMarginDisplay ?? current.avgMargin ?? 0,
    marginTarget: targets.margin ?? 68,
    totalCovers,
    coversTarget: weeklyCoversTarget,
    avgSpend,
    totalRevenue: current.totalRevenue,
    prevWeekRevenue: previous?.totalRevenue ?? 0,
    bestDayRevenue,
    worstDayRevenue,
    daysWithCost,
    totalDays: daysWithRevenue,
    lowestMarginDay,
  })
}

// --- public API ----------------------------------------------------------

export function buildBranchReport(args: {
  branchId: string
  branchName: string
  branchType: 'accommodation' | 'fnb'
  weekStart: Date
  weekEnd: Date
  /** All rows for the full window (up to ~30 days), ordered ascending. */
  rows: Array<Record<string, unknown>>
  /** Bangkok ISO start date (YYYY-MM-DD) of the current 7-day window. */
  currentStartStr: string
  /**
   * Bangkok ISO start date (YYYY-MM-DD) of the prior 7-day window. The
   * window between [previousStartStr, currentStartStr) is used for the
   * week-over-week comparison; any rows older than previousStartStr stay
   * in `rows` for the daily marginFallback calculation but don't count
   * toward "previous week".
   */
  previousStartStr: string
  targets: BranchTargets
  locale: 'th' | 'en'
}): BranchReport | null {
  const currentRows = args.rows.filter((r) => String(r.metric_date) >= args.currentStartStr)
  if (!currentRows.length) return null
  const previousRows = args.rows.filter(
    (r) => String(r.metric_date) >= args.previousStartStr && String(r.metric_date) < args.currentStartStr,
  )

  const current = aggregateWeek(currentRows)
  const previous = previousRows.length > 0 ? aggregateWeek(previousRows) : undefined
  const isHotel = args.branchType === 'accommodation'
  const daily = buildDaily(currentRows, args.rows, args.targets, isHotel)
  const weekScore = scoreWeek(current, args.targets, isHotel)

  // Display-mean of the margin column: actual when available, else the
  // rolling fallback. Skips rows that have neither (the '—' cells).
  // Computed before buildRecommendation so the F&B helper can use this
  // (matching the email/PDF table footer) as its avgMargin signal.
  let avgMarginDisplay: number | undefined
  if (!isHotel) {
    const displayVals: number[] = []
    for (const d of daily) {
      const v = d.margin ?? d.marginFallback
      if (v != null) displayVals.push(v)
    }
    if (displayVals.length > 0) {
      avgMarginDisplay = displayVals.reduce((s, v) => s + v, 0) / displayVals.length
    }
  }

  const recommendation = buildRecommendation(
    current,
    previous,
    args.targets,
    isHotel,
    currentRows,
    daily,
    avgMarginDisplay,
    args.locale,
  )

  const weekStartLabel = formatBangkokDate(args.weekStart, args.locale, { withYear: false })
  const weekEndLabel = formatBangkokDate(args.weekEnd, args.locale, { withYear: true })

  return {
    branchId: args.branchId,
    branchName: args.branchName,
    branchType: args.branchType,
    weekStartLabel,
    weekEndLabel,
    current,
    previous,
    targets: args.targets,
    daily,
    weekScore,
    recommendation,
    avgMarginDisplay,
  }
}

export function buildPortfolio(reports: BranchReport[]): PortfolioSummary | null {
  if (reports.length < 2) return null
  const totalCurrent = reports.reduce((s, r) => s + r.current.totalRevenue, 0)
  const allHavePrev = reports.every((r) => r.previous != null)
  const totalPrev = allHavePrev
    ? reports.reduce((s, r) => s + (r.previous?.totalRevenue ?? 0), 0)
    : undefined
  const revenueChangePct =
    totalPrev != null && totalPrev > 0
      ? ((totalCurrent - totalPrev) / totalPrev) * 100
      : undefined

  // Best branch: the one whose primary-metric-to-target ratio is highest.
  let best: { name: string; reason: string; ratio: number } | undefined
  for (const r of reports) {
    const isHotel = r.branchType === 'accommodation'
    const primary = isHotel ? r.current.avgAdr : r.current.avgMargin
    const target = isHotel ? r.targets.adr : r.targets.margin
    if (primary == null || target == null || target <= 0) continue
    const ratio = primary / target
    if (!best || ratio > best.ratio) {
      best = {
        name: r.branchName,
        reason: isHotel
          ? `ADR ฿${Math.round(primary).toLocaleString()} vs target ฿${Math.round(target).toLocaleString()}`
          : `Margin ${Math.round(primary)}% vs target ${Math.round(target)}%`,
        ratio,
      }
    }
  }

  return {
    totalRevenueCurrent: totalCurrent,
    totalRevenuePrevious: totalPrev,
    revenueChangePct,
    bestBranchName: best?.name,
    bestBranchReason: best?.reason,
  }
}

/**
 * Three Thai-language action items shown at the bottom of the weekly
 * report email + PDF, mirroring the portfolio page's "3 things to do
 * this week" block. Priority order:
 *   1. Worst-performing branch — biggest target gap on its primary metric
 *   2. Operational hygiene — incomplete data entry across the week, or
 *      labour-cost callout when entry compliance is fine
 *   3. Positive observation — best-performing branch + an extend-from-here
 *      suggestion
 *
 * Falls back to neutral text when signals are missing.
 */
export function generateWeeklyActions(reports: BranchReport[]): string[] {
  if (reports.length === 0) return []

  // 1) Worst gap vs target across all branches
  let worstAction: string | undefined
  let worstGap = -Infinity
  for (const r of reports) {
    const isHotel = r.branchType === 'accommodation'
    const value = isHotel ? r.current.avgAdr : (r.avgMarginDisplay ?? r.current.avgMargin)
    const target = isHotel ? r.targets.adr : r.targets.margin
    if (value == null || target == null || target <= 0) continue
    const gap = target - value
    if (gap > worstGap) {
      worstGap = gap
      worstAction = isHotel
        ? `${r.branchName}: ADR ต่ำกว่าเป้า ฿${Math.round(Math.abs(gap))}`
        : `${r.branchName}: Margin ต่ำกว่าเป้า ${Math.round(Math.abs(gap))}%`
    }
  }
  if (worstGap <= 0) worstAction = undefined  // everyone hit target

  // 2) Data-entry compliance: branches with < 7 days of data this week
  const incomplete = reports.filter((r) => r.current.daysWithData < 7)
  let complianceAction: string
  if (incomplete.length === 1) {
    complianceAction = `${incomplete[0].branchName}: กรอกข้อมูลให้ครบทุกวันเพื่อให้รายงานแม่นยำขึ้น`
  } else if (incomplete.length > 1) {
    complianceAction = `${incomplete.length} สาขายังกรอกข้อมูลไม่ครบสัปดาห์ — ตั้งเตือนเวลาปิดร้านเพื่อความสม่ำเสมอ`
  } else {
    // Compliance fine — surface labour or COGS as the secondary signal
    // for F&B with poor margin (when present), otherwise generic nudge.
    const fnbWithThinMargin = reports.find(
      (r) =>
        r.branchType === 'fnb' &&
        (r.avgMarginDisplay ?? r.current.avgMargin ?? 100) <
          (r.targets.margin ?? 100),
    )
    if (fnbWithThinMargin) {
      complianceAction = `${fnbWithThinMargin.branchName}: ปรับ shift schedule เพื่อลด labour cost`
    } else {
      complianceAction = 'กรอกข้อมูลครบทุกสาขา — รักษามาตรฐานความสม่ำเสมอนี้'
    }
  }

  // 3) Best-performing branch — encouragement + extend-further nudge
  let bestAction: string | undefined
  let bestRatio = -Infinity
  for (const r of reports) {
    const isHotel = r.branchType === 'accommodation'
    const value = isHotel ? r.current.avgAdr : (r.avgMarginDisplay ?? r.current.avgMargin)
    const target = isHotel ? r.targets.adr : r.targets.margin
    if (value == null || target == null || target <= 0) continue
    const ratio = value / target
    if (ratio > bestRatio) {
      bestRatio = ratio
      bestAction = isHotel
        ? `${r.branchName}: ADR ทำได้ดี — มองหาช่องทาง upsell เพื่อเพิ่ม revenue ต่อห้อง`
        : `${r.branchName}: Margin / Covers แข็งแรง — มองหาวิธีต่อยอด margin ให้สูงขึ้นอีก`
    }
  }

  return [
    worstAction ?? 'ทบทวนผลประกอบการรายสาขา — มองหาแนวโน้มที่ต้องดูแลในสัปดาห์หน้า',
    complianceAction,
    bestAction ?? 'รักษาผลประกอบการให้สม่ำเสมอ และทบทวนรายสาขาในแต่ละสัปดาห์',
  ]
}
