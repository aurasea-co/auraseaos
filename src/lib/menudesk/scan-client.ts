// Browser-side scan creation and upload.
//
// Every call here uses the ordinary RLS user client — there is no service-role
// path in this funnel. That works because the visitor signs in anonymously, so
// they have a real auth.uid() and migration 043's owner policies apply to them
// exactly as they would to a paying user. See that migration's header for why
// anonymous auth was chosen over a privileged server client.

import { createClient } from '@/lib/supabase/client'
import type { PreparedPage } from './capture'

export const SCAN_BUCKET = 'menu-scans'

/**
 * Writes go through an untyped handle, matching what every other write path in
 * this repo does (see settings/notifications/page.tsx, api/invite/accept).
 *
 * src/lib/supabase/types.ts is hand-maintained and does not satisfy the shape
 * supabase-js v2 needs to infer Insert/Update payloads, so every typed write
 * collapses to `never` and fails to compile. Adding `Relationships` to the
 * table entries — the usual culprit — does not fix it; the generated schema
 * shape has moved on further than that. The real fix is regenerating the file
 * with `supabase gen types typescript`, which touches every data access in the
 * codebase and is its own piece of work, not something to smuggle into W1.
 *
 * READS stay typed: the menu_scans / menu_scan_pages Row definitions added to
 * types.ts are real and used by callers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = any

/** Distinguishes "you must switch a setting on" from a genuine failure. */
export class AnonymousAuthDisabledError extends Error {
  constructor() {
    super(
      '[menudesk] Anonymous sign-ins are disabled for this Supabase project. ' +
        'Enable Authentication → Providers → Anonymous Sign-Ins.',
    )
    this.name = 'AnonymousAuthDisabledError'
  }
}

/**
 * The uid the scan belongs to, signing in anonymously if needed.
 *
 * Reuses an existing session when there is one, so a returning visitor keeps
 * their earlier scans, and a signed-in subscriber who lands on /scan files the
 * scan under their real account rather than a throwaway identity.
 */
export async function ensureScanSession(): Promise<string> {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) return user.id

  const { data, error } = await supabase.auth.signInAnonymously()

  if (error) {
    // Supabase reports the disabled provider as a 422 signup-disabled error.
    // Worth naming precisely: it is a project setting, not a bug in the flow,
    // and it is the single most likely reason this fails on a fresh project.
    const status = (error as { status?: number }).status
    if (status === 422 || /anonymous/i.test(error.message)) {
      throw new AnonymousAuthDisabledError()
    }
    throw error
  }

  if (!data.user) throw new Error('[menudesk] anonymous sign-in returned no user')
  return data.user.id
}

export interface CreatedScan {
  scanId: string
  ownerUserId: string
}

export async function createScan(countryCode = 'TH'): Promise<CreatedScan> {
  const ownerUserId = await ensureScanSession()
  const supabase: UntypedClient = createClient()

  const { data, error } = await supabase
    .from('menu_scans')
    .insert({
      owner_user_id: ownerUserId,
      country_code: countryCode,
      status: 'uploading',
    })
    .select('id')
    .single()

  if (error) throw error
  return { scanId: data.id, ownerUserId }
}

/**
 * Upload one prepared page and record it.
 *
 * The storage path opens with the owner's uid because that is precisely what
 * the bucket policies in migration 043 check — `(storage.foldername(name))[1] =
 * auth.uid()::text`. Change this shape and the policies silently stop matching.
 */
export async function uploadPage(
  scan: CreatedScan,
  page: PreparedPage,
  pageIndex: number,
): Promise<void> {
  const supabase: UntypedClient = createClient()
  const path = `${scan.ownerUserId}/${scan.scanId}/${pageIndex}.jpg`

  const { error: uploadError } = await supabase.storage
    .from(SCAN_BUCKET)
    .upload(path, page.blob, { contentType: 'image/jpeg', upsert: true })

  if (uploadError) throw uploadError

  const { error: rowError } = await supabase.from('menu_scan_pages').insert({
    scan_id: scan.scanId,
    storage_path: path,
    page_index: pageIndex,
    status: 'pending',
  })

  // A stored object with no row is invisible to the pipeline, so drop the
  // orphan rather than leaving it to be paid for and never read.
  if (rowError) {
    await supabase.storage.from(SCAN_BUCKET).remove([path])
    throw rowError
  }
}

/** Hand the scan to the reading stage once every page is stored. */
export async function markScanReading(scanId: string): Promise<void> {
  const supabase: UntypedClient = createClient()
  const { error } = await supabase
    .from('menu_scans')
    .update({ status: 'reading', updated_at: new Date().toISOString() })
    .eq('id', scanId)

  if (error) throw error
}
