// Spine-level read access to demand_calendar (migration 039). Shared
// across verticals — RateDesk reads it here; MenuDesk will reuse the
// same module rather than duplicating the scoping logic.
//
// RLS (see the migration) already restricts a query to rows the
// caller's session is ALLOWED to see: global rows, their own org's
// rows, their own branch's rows. filterRowsForBranch() below is a
// SEPARATE, narrower filter on top of that — it answers "does this row
// actually apply to the ONE branch being asked about", since a user who
// belongs to multiple branches in the same org shouldn't see another
// branch's local events on this branch's calendar.

export type DemandCalendarType =
  | 'public_holiday'
  | 'school_holiday'
  | 'festival'
  | 'local_event'
  | 'owner_event'

export interface DemandCalendarEvent {
  id: string
  /** YYYY-MM-DD, inclusive. */
  startDate: string
  /** YYYY-MM-DD, inclusive — equals startDate for single-day events. */
  endDate: string
  type: DemandCalendarType
  nameTh: string
  nameEn: string
  /** Null = applies nationwide. */
  province: string | null
  /** Signed, clamped -1.00..1.00. Null = not yet assessed. */
  expectedImpactModifier: number | null
  source: string
  confidence: number
  /** Null on a global row. */
  organizationId: string | null
  /** Null on a global or org-wide row. */
  branchId: string | null
}

// Raw row shape as it comes back from Postgres (snake_case, numeric
// columns as strings — the JS pg driver doesn't auto-cast numeric).
export interface DemandCalendarRawRow {
  id: string
  start_date: string
  end_date: string
  type: string
  name_th: string
  name_en: string
  province: string | null
  expected_impact_modifier: number | string | null
  source: string
  confidence: number | string
  organization_id: string | null
  branch_id: string | null
}

/** Pure — filters raw rows to the ones applicable to ONE branch, and
 *  maps snake_case DB columns to the camelCase shape callers use.
 *  Extracted from getDemandCalendarForBranch so it's testable without
 *  a Supabase client. */
export function filterRowsForBranch(
  rows: ReadonlyArray<DemandCalendarRawRow>,
  params: { organizationId: string; branchId: string },
): DemandCalendarEvent[] {
  const { organizationId, branchId } = params
  return rows
    .filter(
      (r) =>
        r.organization_id == null ||
        (r.organization_id === organizationId && (r.branch_id == null || r.branch_id === branchId)),
    )
    .map((r) => ({
      id: r.id,
      startDate: r.start_date,
      endDate: r.end_date,
      type: r.type as DemandCalendarType,
      nameTh: r.name_th,
      nameEn: r.name_en,
      province: r.province,
      expectedImpactModifier: r.expected_impact_modifier != null ? Number(r.expected_impact_modifier) : null,
      source: r.source,
      confidence: Number(r.confidence),
      organizationId: r.organization_id,
      branchId: r.branch_id,
    }))
}

export interface GetDemandCalendarParams {
  organizationId: string
  branchId: string
  /** Inclusive date range, YYYY-MM-DD. */
  fromDate: string
  toDate: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

/** Fetches demand_calendar rows overlapping [fromDate, toDate] that
 *  apply to ONE branch (global ∪ org-wide ∪ branch-specific). Uses
 *  whatever client the caller passes — always the RLS user client in
 *  this codebase, never service role, per the supabaseAdmin rule.
 *  A multi-day event (e.g. Songkran) is included if ANY part of it
 *  overlaps the requested range. Returns [] on a fetch error rather
 *  than throwing — a calendar widget degrading to "no events" beats
 *  crashing the page it's embedded in. */
export async function getDemandCalendarForBranch(
  supabase: SupabaseLike,
  params: GetDemandCalendarParams,
): Promise<DemandCalendarEvent[]> {
  const { organizationId, branchId, fromDate, toDate } = params
  const { data, error } = await supabase
    .from('demand_calendar')
    .select(
      'id, start_date, end_date, type, name_th, name_en, province, expected_impact_modifier, source, confidence, organization_id, branch_id',
    )
    .eq('is_active', true)
    .lte('start_date', toDate)
    .gte('end_date', fromDate)
    .order('start_date', { ascending: true })

  if (error) {
    console.error('[demand-calendar] fetch failed', error)
    return []
  }

  return filterRowsForBranch((data || []) as DemandCalendarRawRow[], { organizationId, branchId })
}

// Priority when multiple events overlap the same day (rare) and a
// caller (e.g. the LINE brief) needs to pick ONE to mention by name.
// Broader-scope / higher-significance types win; ties broken by name
// for determinism.
const EVENT_TYPE_PRIORITY: Record<DemandCalendarType, number> = {
  public_holiday: 0,
  festival: 1,
  school_holiday: 2,
  local_event: 3,
  owner_event: 4,
}

/** Pure — picks the single most notable event from a list for a
 *  narrative mention. Null when the list is empty. */
export function pickPrimaryEvent(
  events: ReadonlyArray<DemandCalendarEvent>,
): DemandCalendarEvent | null {
  if (events.length === 0) return null
  return events
    .slice()
    .sort((a, b) => {
      const pa = EVENT_TYPE_PRIORITY[a.type] ?? 99
      const pb = EVENT_TYPE_PRIORITY[b.type] ?? 99
      if (pa !== pb) return pa - pb
      return a.nameEn.localeCompare(b.nameEn)
    })[0]
}

/** Pure — expands a list of events into the individual YYYY-MM-DD dates
 *  they cover, for callers that need a per-day "is this an event day"
 *  lookup (e.g. a calendar grid) rather than a list of ranges. */
export function demandCalendarDatesInRange(events: ReadonlyArray<DemandCalendarEvent>): Set<string> {
  const dates = new Set<string>()
  for (const e of events) {
    let cursor = new Date(`${e.startDate}T00:00:00Z`)
    const end = new Date(`${e.endDate}T00:00:00Z`)
    while (cursor.getTime() <= end.getTime()) {
      dates.add(cursor.toISOString().slice(0, 10))
      cursor = new Date(cursor.getTime() + 86_400_000)
    }
  }
  return dates
}
