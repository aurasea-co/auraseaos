'use client'

// The anonymous scan flow: landing → capture/review → upload → result.
//
// One page holding three states rather than three routes. Bible §04 puts the
// whole funnel on removing friction before the wow moment, and a navigation
// between "I want to try this" and "here is the camera" is a place people fall
// out. There is no login, no form, and nothing to type anywhere in here.
//
// Screening happens on-device before upload (see lib/menudesk/capture), so a
// photo nobody could read never becomes a model call — and, just as important,
// the owner is told what to fix while the menu is still in front of them,
// rather than after a round trip.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { type PreparedPage, preparePage } from '@/lib/menudesk/capture'
import type { RejectReason } from '@/lib/menudesk/capture'
import {
  AnonymousAuthDisabledError,
  createScan,
  markScanReading,
  uploadPage,
} from '@/lib/menudesk/scan-client'

type Stage = 'landing' | 'review' | 'uploading'

interface Candidate {
  id: string
  page: PreparedPage
}

const REJECT_MESSAGE_KEY: Record<RejectReason, string> = {
  too_small: 'rejectTooSmall',
  blank: 'rejectBlank',
  blurred: 'rejectBlurred',
  duplicate: 'rejectDuplicate',
}

export function ScanFlow() {
  const t = useTranslations('scan')
  const router = useRouter()

  const [stage, setStage] = useState<Stage>('landing')
  const [accepted, setAccepted] = useState<Candidate[]>([])
  const [rejected, setRejected] = useState<{ id: string; reason: RejectReason; url: string }[]>([])
  const [checking, setChecking] = useState(false)
  const [uploaded, setUploaded] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  // Object URLs are not garbage collected. A ten-page menu on a mid-range phone
  // is a lot of retained bitmaps, so release them when the flow unmounts.
  const acceptedRef = useRef(accepted)
  const rejectedRef = useRef(rejected)
  acceptedRef.current = accepted
  rejectedRef.current = rejected
  useEffect(
    () => () => {
      for (const c of acceptedRef.current) URL.revokeObjectURL(c.page.previewUrl)
      for (const r of rejectedRef.current) URL.revokeObjectURL(r.url)
    },
    [],
  )

  const onFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return

      setChecking(true)
      setError(null)

      // Sequential, not parallel: decoding several multi-megapixel photos at
      // once is what makes a cheap phone drop the tab. Each page is also judged
      // against the ones already accepted in THIS pass, so two identical shots
      // picked in one go still get caught.
      const hashes = accepted.map((c) => c.page.verdict.hash)
      const nextAccepted: Candidate[] = []
      const nextRejected: typeof rejected = []

      for (const file of Array.from(fileList)) {
        const id = `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`
        try {
          const page = await preparePage(file, hashes)
          if (page.verdict.accepted) {
            hashes.push(page.verdict.hash)
            nextAccepted.push({ id, page })
          } else {
            nextRejected.push({
              id,
              reason: page.verdict.reason ?? 'blurred',
              url: page.previewUrl,
            })
          }
        } catch {
          // A file the browser cannot decode at all — a HEIC on a browser
          // without support, a truncated download. Surfaced as a per-photo
          // message rather than failing the whole selection.
          nextRejected.push({ id, reason: 'too_small', url: '' })
        }
      }

      setAccepted((prev) => [...prev, ...nextAccepted])
      setRejected(nextRejected)
      setChecking(false)
      setStage('review')
    },
    [accepted],
  )

  const removePage = useCallback((id: string) => {
    setAccepted((prev) => {
      const target = prev.find((c) => c.id === id)
      if (target) URL.revokeObjectURL(target.page.previewUrl)
      return prev.filter((c) => c.id !== id)
    })
  }, [])

  const startUpload = useCallback(async () => {
    if (accepted.length === 0) return

    setStage('uploading')
    setUploaded(0)
    setError(null)

    try {
      const scan = await createScan()

      for (let i = 0; i < accepted.length; i++) {
        await uploadPage(scan, accepted[i].page, i)
        setUploaded(i + 1)
      }

      await markScanReading(scan.scanId)
      router.push(`/r/${scan.scanId}`)
    } catch (cause) {
      // The two failures worth telling apart: a project that has not switched
      // anonymous sign-in on (nothing the owner can do, and it fails for
      // everyone) versus a flaky upload (worth another tap).
      setError(
        cause instanceof AnonymousAuthDisabledError
          ? cause.message
          : t('uploadFailed'),
      )
      setStage('review')
    }
  }, [accepted, router, t])

  const openPicker = () => inputRef.current?.click()

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        // `environment` opens the rear camera directly on Android and iOS,
        // which is the one-tap path for someone standing over their menu.
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          void onFiles(e.target.files)
          e.target.value = '' // let the same file be picked again after removal
        }}
      />

      {stage === 'landing' && (
        <div className="flex flex-1 flex-col justify-center">
          <h1 className="font-heading text-3xl leading-heading text-brand-menudesk-navy">
            {t('headline')}
          </h1>
          <p className="mt-4 text-base leading-body text-brand-menudesk-navy/70">
            {t('subhead')}
          </p>
          <button
            type="button"
            onClick={openPicker}
            className="mt-8 rounded-xl bg-brand-menudesk-green px-6 py-4 text-lg font-medium text-white active:scale-[0.99]"
          >
            {t('cta')}
          </button>
          <p className="mt-3 text-sm text-brand-menudesk-navy/50">{t('hintGoodLight')}</p>
        </div>
      )}

      {stage === 'review' && (
        <div className="flex flex-1 flex-col">
          <h2 className="font-heading text-xl text-brand-menudesk-navy">
            {t('pagesReady', { count: accepted.length })}
          </h2>

          {rejected.length > 0 && (
            <ul className="mt-4 space-y-2">
              {rejected.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
                >
                  {r.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.url}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded object-cover opacity-60"
                    />
                  )}
                  <span>{t(REJECT_MESSAGE_KEY[r.reason])}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2">
            {accepted.map((c) => (
              <div key={c.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.page.previewUrl}
                  alt=""
                  className="aspect-[3/4] w-full rounded-lg object-cover"
                />
                <button
                  type="button"
                  aria-label={t('remove')}
                  onClick={() => removePage(c.id)}
                  className="absolute right-1 top-1 h-8 w-8 rounded-full bg-black/60 text-lg leading-none text-white"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>
          )}

          <div className="mt-auto pt-6">
            <button
              type="button"
              onClick={openPicker}
              className="w-full rounded-xl border-2 border-brand-menudesk-navy/20 px-6 py-3 text-base font-medium text-brand-menudesk-navy"
            >
              {t('addMore')}
            </button>
            <button
              type="button"
              onClick={() => void startUpload()}
              disabled={accepted.length === 0 || checking}
              className="mt-3 w-full rounded-xl bg-brand-menudesk-green px-6 py-4 text-lg font-medium text-white disabled:opacity-40"
            >
              {t('analyse')}
            </button>
          </div>
        </div>
      )}

      {stage === 'uploading' && (
        <div className="flex flex-1 flex-col justify-center">
          <h2 className="font-heading text-2xl text-brand-menudesk-navy">
            {t('uploadingPage', { done: uploaded, total: accepted.length })}
          </h2>
          <div
            className="mt-6 h-2 w-full overflow-hidden rounded-full bg-brand-menudesk-navy/10"
            role="progressbar"
            aria-valuenow={uploaded}
            aria-valuemin={0}
            aria-valuemax={accepted.length}
          >
            <div
              className="h-full rounded-full bg-brand-menudesk-green transition-[width] duration-300"
              style={{
                width: `${accepted.length ? (uploaded / accepted.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {checking && (
        <p className="mt-4 text-center text-sm text-brand-menudesk-navy/60">
          {t('checking')}
        </p>
      )}
    </main>
  )
}
