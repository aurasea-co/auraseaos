// Single source of truth for "what are today's per-room rate recs
// for branch X?". Used by the morning-flash job for both the LINE
// brief and the email template — neither should recompute, both
// should read from the same in-memory result here.
//
// Pipeline (per accommodation branch, per cron tick):
//   1. Pull last 31 days of accommodation_daily_metrics.room_type_
//      breakdown (the canonical source of per-day per-type occupancy
//      + rates).
//   2. Pull last 31 days of competitor_rates so the engine's
//      undercut/overpricing signals can fire when data exists.
//   3. Project the (already-fetched) 30-day branch_daily_metrics rows
//      into engine inputs, merging the breakdown by metric_date.
//   4. Run recommendPerRoomTypeRates → engineRecs.
//   5. Upsert engineRecs to branch_rate_recommendations.
//   6. Read back from the table → perRoomRates. The DB is the source
//      of truth so an owner's dashboard override is what reaches the
//      brief/email.
//   7. Look up demand_calendar (migration 039) for TOMORROW — global
//      holidays/festivals plus this org/branch's own entries. Purely
//      informational context for the action line, never feeds the
//      rate math.
//   8. Run summarizePerRoomRates → dailyAction.
//   9. Read branch_pms_config + org plan → computed gating flags
//      (canShowApprove, showAwaitingPmsNote).
//
// Pure-ish: I/O via the supabase client, but no mutation of inputs
// and no hidden side effects beyond the documented upsert.

import {
  recommendPerRoomTypeRates,
  summarizePerRoomRates,
  toRecommendationInputs,
  attachCompetitorRates,
  type PerRoomTypeRate,
  type DailyAction,
  type RecommendationInput,
} from './engine'
import {
  upsertBranchRateRecommendations,
  toPerRoomTypeRate,
  type BranchRateRecommendationRow,
} from './persistence'
import { deriveRoomTypesFromBreakdowns } from './room-types'
import {
  canShowLiveApproveButton,
  shouldShowAwaitingPmsNote,
} from '@/lib/ratedesk/auto-push-gating'
import { getDemandCalendarForBranch, pickPrimaryEvent } from '@/lib/demand-calendar/queries'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export interface PerBranchHotelRecs {
  /** DB-sourced rate sheet (post upsert + read-back). Empty array
   *  when the branch has no breakdown jsonb on any of the last 31
   *  days — legacy single-room hotels or new branches that haven't
   *  imported per-type CSV yet. */
  perRoomRates: PerRoomTypeRate[]
  /** Plain-language "today's action" line synthesised from the rate
   *  sheet. Null only when perRoomRates is empty. */
  dailyAction: DailyAction | null
  /** Engine inputs used to feed the per-room recommendation engine.
   *  Passed back so the caller can run other engine functions
   *  (forecastTomorrow, generateDailyRecommendations) without
   *  refetching anything. */
  recInputs: RecommendationInput[]
  /** True when both Auto Push gates pass: plan includes auto_push AND
   *  a connected adapter advertises supports_write_back. */
  canShowApprove: boolean
  /** True when the plan has auto_push but no write-back adapter is
   *  connected — the brief shows the "Auto Push activates once a
   *  supported PMS is connected" note. */
  showAwaitingPmsNote: boolean
}

interface LoaderParams {
  branchId: string
  /** Needed to resolve org-wide demand_calendar rows for this branch
   *  (see getDemandCalendarForBranch) — branches.organization_id, not
   *  a separate lookup. */
  organizationId: string
  /** Bangkok-day metric_date for the morning brief — the upsert keys
   *  onto this so re-running same-day is idempotent. */
  today: string
  /** ISO date (YYYY-MM-DD) for the 31-day fetch window — caller
   *  computes this once per recipient pass so the competitor_rates +
   *  accommodation_daily_metrics queries land on the same anchor. */
  fromIso: string
  /** Already-fetched 30-day branch_daily_metrics rows. Reused so we
   *  don't re-issue the query. */
  metrics: ReadonlyArray<Record<string, unknown>>
  /** Org plan string — drives the Auto Push plan gate. */
  plan: string | null
  /** Branch occupancy target (0..1 fraction or 0..100 percent — the
   *  action-line builder normalises). Drives the "X pts below target"
   *  framing in the daily action. Optional. */
  targetOccupancy?: number | null
}

export async function loadPerRoomRecsForBranch(
  supabase: SupabaseLike,
  params: LoaderParams,
): Promise<PerBranchHotelRecs> {
  // ── 1. Room-type breakdown from accommodation_daily_metrics ──
  interface BreakdownEntry {
    roomType: string
    totalRooms: number
    occupiedRooms: number
    rateThb: number
  }
  const { data: accomBreakdownRows } = await supabase
    .from('accommodation_daily_metrics')
    .select('metric_date, room_type_breakdown')
    .eq('branch_id', params.branchId)
    .gte('metric_date', params.fromIso)

  const breakdownByDate = new Map<string, BreakdownEntry[]>()
  for (const row of (accomBreakdownRows ?? []) as Array<{
    metric_date: string
    room_type_breakdown: unknown
  }>) {
    const raw = row.room_type_breakdown
    if (!Array.isArray(raw) || raw.length === 0) continue
    const cleaned: BreakdownEntry[] = []
    for (const b of raw as Array<Record<string, unknown>>) {
      if (!b || typeof b !== 'object') continue
      const roomType = typeof b.roomType === 'string' ? b.roomType : null
      const totalRooms = Number(b.totalRooms)
      const occupiedRooms = Number(b.occupiedRooms)
      const rateThb = Number(b.rateThb)
      if (
        !roomType ||
        !Number.isFinite(totalRooms) ||
        !Number.isFinite(occupiedRooms) ||
        !Number.isFinite(rateThb)
      ) continue
      cleaned.push({ roomType, totalRooms, occupiedRooms, rateThb })
    }
    if (cleaned.length > 0) {
      breakdownByDate.set(String(row.metric_date), cleaned)
    }
  }

  // ── 2. Competitor rates over the same window ──
  // channel is selected (and threaded through the cast below) so the
  // engine's OTA-only comparison (isOtaChannel in engine.ts) can
  // actually see it — a walk-in/package/promo row must never be
  // silently folded into the "guests see this online" gap.
  const { data: compRows } = await supabase
    .from('competitor_rates')
    .select('competitor_name, rate, captured_at, channel')
    .eq('branch_id', params.branchId)
    .gte('captured_at', params.fromIso)

  // ── 3. Project metrics → engine inputs with merged breakdowns ──
  const baseInputs = toRecommendationInputs(
    params.metrics.map((m) => {
      const metricDate = String((m as { metric_date: string }).metric_date)
      const breakdown = breakdownByDate.get(metricDate) ?? null
      return {
        metric_date: metricDate,
        rooms_available: numOrNull(m.rooms_available),
        rooms_sold: numOrNull(m.rooms_sold),
        revenue: numOrNull(m.revenue),
        room_type_breakdown: breakdown,
      }
    }),
  )
  const recInputs = attachCompetitorRates(
    baseInputs,
    (compRows || []) as Array<{
      competitor_name: string
      rate: number | string | null
      captured_at: string
      channel?: string | null
    }>,
  )

  // ── 3b. Authoritative room-type roster ──
  // Derive the COMPLETE set of room types the branch has ever reported
  // across the fetch window (with inventory + last-known rack rate) from
  // the raw accommodation_daily_metrics rows. This is the room-config
  // source the engine prefers as authoritative: it guarantees a row for
  // every known type even on a night a type sold nothing (and was
  // therefore omitted from / zeroed in that day's breakdown). Without
  // it a type that didn't sell would vanish from the sheet.
  const roster = deriveRoomTypesFromBreakdowns(
    (accomBreakdownRows ?? []) as Array<{
      metric_date: string
      room_type_breakdown: Array<{
        roomType: string
        totalRooms?: number | null
        occupiedRooms?: number | null
        rateThb?: number | null
      }> | null
    }>,
  ).map((t) => ({
    roomType: t.roomType,
    inventory: t.inventory,
    rackRateThb: t.latestRateThb,
  }))

  // ── 4. Run engine + upsert + read-back ──
  const engineRecs = recommendPerRoomTypeRates(recInputs, { roster })
  if (engineRecs.length > 0) {
    const upsertResult = await upsertBranchRateRecommendations(supabase, {
      branchId: params.branchId,
      metricDate: params.today,
      recs: engineRecs,
    })
    if (upsertResult.error) {
      console.error(
        `[per-branch-loader] failed to persist branch_rate_recommendations for branch=${params.branchId}:`,
        upsertResult.error,
      )
    }
  }

  let perRoomRates: PerRoomTypeRate[] = engineRecs
  const { data: persistedRows, error: persistedErr } = await supabase
    .from('branch_rate_recommendations')
    .select(
      'branch_id, metric_date, room_type, current_rate_satang, suggested_rate_satang, direction, reason_th, reason_en',
    )
    .eq('branch_id', params.branchId)
    .eq('metric_date', params.today)
  if (persistedErr) {
    console.warn(
      `[per-branch-loader] read-back failed for branch=${params.branchId} — using in-memory engine output:`,
      persistedErr,
    )
  } else if (persistedRows && persistedRows.length > 0) {
    perRoomRates = (persistedRows as BranchRateRecommendationRow[]).map(toPerRoomTypeRate)
  }

  // ── 5. "Today's action" insight ──
  // Pass the engine inputs + occupancy target so the action line is
  // SITUATIONAL (weakest types, trend, weekend/weekday, competitor gap,
  // gap-to-target) rather than a static template keyed only on "low
  // occupancy". Same dailyAction feeds both LINE and email → parity.
  //
  // demand_calendar lookup is for TOMORROW — the night the rec applies
  // to — global holidays/festivals plus this org/branch's own entries.
  // Purely informational (see DailyActionContext.demandCalendarEvent);
  // never fails the whole load if the query errors (getDemandCalendarForBranch
  // already degrades to [] on error).
  const tomorrow = addOneDay(params.today)
  const demandEvents = await getDemandCalendarForBranch(supabase, {
    organizationId: params.organizationId,
    branchId: params.branchId,
    fromDate: tomorrow,
    toDate: tomorrow,
  })
  const primaryDemandEvent = pickPrimaryEvent(demandEvents)

  const dailyAction = summarizePerRoomRates(perRoomRates, {
    inputs: recInputs,
    targetOccupancy: params.targetOccupancy ?? null,
    demandCalendarEvent: primaryDemandEvent
      ? { nameTh: primaryDemandEvent.nameTh, nameEn: primaryDemandEvent.nameEn }
      : null,
  })

  // ── 6. PMS adapter gating ──
  const { data: pmsConfigRow } = await supabase
    .from('branch_pms_config')
    .select('is_active, supports_write_back')
    .eq('branch_id', params.branchId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const pmsConfig = (pmsConfigRow ?? null) as
    | { is_active: boolean; supports_write_back: boolean }
    | null

  return {
    perRoomRates,
    dailyAction,
    recInputs,
    canShowApprove: canShowLiveApproveButton({ plan: params.plan, pmsConfig }),
    showAwaitingPmsNote: shouldShowAwaitingPmsNote({ plan: params.plan, pmsConfig }),
  }
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function addOneDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
