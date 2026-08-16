// Read a scan's blurred summary through the caller's own RLS client.
//
// No service role here, and that is the point: every row this touches is
// readable by its owner under migration 043's policies, so a stranger asking
// for someone else's scanId gets nothing back rather than a redacted preview
// of a menu that is not theirs.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TrafficLight } from '@/lib/menudesk/engine'
import { summarize, type BlurredScanSummary, type ScanStatus } from './summary'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = any

/**
 * The scan's status and its redacted ranking, or null when the caller does not
 * own it (or it does not exist — deliberately the same answer, so this cannot
 * be used to test whether a scan id is real).
 */
export async function readBlurredSummary(
  userClient: SupabaseClient,
  scanId: string,
): Promise<BlurredScanSummary | null> {
  const db = userClient as UntypedClient

  const { data: scan } = await db
    .from('menu_scans')
    .select('id, status')
    .eq('id', scanId)
    .maybeSingle()

  if (!scan) return null

  const status = scan.status as ScanStatus

  const { data: dishes } = await db
    .from('scanned_dishes')
    .select('id')
    .eq('scan_id', scanId)

  const dishIds: string[] = (dishes ?? []).map((d: { id: string }) => d.id)
  if (dishIds.length === 0) return summarize(status, [], 0)

  // Only the traffic light is selected. Selecting the row and picking fields
  // later is how a name ends up in a payload by accident.
  const { data: analyses } = await db
    .from('dish_analyses')
    .select('traffic_light')
    .in('dish_id', dishIds)

  const lights: TrafficLight[] = (analyses ?? []).map(
    (a: { traffic_light: TrafficLight }) => a.traffic_light,
  )

  return summarize(status, lights, dishIds.length)
}
