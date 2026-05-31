// Plan-feature gate. Single source of truth for "does plan X include
// feature Y?" — read by the dashboard, the morning-flash brief, and the
// /api/line/approve-rate endpoint (which re-checks at click time so a
// Pro→Growth downgrade can't leave stale approval tokens clickable).
//
// Hotel features today:
//   - line_brief             : morning LINE flash (all plans)
//   - competitor_monitoring  : daily competitor rate logging + signals
//   - auto_push              : one-tap rate approval via LINE → PMS
//                              (write-back to PMS lands in Phase R3)

export type Plan = 'starter' | 'growth' | 'pro' | 'enterprise'

export type HotelFeatureKey =
  | 'line_brief'
  | 'competitor_monitoring'
  | 'auto_push'

const HOTEL_PLAN_FEATURES: Record<Plan, ReadonlyArray<HotelFeatureKey>> = {
  starter:    ['line_brief'],
  growth:     ['line_brief', 'competitor_monitoring'],
  pro:        ['line_brief', 'competitor_monitoring', 'auto_push'],
  enterprise: ['line_brief', 'competitor_monitoring', 'auto_push'],
}

// Returns false for unknown plan strings rather than throwing. Plan
// strings come from the DB and we'd rather a missing feature than a
// 500 if someone seeds a weird value.
export function hasFeature(plan: string | null | undefined, feature: HotelFeatureKey): boolean {
  if (!plan) return false
  const features = HOTEL_PLAN_FEATURES[plan as Plan]
  if (!features) return false
  return features.includes(feature)
}
