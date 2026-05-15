export interface PricingScenario {
  label: string
  adr: number
  estimatedRooms: number
  estimatedRevenue: number
  revenueVsCurrentADR: number
  weeklyTargetDelta: number
  isRecommended: boolean
}

export function generateScenarios(
  currentADR: number,
  currentRoomsSold: number,
  totalRooms: number,
  adrTarget: number,
  historicalElasticity: number = 0.8
): PricingScenario[] {
  const adjustments = [-0.15, -0.10, -0.05, 0, 0.05]
  const currentRevenue = currentADR * currentRoomsSold

  const scenarios = adjustments.map((adj) => {
    const newADR = Math.round(currentADR * (1 + adj))
    const demandChange = -adj * historicalElasticity
    const estimatedRooms = Math.min(
      totalRooms,
      Math.max(0, Math.round(currentRoomsSold * (1 + demandChange)))
    )
    const estimatedRevenue = newADR * estimatedRooms

    return {
      label:
        adj === 0
          ? 'ราคาปัจจุบัน'
          : adj < 0
          ? `ลด ${Math.abs(adj * 100)}%`
          : `เพิ่ม ${adj * 100}%`,
      adr: newADR,
      estimatedRooms,
      estimatedRevenue,
      revenueVsCurrentADR: estimatedRevenue - currentRevenue,
      weeklyTargetDelta: estimatedRevenue - adrTarget * (totalRooms * 0.8),
      isRecommended: false,
    }
  })

  // Recommend highest revenue scenario (excluding extreme -15%)
  const candidates = scenarios.filter((s) => s.label !== 'ลด 15%')
  const maxRevenue = Math.max(...candidates.map((s) => s.estimatedRevenue))

  return scenarios.map((s) => ({
    ...s,
    isRecommended: s.estimatedRevenue === maxRevenue && s.label !== 'ลด 15%',
  }))
}

export function calculateHistoricalElasticity(
  metrics: { adr: number | null; rooms_sold: number | null }[]
): number {
  const valid = metrics.filter(
    (m) => m.adr != null && m.adr > 0 && m.rooms_sold != null && m.rooms_sold > 0
  ) as { adr: number; rooms_sold: number }[]

  if (valid.length < 14) return 0.8

  const changes = valid.slice(1).map((m, i) => ({
    adrChange: (m.adr - valid[i].adr) / valid[i].adr,
    roomsChange: (m.rooms_sold - valid[i].rooms_sold) / valid[i].rooms_sold,
  })).filter((c) => c.adrChange !== 0)

  if (changes.length === 0) return 0.8

  const avgElasticity =
    changes.reduce((sum, c) => sum + Math.abs(c.roomsChange / c.adrChange), 0) /
    changes.length

  return Math.min(1.5, Math.max(0.3, avgElasticity))
}
