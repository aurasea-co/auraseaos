'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getEntryTable } from '@/lib/supabase/entry-tables'
import { getTodayBangkok } from '@/lib/businessDate'
import {
  computeCostCoverage,
  COST_COVERAGE_WINDOW,
  COST_LOOKBACK_DAYS,
  type CostCoverage,
  type CostCoverageRow,
} from '@/lib/calculations/costCoverage'

/**
 * Fetches 67 days of entries (60-day window + 7-day lookback so the
 * oldest operational day in the window can still be evaluated) and
 * returns Metric B — cost coverage. Drives the in-page section on the
 * Cost tab ONLY.
 */
export function useCostCoverage(
  branchId: string | undefined,
  businessType: 'fnb' | 'accommodation' | undefined,
  refreshKey: number | string = 0,
): { coverage: CostCoverage | null; loading: boolean } {
  const [coverage, setCoverage] = useState<CostCoverage | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!branchId || !businessType) {
      setCoverage(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const today = getTodayBangkok()
    const start = new Date(today + 'T00:00:00')
    start.setDate(start.getDate() - (COST_COVERAGE_WINDOW + COST_LOOKBACK_DAYS - 1))
    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
    const table = getEntryTable(businessType)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    db.from(table)
      .select('metric_date, revenue, additional_cost_today')
      .eq('branch_id', branchId)
      .gte('metric_date', startStr)
      .then(({ data }: { data: CostCoverageRow[] | null }) => {
        setCoverage(computeCostCoverage(data || [], today))
        setLoading(false)
      })
  }, [branchId, businessType, refreshKey])

  return { coverage, loading }
}
