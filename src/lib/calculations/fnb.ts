export function calculateAvgSpend(revenue: number, covers: number): number {
  if (covers <= 0) return 0
  return revenue / covers
}

export function calculateGrossMargin(revenue: number, cost: number): number {
  if (revenue <= 0) return 0
  return ((revenue - cost) / revenue) * 100
}

/**
 * Net margin = (revenue - variable cost - daily salary) / revenue.
 * The honest number for SME owners: what they actually keep after both
 * ingredients AND payroll. Returns null when any input is missing so
 * callers can render gaps rather than fabricate signal.
 */
export function calculateNetMargin(
  revenue: number,
  variableCost: number | null,
  monthlySalary: number,
  operatingDays: number,
): number | null {
  if (!revenue || revenue <= 0) return null
  if (variableCost == null || variableCost <= 0) return null
  if (!monthlySalary || monthlySalary <= 0) return null
  if (!operatingDays || operatingDays <= 0) return null

  const dailySalaryCost = monthlySalary / operatingDays
  const netMargin = ((revenue - variableCost - dailySalaryCost) / revenue) * 100

  // Sanity band: a net margin outside −100..+80 almost certainly means
  // one of the inputs is wrong (unit mismatch, mis-entered cost, etc.).
  // Prefer a null (chart gap) over a misleading spike.
  if (netMargin > 80 || netMargin < -100) return null
  return Math.round(netMargin * 10) / 10
}

/**
 * Strict gross margin — returns null instead of 0 for bad inputs so it
 * can drive chart gaps. Use this for Trends/Home displays; the simpler
 * `calculateGrossMargin` above is kept for the entry-form live preview.
 */
export function calculateGrossMarginStrict(
  revenue: number,
  variableCost: number | null,
): number | null {
  if (!revenue || revenue <= 0) return null
  if (variableCost == null || variableCost <= 0) return null
  const pct = (1 - variableCost / revenue) * 100
  if (pct > 85 || pct < 0) return null
  return Math.round(pct * 10) / 10
}

/**
 * Pick the right margin to show for a given day.
 *
 * - Both cost + salary available  → `net` margin (preferred).
 * - Cost available, salary missing → `gross` margin with a flag so the
 *   UI can prompt the owner to set salary for the honest number.
 * - No cost data                    → `none`, caller should show a gap.
 */
export type DisplayMarginType = 'net' | 'gross' | 'none'
export interface DisplayMargin {
  value: number | null
  type: DisplayMarginType
}

export function getDisplayMargin(
  revenue: number,
  variableCost: number | null,
  monthlySalary: number,
  operatingDays: number,
): DisplayMargin {
  if (variableCost != null && variableCost > 0 && monthlySalary > 0 && operatingDays > 0) {
    return {
      value: calculateNetMargin(revenue, variableCost, monthlySalary, operatingDays),
      type: 'net',
    }
  }
  if (variableCost != null && variableCost > 0) {
    return { value: calculateGrossMarginStrict(revenue, variableCost), type: 'gross' }
  }
  return { value: null, type: 'none' }
}

export function calculateCOGSPct(cost: number, revenue: number): number {
  if (revenue <= 0) return 0
  return (cost / revenue) * 100
}

export function calculateDailySalaryCost(monthlySalary: number, operatingDays: number): number {
  if (operatingDays <= 0) return 0
  return monthlySalary / operatingDays
}

export function calculateMinCoversForLabourTarget(
  dailyCost: number,
  labourTargetPct: number,
  avgSpend: number
): number {
  if (labourTargetPct <= 0 || avgSpend <= 0) return 0
  const minRevenue = dailyCost / (labourTargetPct / 100)
  return Math.ceil(minRevenue / avgSpend)
}

export function calculateRolling7DayAvgCost(
  costEntries: { date: string; cost: number | null }[]
): number {
  const validCosts = costEntries
    .filter((e) => e.cost != null && e.cost > 0)
    .map((e) => e.cost as number)
  if (validCosts.length === 0) return 0
  return validCosts.reduce((sum, c) => sum + c, 0) / validCosts.length
}
