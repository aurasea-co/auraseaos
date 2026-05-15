'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/providers/user-context'
import type { Target } from '@/lib/supabase/types'

// Columns safe for all roles (no salary data)
const SAFE_COLUMNS = 'id, branch_id, organization_id, adr_target, occ_target, occupancy_target, direct_booking_target, revpar_target, labour_target, covers_target, cogs_target, avg_spend_target, operating_days, labour_alert_threshold, created_at, updated_at'

// All columns (owner only)
const ALL_COLUMNS = SAFE_COLUMNS + ', monthly_salary'

export function useTargets(branchId: string | undefined) {
  const [targets, setTargets] = useState<Target | null>(null)
  const [loading, setLoading] = useState(true)
  const { role } = useUser()

  useEffect(() => {
    if (!branchId) return
    setLoading(true)

    const supabase = createClient()
    const columns = role === 'owner' || role === 'superadmin' ? ALL_COLUMNS : SAFE_COLUMNS

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any)
      .from('targets')
      .select(columns)
      .eq('branch_id', branchId)
      .maybeSingle()
      .then(({ data }: { data: Target | null }) => {
        setTargets(data)
        setLoading(false)
      })
  }, [branchId, role])

  return { targets, loading }
}
