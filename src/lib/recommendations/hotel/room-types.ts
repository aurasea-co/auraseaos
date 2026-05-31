// Room-type derivation — aggregates the unique room types a branch has
// reported in its accommodation_daily_metrics.room_type_breakdown rows
// over the recent past, so the daily-entry form and dashboard can
// surface them as pre-known options instead of asking the owner to
// retype "Suite", "Deluxe5", etc every day.
//
// We don't store room types in a config table. They emerge from the
// CSV-imported breakdown rows; the /settings/rooms page lets the owner
// delete a bad import surgically but cannot ADD a type. Net effect:
// a branch's "registered" types == the set of types present in its
// historical breakdowns.
//
// Returned shape carries the inventory (max totalRooms seen) and the
// latest rate so the form can pre-fill sensible defaults — owners
// typically nudge yesterday's rate ±200 THB rather than typing from
// scratch.

export interface KnownRoomType {
  /** Display label — exactly as it appears in the breakdown. */
  roomType: string
  /** Max totalRooms across all breakdown rows; best-guess inventory. */
  inventory: number
  /** Rate (THB) from the most recent breakdown row carrying this type. */
  latestRateThb: number
  /** Number of historical days this type appeared in — for the UI to
   *  show "Suite · used 5 days" vs "Deluxe2 · used 1 day" confidence. */
  dayCount: number
}

interface BreakdownItem {
  roomType: string
  totalRooms?: number | null
  occupiedRooms?: number | null
  rateThb?: number | null
}

interface BreakdownRow {
  metric_date: string
  room_type_breakdown: BreakdownItem[] | null
}

// Pure aggregation — call with the result of:
//   .from('accommodation_daily_metrics')
//   .select('metric_date, room_type_breakdown')
//   .eq('branch_id', branchId)
//   .order('metric_date', { ascending: false })
//
// Sorted output: most-used types first, then alphabetical within tie.
// The form renders this order so frequently-used types fall above the
// fold.
export function deriveRoomTypesFromBreakdowns(rows: BreakdownRow[]): KnownRoomType[] {
  type Agg = {
    roomType: string
    inventory: number
    latestRateThb: number
    latestSeenDate: string
    dayCount: number
  }
  const byType = new Map<string, Agg>()

  for (const r of rows) {
    if (!Array.isArray(r.room_type_breakdown)) continue
    for (const b of r.room_type_breakdown) {
      const type = b.roomType?.trim()
      if (!type) continue
      const agg = byType.get(type) || {
        roomType: type,
        inventory: 0,
        latestRateThb: 0,
        latestSeenDate: '',
        dayCount: 0,
      }
      agg.inventory = Math.max(agg.inventory, b.totalRooms || 0)
      agg.dayCount += 1
      // Latest rate by metric_date string compare (YYYY-MM-DD sorts
      // lexicographically). Only overwrites when the current row is
      // strictly newer to avoid drifting rates on ties.
      if (r.metric_date > agg.latestSeenDate && (b.rateThb || 0) > 0) {
        agg.latestRateThb = b.rateThb || 0
        agg.latestSeenDate = r.metric_date
      }
      byType.set(type, agg)
    }
  }

  return Array.from(byType.values())
    .sort((a, b) => {
      if (b.dayCount !== a.dayCount) return b.dayCount - a.dayCount
      return a.roomType.localeCompare(b.roomType)
    })
    .map(({ roomType, inventory, latestRateThb, dayCount }) => ({
      roomType,
      inventory,
      latestRateThb,
      dayCount,
    }))
}
