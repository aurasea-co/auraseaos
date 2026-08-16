'use client'

// Scan result — the blurred view (Bible §04 step 2, W4).
//
// The full ranking arrives in W6, after the phone/LINE unlock in W5. Until
// then this page is deliberately incomplete in one specific way: it shows how
// MANY dishes are bleeding and never which, because that gap is what the
// unlock is worth.
//
// The redaction is server-side (analysis/summary.ts) — this page could not
// reveal a dish name if it wanted to, because none is ever sent. The estimate
// badge stays regardless of state: Bible §06 makes "ประเมิน" a standing
// promise that the free tier's figures are a band, not a fact.
//
// The route is public — src/middleware.ts lets /r/ through unauthenticated,
// and migration 043's RLS scopes every row to the scan's owner.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { BlurredScanSummary } from '@/lib/menudesk/analysis/summary'
import { concernCount, isTerminal } from '@/lib/menudesk/analysis/summary'
import { BlurredRanking } from './BlurredRanking'

/** Slow enough not to hammer the route, fast enough to feel live. */
const POLL_MS = 2500

/**
 * Give up after this long.
 *
 * A scan that never reaches a terminal status — a server that died mid-run, a
 * page left open overnight — must not leave a phone polling an endpoint every
 * few seconds until the battery goes. Analysis takes about a minute, so four
 * is generous.
 */
const POLL_TIMEOUT_MS = 4 * 60 * 1000

type PollResult =
  | { kind: 'ok'; summary: BlurredScanSummary }
  /** The scan is not ours, or does not exist. Terminal — retrying cannot help. */
  | { kind: 'gone' }
  /** Transient: a dropped connection, a cold start. Worth another go. */
  | { kind: 'retry' }

export default function ScanResultPage({ params }: { params: { scanId: string } }) {
  const t = useTranslations('scan')
  const tr = useTranslations('scanResult')
  const router = useRouter()

  const [summary, setSummary] = useState<BlurredScanSummary | null>(null)
  const [gone, setGone] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [unlockPending, setUnlockPending] = useState(false)
  const started = useRef(false)

  const endpoint = `/api/menudesk/scan/${params.scanId}/analyze`

  const poll = useCallback(async (): Promise<PollResult> => {
    try {
      const response = await fetch(endpoint)
      // 404 is the route's answer for both "no such scan" and "not yours" —
      // deliberately indistinguishable, so it cannot be used to probe for
      // real scan ids. Either way there is nothing to wait for.
      if (response.status === 404) return { kind: 'gone' }
      if (!response.ok) return { kind: 'retry' }
      return { kind: 'ok', summary: (await response.json()) as BlurredScanSummary }
    } catch {
      return { kind: 'retry' }
    }
  }, [endpoint])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const deadline = Date.now() + POLL_TIMEOUT_MS

    const tick = async () => {
      const result = await poll()
      if (cancelled) return

      if (result.kind === 'gone') {
        setGone(true)
        return
      }

      if (result.kind === 'ok') {
        setSummary(result.summary)
        if (isTerminal(result.summary.status)) return
      }

      if (Date.now() >= deadline) {
        setTimedOut(true)
        return
      }

      timer = setTimeout(() => void tick(), POLL_MS)
    }

    const begin = async () => {
      // Kick the analysis off exactly once per mount. The route itself holds
      // the real lock (a conditional status update), so a double-fire from a
      // second tab costs a rejected request rather than a second model bill.
      if (!started.current) {
        started.current = true
        await fetch(endpoint, { method: 'POST' }).catch(() => undefined)
      }
      void tick()
    }

    void begin()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [endpoint, poll])

  const stopped = gone || timedOut
  const working = !stopped && (!summary || !isTerminal(summary.status))
  const concern = summary ? concernCount(summary.counts) : 0

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-12">
      <h1 className="font-heading text-2xl leading-heading text-brand-menudesk-navy">
        {t('resultTitle')}
      </h1>

      <span className="mt-4 inline-block self-start rounded-full bg-brand-menudesk-purple/10 px-3 py-1 text-sm font-medium text-brand-menudesk-purple">
        {t('estimateBadge')}
      </span>

      {working && (
        <div className="mt-16 flex flex-col items-center text-center">
          <div
            className="h-10 w-10 animate-spin rounded-full border-4 border-brand-menudesk-navy/10 border-t-brand-menudesk-green"
            role="status"
            aria-label={tr('analysing')}
          />
          <p className="mt-6 font-heading text-xl text-brand-menudesk-navy">
            {tr('analysing')}
          </p>
          <p className="mt-2 text-sm text-brand-menudesk-navy/60">{tr('analysingNote')}</p>
        </div>
      )}

      {stopped && (
        <div className="mt-16 text-center">
          <p className="font-heading text-xl text-brand-menudesk-navy">
            {gone ? tr('goneTitle') : tr('timeoutTitle')}
          </p>
          <p className="mt-2 text-sm leading-body text-brand-menudesk-navy/60">
            {gone ? tr('goneBody') : tr('timeoutBody')}
          </p>
          <button
            type="button"
            onClick={() => router.push('/scan')}
            className="mt-6 w-full rounded-xl bg-brand-menudesk-green px-6 py-4 text-lg font-medium text-white"
          >
            {tr('retake')}
          </button>
        </div>
      )}

      {!stopped && !working && summary?.status === 'failed' && (
        <div className="mt-16 text-center">
          <p className="font-heading text-xl text-brand-menudesk-navy">
            {tr('failedTitle')}
          </p>
          <p className="mt-2 text-sm leading-body text-brand-menudesk-navy/60">
            {tr('failedBody')}
          </p>
          <button
            type="button"
            onClick={() => router.push('/scan')}
            className="mt-6 w-full rounded-xl bg-brand-menudesk-green px-6 py-4 text-lg font-medium text-white"
          >
            {tr('retake')}
          </button>
        </div>
      )}

      {!stopped && !working && summary && summary.status !== 'failed' && summary.dishCount === 0 && (
        <div className="mt-16 text-center">
          <p className="font-heading text-xl text-brand-menudesk-navy">{tr('emptyTitle')}</p>
          <p className="mt-2 text-sm leading-body text-brand-menudesk-navy/60">
            {tr('emptyBody')}
          </p>
          <button
            type="button"
            onClick={() => router.push('/scan')}
            className="mt-6 w-full rounded-xl bg-brand-menudesk-green px-6 py-4 text-lg font-medium text-white"
          >
            {tr('retake')}
          </button>
        </div>
      )}

      {!stopped && !working && summary && summary.status !== 'failed' && summary.dishCount > 0 && (
        <>
          {/* The aggregate is the one thing shown sharply — Bible §04 wants the
              wound visible and the location hidden. */}
          <p className="mt-8 font-heading text-3xl leading-heading text-brand-menudesk-navy">
            {tr('dishesFound', { count: summary.dishCount })}
          </p>
          <p className="mt-1 text-lg text-brand-menudesk-navy/70">
            {concern > 0 ? tr('concern', { count: concern }) : tr('concernNone')}
          </p>

          {summary.status === 'partial' && (
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              {tr('partialNote')}
            </p>
          )}

          <BlurredRanking rows={summary.rows} counts={summary.counts} />

          {summary.uncostedCount > 0 && (
            <p className="mt-3 text-xs text-brand-menudesk-navy/50">
              {tr('uncosted', { count: summary.uncostedCount })}
            </p>
          )}

          <p className="mt-6 text-xs leading-body text-brand-menudesk-navy/50">
            {t('estimateNote')}
          </p>

          {/* Unlock bar — W5 replaces the handler with the real phone/LINE
              capture. It is prominent here because Bible §04 puts the ask at
              the peak of curiosity, not at the bottom of a scroll. */}
          <div className="sticky bottom-0 mt-8 -mx-6 border-t border-brand-menudesk-navy/10 bg-white px-6 pb-6 pt-4">
            <p className="font-heading text-lg text-brand-menudesk-navy">
              {tr('unlockTitle')}
            </p>
            <p className="mt-1 text-sm text-brand-menudesk-navy/60">{tr('unlockBody')}</p>
            <button
              type="button"
              onClick={() => setUnlockPending(true)}
              className="mt-3 w-full rounded-xl bg-brand-menudesk-green px-6 py-4 text-lg font-medium text-white"
            >
              {tr('unlockCta')}
            </button>
            {unlockPending && (
              <p className="mt-2 text-center text-xs text-brand-menudesk-navy/50">
                {tr('unlockPending')}
              </p>
            )}
          </div>
        </>
      )}
    </main>
  )
}
