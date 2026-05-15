'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toBangkokDateStr } from '@/lib/businessDate'

export interface BranchDailyMetric {
  id: string
  branch_id: string
  organization_id: string
  metric_date: string
  revenue: number
  adr: number | null
  occupancy_rate: number | null
  revpar: number | null
  rooms_sold: number | null
  rooms_available: number | null
  customers: number | null
  avg_ticket: number | null
  avg_cost: number | null
  margin: number | null
  health_score: number | null
  additional_cost_today: number | null
  profitability: number | null
  staff_count: number | null
  created_at: string
}

export function useBranchMetrics(
  branchId: string | undefined,
  days: 30 | 90
): {
  data: BranchDailyMetric[]
  loading: boolean
  error: string | null
} {
  const [data, setData] = useState<BranchDailyMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!branchId) return
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any)
      .from('branch_daily_metrics')
      .select('*')
      .eq('branch_id', branchId)
      .gte('metric_date', toBangkokDateStr(startDate.toISOString()))
      .order('metric_date', { ascending: true })
      .then(({ data: rows, error: err }: { data: BranchDailyMetric[] | null; error: { message: string } | null }) => {
        if (err) setError(err.message)
        else setData(rows || [])
        setLoading(false)
      })
  }, [branchId, days])

  return { data, loading, error }
}
