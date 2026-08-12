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
//   7. Look up demand_calendar (migration 039) once for the WHOLE
//      window (history start .. tomorrow, +/- a few days' margin for
//      bridge/long-weekend lookups near the edges): global holidays/
//      festivals plus this org/branch's own entries. Feeds TWO things
//      now (Tier 1 "Calendar & Context" — see classify.ts):
//        (a) a per-date exclusion set so computeWeekdayBaseline doesn't
//            let a holiday Sunday pollute "what a normal Sunday looks
//            like",
//        (b) a bounded, conservative forward demand signal for
//            TOMORROW (the night the rec applies to), fed into
//            recommendPerRoomTypeRates so an imminent holiday/long
//            weekend/bridge day biases toward hold/raise instead of a
//            cut. The tomorrow-only event used for the action line's
//            informational note is unchanged.
//   8. Run summarizePerRoomRates → the deterministic template fallback,
//      then resolveTodaysAction() tries to upgrade it to an LLM-
//      generated situational line (best-effort — see llm-action.ts),
//      reusing a cached/persisted result when this branch's action for
//      tonight was already resolved by an earlier recipient this
//      morning. dailyAction is always non-null when perRoomRates is
//      non-empty — the template fallback guarantees that.
//   9. Read branch_pms_config + org plan → computed gating flags
//      (canShowApprove, showAwaitingPmsNote).
//
// Pure-ish: I/O via the supabase client, but no mutation of inputs
// and no hidden side effects beyond the documented upsert.

import {
  recommendPerRoomTypeRates,
  summarizePerRoomRates,
  deriveDayContext,
  toRecommendationInputs,
  attachCompetitorRates,
  detectCompetitorUndercutting,
  detectOverpricing,
  type PerRoomTypeRate,
  type DailyAction,
  type DailyActionContext,
  type DerivedDayContext,
  type RecommendationInput,
} from './engine'
import {
  upsertBranchRateRecommendations,
  toPerRoomTypeRate,
  type BranchRateRecommendationRow,
} from './persistence'
import { readDailyAction, writeDailyAction } from './action-persistence'
import { generateTodaysAction, type TodaysActionFacts } from './llm-action'
import { deriveRoomTypesFromBreakdowns } from './room-types'
import {
  canShowLiveApproveButton,
  shouldShowAwaitingPmsNote,
} from '@/lib/ratedesk/auto-push-gating'
import { getDemandCalendarForBranch, pickPrimaryEvent } from '@/lib/demand-calendar/queries'
import { classifyCalendarContext, datesToExcludeFromBaseline } from '@/lib/demand-calendar/classify'

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
  /** Same underlying "what does this weekday normally do" computation
   *  that feeds dailyAction's text, exposed as raw fields so a caller
   *  can build its own layout (e.g. the LINE brief's occupancy-vs-norm
   *  verdict line + context pill) instead of parsing dailyAction's
   *  prose. Null when recInputs is empty. */
  weekdayContext: DerivedDayContext | null
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

/** In-memory, single-cron-run cache so a branch with N recipients
 *  (owner + assigned managers) resolves "today's action" ONCE, not N
 *  times — the caller (route.tsx) creates one Map per handleMorningFlash
 *  invocation and passes the same instance into every loadPerRoomRecsForBranch
 *  call. Keyed by branch_id only: params.today is constant for the whole
 *  run, and a branch's rate/occupancy facts for a given night don't
 *  change between recipients, so there's nothing recipient-specific to
 *  key on. */
export type ActionCache = Map<string, DailyAction | null>

interface LoaderParams {
  branchId: string
  /** Display name fed to the LLM prompt (never persisted elsewhere on
   *  this row) — purely for phrasing, not an identifier. */
  branchName: string
  /** Needed to resolve org-wide demand_calendar rows for this branch
   *  (see getDemandCalendarForBranch) — branches.organization_id, not
   *  a separate lookup. */
  organizationId: string
  /** branches.province — matches provincial demand_calendar rows (see
   *  classify.ts's geography match). Null/omitted when the branch
   *  hasn't set a province; only nationwide (province-null) calendar
   *  rows apply then. */
  branchProvince?: string | null
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
  /** See ActionCache. Optional — omitting it just means every call
   *  resolves independently (still correct, just loses the
   *  once-per-branch-per-morning dedup across recipients). */
  actionCache?: ActionCache
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

  // ── 3c. Demand calendar (Tier 1 "Calendar & Context") ──
  // One fetch covers the WHOLE window: the trailing history (fromIso..
  // today, for baseline exclusion) plus tomorrow (for the forward
  // signal) plus a few days' margin either side so bridge-day/long-
  // weekend/return-day lookups near the window edges see their
  // neighbouring holidays. Never fails the load — getDemandCalendarForBranch
  // already degrades to [] on error, which just means no exclusion and
  // no forward signal, not a crash.
  const tomorrow = addOneDay(params.today)
  const calendarFromDate = addDays(params.fromIso, -3)
  const calendarToDate = addDays(tomorrow, 3)
  const calendarEvents = await getDemandCalendarForBranch(supabase, {
    organizationId: params.organizationId,
    branchId: params.branchId,
    fromDate: calendarFromDate,
    toDate: calendarToDate,
  })
  const branchLocation = { province: params.branchProvince ?? null }

  // (a) Baseline exclusion — every historical date actually in the
  // engine's window, so computeWeekdayBaseline doesn't let a holiday
  // Sunday count toward "what a normal Sunday looks like".
  const excludeDatesFromBaseline = datesToExcludeFromBaseline(
    recInputs.map((d) => d.date),
    calendarEvents,
    branchLocation,
  )

  // (b) Forward demand signal for TOMORROW — the night the rec applies
  // to. Conservative + bounded (see classify.ts); feeds the engine
  // below so an imminent holiday/long weekend/bridge day biases toward
  // hold/raise instead of a cut.
  const demandContext = classifyCalendarContext(tomorrow, calendarEvents, branchLocation).demandSignal

  // ── 4. Run engine + upsert + read-back ──
  const engineRecs = recommendPerRoomTypeRates(recInputs, { roster, excludeDatesFromBaseline, demandContext })
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
      'branch_id, metric_date, room_type, current_rate_satang, suggested_rate_satang, direction, reason_th, reason_en, calendar_modifier, calendar_reason_th, calendar_reason_en',
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
  // demandCalendarEvent stays TOMORROW-only and purely informational
  // (see DailyActionContext.demandCalendarEvent) — reuses the
  // already-fetched calendarEvents rather than a second query.
  const primaryDemandEvent = pickPrimaryEvent(
    calendarEvents.filter((e) => e.startDate <= tomorrow && tomorrow <= e.endDate),
  )

  const dailyActionContext: DailyActionContext = {
    inputs: recInputs,
    targetOccupancy: params.targetOccupancy ?? null,
    demandCalendarEvent: primaryDemandEvent
      ? { nameTh: primaryDemandEvent.nameTh, nameEn: primaryDemandEvent.nameEn }
      : null,
    excludeDatesFromBaseline,
  }
  // Deterministic fallback — computed unconditionally, before any LLM
  // attempt. The "brief must always send" hard requirement means this
  // has to exist and be ready BEFORE we try the LLM, not be synthesised
  // only after a failure.
  const templateAction = summarizePerRoomRates(perRoomRates, dailyActionContext)
  // Same context object → deriveDayContext recomputes nothing new, just
  // exposes the numbers/strings dailyAction already baked into prose.
  const weekdayContext = deriveDayContext(dailyActionContext)

  const dailyAction = await resolveTodaysAction(supabase, {
    branchId: params.branchId,
    branchName: params.branchName,
    metricDate: params.today,
    templateAction,
    weekdayContext,
    perRoomRates,
    recInputs,
    demandCalendarEvent: dailyActionContext.demandCalendarEvent ?? null,
    cache: params.actionCache,
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
    weekdayContext,
    recInputs,
    canShowApprove: canShowLiveApproveButton({ plan: params.plan, pmsConfig }),
    showAwaitingPmsNote: shouldShowAwaitingPmsNote({ plan: params.plan, pmsConfig }),
  }
}

// Mirrors the morning-flash route's own block-D competitor callout logic
// (single most relevant signal — undercut wins the tie-break) so the
// fact fed to the LLM never disagrees with what the Flex message
// actually shows next to it. Both read the same recInputs instance, so
// there's no risk of the two computations landing on different data.
function pickCompetitorCallout(
  recInputs: ReadonlyArray<RecommendationInput>,
): TodaysActionFacts['competitorCallout'] {
  const undercut = detectCompetitorUndercutting(recInputs as RecommendationInput[])[0] ?? null
  const overpriced = detectOverpricing(recInputs as RecommendationInput[])[0] ?? null
  const signal = undercut ?? overpriced
  if (!signal) return null
  const supportingData = signal.supportingData as { topCompetitor?: string; gapThb?: number }
  const name = supportingData.topCompetitor
  if (!name) return null
  return {
    name,
    gapThb: Math.abs(Number(supportingData.gapThb ?? 0)),
    direction: undercut ? 'higher' : 'lower',
  }
}

/** Resolves "today's action" for one branch/night: reuses a cached or
 *  previously-persisted result when available, otherwise attempts the
 *  LLM generator with the deterministic template ready as the fallback,
 *  then caches + persists whichever line was actually used. Never
 *  throws, never returns null when templateAction is non-null — the
 *  worst case is "the template line, because the LLM path was skipped
 *  or failed", never "no action line at all" or "an unvalidated one". */
export async function resolveTodaysAction(
  supabase: SupabaseLike,
  params: {
    branchId: string
    branchName: string
    metricDate: string
    templateAction: DailyAction | null
    weekdayContext: DerivedDayContext | null
    perRoomRates: PerRoomTypeRate[]
    recInputs: RecommendationInput[]
    demandCalendarEvent: { nameTh: string; nameEn: string } | null
    cache?: ActionCache
  },
): Promise<DailyAction | null> {
  const cacheKey = params.branchId

  if (params.cache?.has(cacheKey)) {
    return params.cache.get(cacheKey) ?? null
  }

  // Cross-invocation reuse: this branch's action for tonight may already
  // have been resolved and written by an earlier recipient in THIS same
  // cron tick (the in-memory cache only covers calls within one
  // recipient loop iteration of the SAME process — this covers the
  // actual "N recipients" case) or a prior retry of today's run. A
  // branch's facts for a given night are fixed, so reusing here is
  // always correct, never stale.
  const persisted = await readDailyAction(supabase, params.branchId, params.metricDate)
  if (persisted) {
    params.cache?.set(cacheKey, persisted.dailyAction)
    return persisted.dailyAction
  }

  // Nothing to say — mirrors summarizePerRoomRates's own contract
  // (empty rate set → null). Nothing to persist either.
  if (!params.templateAction || params.perRoomRates.length === 0) {
    params.cache?.set(cacheKey, null)
    return null
  }

  let resolved: DailyAction = params.templateAction
  let source: 'llm' | 'template' = 'template'
  let model: string | null = null
  let latencyMs: number | null = null

  // Only attempt the LLM when there's enough history for deriveDayContext
  // to have produced real signals (occupancy, weekday norm, trend) — with
  // no context the facts object would be nearly empty and the model
  // would have little more to work with than the template already
  // encodes, so it's not worth the latency/cost.
  if (params.weekdayContext) {
    const wc = params.weekdayContext
    const latestInput = params.recInputs[params.recInputs.length - 1]
    const adrThb = Math.round(latestInput?.adrThb ?? 0)
    const revparThb = Math.round(adrThb * (wc.occPct / 100))

    const facts: TodaysActionFacts = {
      branchName: params.branchName,
      occupancyPct: wc.occPct,
      weekdayNorm:
        wc.weekdayOccupancyBaseline != null && wc.todayVsWeekdayNorm != null && wc.weekdayNameTh != null
          ? {
              weekdayNameTh: wc.weekdayNameTh,
              baselinePct: wc.weekdayOccupancyBaseline,
              todayVsNormPct: wc.todayVsWeekdayNorm,
            }
          : null,
      trend: wc.trend,
      isWeekend: wc.isWeekend,
      belowTargetPct: wc.belowTargetPct,
      adrThb,
      revparThb,
      perRoomRates: params.perRoomRates.map((r) => ({
        roomType: r.roomType,
        currentRateThb: r.currentRateThb,
        suggestedRateThb: r.suggestedRateThb,
        direction: r.direction,
      })),
      competitorCallout: pickCompetitorCallout(params.recInputs),
      demandCalendarEvent: params.demandCalendarEvent,
    }

    const llmResult = await generateTodaysAction(facts)
    if (llmResult) {
      resolved = llmResult.action
      source = 'llm'
      model = llmResult.model
      latencyMs = llmResult.latencyMs
    }
  }

  params.cache?.set(cacheKey, resolved)
  await writeDailyAction(supabase, {
    branchId: params.branchId,
    metricDate: params.metricDate,
    action: resolved,
    source,
    model,
    latencyMs,
  })

  return resolved
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function addOneDay(dateStr: string): string {
  return addDays(dateStr, 1)
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
