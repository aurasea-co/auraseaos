'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getEntryTable } from '@/lib/supabase/entry-tables'
import { getTodayBangkok } from '@/lib/businessDate'
import {
  computeOperationalCompleteness,
  isFnbRowOperational,
  isHotelRowOperational,
  type OperationalCompleteness,
  type FnbOperationalRow,
  type HotelOperationalRow,
} from '@/lib/calculations/operationalCompleteness'

/**
 * Fetches 37 days of entries (30-day window + 7 days of lookback for the
 * streak calculation) and returns Metric A — operational completeness.
 * Drives the page-title pill on Home, Trends, Labour, Portfolio, Pricing.
 */
export function useOperationalCompleteness(
  branchId: string | undefined,
  businessType: 'fnb' | 'accommodation' | undefined,
  refreshKey: number | string = 0,
): { completeness: OperationalCompleteness | null; loading: boolean } {
  const [completeness, setCompleteness] = useState<OperationalCompleteness | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!branchId || !businessType) {
      setCompleteness(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const today = getTodayBangkok()
    const start = new Date(today + 'T00:00:00')
    start.setDate(start.getDate() - 36)
    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
    const table = getEntryTable(businessType)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const columns = businessType === 'fnb'
      ? 'metric_date, revenue, total_customers'
      : 'metric_date, revenue, rooms_sold'
    db.from(table)
      .select(columns)
      .eq('branch_id', branchId)
      .gte('metric_date', startStr)
      .then(({ data }: { data: (FnbOperationalRow | HotelOperationalRow)[] | null }) => {
        const rows = data || []
        const result = businessType === 'fnb'
          ? computeOperationalCompleteness(rows as FnbOperationalRow[], isFnbRowOperational, today)
          : computeOperationalCompleteness(rows as HotelOperationalRow[], isHotelRowOperational, today)
        setCompleteness(result)
        setLoading(false)
      })
  }, [branchId, businessType, refreshKey])

  return { completeness, loading }
}
