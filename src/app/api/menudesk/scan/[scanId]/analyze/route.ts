// POST /api/menudesk/scan/[scanId]/analyze  → start (or resume) the analysis
// GET  /api/menudesk/scan/[scanId]/analyze  → poll status + blurred summary
//
// Public, in the sense that the funnel is public: no login, no account. The
// caller still has to OWN the scan, which they do by holding the anonymous
// session that created it — every query below runs through the RLS user
// client, so a stranger with someone else's scanId gets a 404.
//
// The GET response is the blurred summary and nothing else. It is the payload
// a curious visitor will read in the network tab, so it is redacted at the
// source rather than in the component: see analysis/summary.ts.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readBlurredSummary } from '@/lib/menudesk/analysis/read-summary'
import { runScan } from '@/lib/menudesk/analysis/run-scan'

/** Vision + recipe calls over several pages comfortably exceed the default. */
export const maxDuration = 120

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  const { scanId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // No session at all means the anonymous sign-in never happened — the scan
  // cannot be theirs, and there is nothing to resume.
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const outcome = await runScan(supabase, scanId)

  if (!outcome.ok) {
    // `already_running` is a success from the caller's point of view: someone
    // is analysing this scan, and polling will show them the result.
    if (outcome.reason === 'already_running') {
      return NextResponse.json({ started: false, reason: outcome.reason })
    }
    const status = outcome.reason === 'not_found' ? 404 : 422
    return NextResponse.json({ error: outcome.reason }, { status })
  }

  return NextResponse.json({ started: true, status: outcome.status })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  const { scanId } = await params
  const supabase = await createClient()

  const summary = await readBlurredSummary(supabase, scanId)
  if (!summary) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json(summary)
}
