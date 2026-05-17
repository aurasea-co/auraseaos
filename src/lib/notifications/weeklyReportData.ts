/**
 * Shared aggregation for the weekly-report email + PDF.
 *
 * One `BranchReport` per branch, optional `PortfolioSummary` when an owner
 * has more than one branch. Margin is gross-only (excl. salary), matching
 * the rest of the app.
 */

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
}

export interface PortfolioSummary {
  totalRevenueCurrent: number
  totalRevenuePrevious?: number
  revenueChangePct?: number  // signed
  bestBranchName?: string
  bestBranchReason?: string  // e.g. "Margin 35% vs target 32%"
}

// --- helpers -------------------------------------------------------------

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

function buildDaily(rows: Array<Record<string, unknown>>, targets: BranchTargets, isHotel: boolean): DailyRow[] {
  return rows.map((r) => {
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
    return {
      date: String(r.metric_date),
      revenue,
      adr,
      occupancy: occ,
      revpar,
      customers: covers,
      avgTicket,
      margin,
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
  weekScore: WeekScore,
): string {
  const primary = isHotel ? current.avgAdr : current.avgMargin
  const target = isHotel ? targets.adr : targets.margin
  const fmtPct = (n: number) => Math.round(n)

  if (weekScore === 'on-track') {
    if (previous) {
      const prevPrimary = isHotel ? previous.avgAdr : previous.avgMargin
      if (primary != null && prevPrimary != null) {
        const delta = primary - prevPrimary
        if (delta > 0) {
          return isHotel
            ? `ADR เฉลี่ยดีขึ้นจากสัปดาห์ก่อน — รักษาระดับและทบทวนช่องทาง direct booking`
            : `Margin ดีขึ้นจากสัปดาห์ก่อน — รักษาแนวทางควบคุมต้นทุนต่อไป`
        }
      }
    }
    return isHotel
      ? `ผลประกอบการอยู่ในเกณฑ์เป้าหมาย — ทบทวนช่องทางที่ทำผลงานดีสุดเพื่อขยายผล`
      : `Margin เป็นไปตามเป้า — ตรวจสอบรายการที่กำไรสูงสุดเพื่อเพิ่มสัดส่วน`
  }

  if (isHotel) {
    if (primary != null && target != null && target > 0) {
      const gap = target - primary
      return `ADR ต่ำกว่าเป้าเฉลี่ย ฿${fmtPct(gap)} — ลองโปรโมต direct booking หรือปรับราคาช่วงสุดสัปดาห์เพื่อปิดช่องว่างนี้สัปดาห์หน้า`
    }
    return `ADR ยังต่ำกว่าเป้า — ทบทวนกลยุทธ์ราคาและช่องทางจองสัปดาห์หน้า`
  }

  if (primary != null && target != null) {
    const gap = target - primary
    return `Margin ต่ำกว่าเป้า ${fmtPct(gap)} จุด — ตรวจสอบต้นทุนวัตถุดิบและของเสีย; ทดลองปรับเมนูกำไรสูงในสัปดาห์หน้า`
  }
  return `Margin ยังต่ำกว่าเป้า — ตรวจสอบต้นทุนรายวันและสัดส่วนเมนู`
}

// --- public API ----------------------------------------------------------

export function buildBranchReport(args: {
  branchId: string
  branchName: string
  branchType: 'accommodation' | 'fnb'
  weekStart: Date
  weekEnd: Date
  /** All rows for the 14-day window, ordered ascending. */
  rows: Array<Record<string, unknown>>
  /** Bangkok ISO start date (YYYY-MM-DD) of the current 7-day window. */
  currentStartStr: string
  targets: BranchTargets
  locale: 'th' | 'en'
}): BranchReport | null {
  const currentRows = args.rows.filter((r) => String(r.metric_date) >= args.currentStartStr)
  if (!currentRows.length) return null
  const previousRows = args.rows.filter((r) => String(r.metric_date) < args.currentStartStr)

  const current = aggregateWeek(currentRows)
  const previous = previousRows.length > 0 ? aggregateWeek(previousRows) : undefined
  const isHotel = args.branchType === 'accommodation'
  const daily = buildDaily(currentRows, args.targets, isHotel)
  const weekScore = scoreWeek(current, args.targets, isHotel)
  const recommendation = buildRecommendation(current, previous, args.targets, isHotel, weekScore)

  const dateFmt = args.locale === 'th' ? 'th-TH' : 'en-GB'
  const weekStartLabel = args.weekStart.toLocaleDateString(dateFmt, { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' })
  const weekEndLabel = args.weekEnd.toLocaleDateString(dateFmt, { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' })

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
