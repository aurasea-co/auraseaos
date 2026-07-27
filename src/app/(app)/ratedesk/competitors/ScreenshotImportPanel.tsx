'use client'

import { useCallback, useRef, useState } from 'react'
import type { OtaHint } from '@/lib/ratedesk/vision-extract'

// Screenshot → draft rows → human review → commit. NOTHING is written
// to competitor_rates until the operator explicitly confirms in the
// review step — /extract only returns draft rows; /batch-commit is a
// separate, deliberate action (see those routes for the write path,
// which is the exact same one the manual grid uses).

const OTA_PLATFORMS: ReadonlyArray<OtaHint> = ['Agoda', 'Booking.com', 'Traveloka', 'Other']

// Mirrors DraftCompetitorRow from the /extract route — kept as a local
// type (not imported from the route file) since client components
// can't import server route modules.
export interface DraftRow {
  hotelName: string
  roomType: string | null
  rateThb: number
  stayDate: string | null
  confidence: number
  priceNote: string | null
  matchedName: string | null
  matchConfidence: number | null
  plausibility: { flagged: boolean; reasonTh: string | null; reasonEn: string | null }
}

// Editable row state built from a DraftRow once extraction returns.
export interface EditableRow {
  included: boolean
  /** '' when unmatched and not yet mapped/added. */
  competitorName: string
  /** True once the operator has explicitly resolved an unmatched row
   *  (mapped to an existing name or confirmed "add as new"). Included
   *  defaults to false until this is true — see the low-confidence /
   *  unmatched-defaults-unchecked rule below. */
  resolved: boolean
  roomType: string
  rateThb: string
  stayDate: string
  confidence: number
  priceNote: string | null
  plausibilityFlagged: boolean
  plausibilityReasonEn: string | null
}

export const LOW_CONFIDENCE_THRESHOLD = 0.6

export function draftToEditable(row: DraftRow, fallbackDate: string): EditableRow {
  const matched = row.matchedName != null
  return {
    // Never auto-include a row the operator hasn't effectively
    // reviewed: unmatched names need explicit mapping, and low-
    // confidence/implausible rows need explicit acknowledgement.
    included: matched && row.confidence >= LOW_CONFIDENCE_THRESHOLD && !row.plausibility.flagged,
    competitorName: row.matchedName ?? '',
    resolved: matched,
    roomType: row.roomType ?? '',
    rateThb: String(row.rateThb),
    stayDate: row.stayDate ?? fallbackDate,
    confidence: row.confidence,
    priceNote: row.priceNote,
    plausibilityFlagged: row.plausibility.flagged,
    plausibilityReasonEn: row.plausibility.reasonEn,
  }
}

type Step = 'platform' | 'upload' | 'crop' | 'extracting' | 'review' | 'committing' | 'done'

export function ScreenshotImportPanel({
  branchId,
  knownCompetitors,
  defaultDate,
  onClose,
  onCommitted,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t,
}: {
  branchId: string
  knownCompetitors: ReadonlyArray<string>
  /** Stay date to prefill rows whose screenshot didn't show a visible
   *  date — the caller passes "tomorrow" (BKK), matching the existing
   *  daily-check convention (owners check tomorrow's rate). */
  defaultDate: string
  onClose: () => void
  onCommitted: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any
}) {
  const [step, setStep] = useState<Step>('platform')
  const [platform, setPlatform] = useState<OtaHint>('Agoda')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<EditableRow[]>([])
  const [commitSummary, setCommitSummary] = useState<{ succeeded: number; failed: number; rowErrors: string[] } | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleFileChosen = useCallback((file: File) => {
    setImageFile(file)
    setImageUrl(URL.createObjectURL(file))
    setCropRect(null)
    setStep('crop')
  }, [])

  function onImageLoad() {
    const img = imgRef.current
    if (!img) return
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
  }

  // Crop selection — plain mouse-drag rectangle over the displayed
  // (possibly scaled-down) image; coordinates are converted to the
  // image's natural pixel size when the crop is applied.
  function onCropMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    const bounds = e.currentTarget.getBoundingClientRect()
    setDragStart({ x: e.clientX - bounds.left, y: e.clientY - bounds.top })
    setCropRect(null)
  }
  function onCropMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragStart) return
    const bounds = e.currentTarget.getBoundingClientRect()
    const cx = e.clientX - bounds.left
    const cy = e.clientY - bounds.top
    setCropRect({
      x: Math.min(dragStart.x, cx),
      y: Math.min(dragStart.y, cy),
      w: Math.abs(cx - dragStart.x),
      h: Math.abs(cy - dragStart.y),
    })
  }
  function onCropMouseUp() {
    setDragStart(null)
  }

  // Produces a cropped (or, if no crop was drawn, the original) image
  // Blob to upload — smaller image = cheaper + more accurate vision
  // call, per the "cheap vision model with cropped images" approach.
  async function buildUploadBlob(): Promise<Blob | null> {
    if (!imageFile) return null
    if (!cropRect || !naturalSize || !imgRef.current || cropRect.w < 10 || cropRect.h < 10) {
      return imageFile
    }
    const displayedRect = imgRef.current.getBoundingClientRect()
    const scaleX = naturalSize.w / displayedRect.width
    const scaleY = naturalSize.h / displayedRect.height
    const sx = Math.round(cropRect.x * scaleX)
    const sy = Math.round(cropRect.y * scaleY)
    const sw = Math.round(cropRect.w * scaleX)
    const sh = Math.round(cropRect.h * scaleY)
    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d')
    if (!ctx) return imageFile
    ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, sw, sh)
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob ?? imageFile), 'image/png')
    })
  }

  async function runExtraction() {
    setStep('extracting')
    setError(null)
    try {
      const blob = await buildUploadBlob()
      if (!blob) throw new Error('no image')
      const form = new FormData()
      form.append('image', blob, 'screenshot.png')
      form.append('channel', 'ota')
      form.append('otaHint', platform)
      const res = await fetch(`/api/branches/${branchId}/competitor-rates/extract`, {
        method: 'POST',
        body: form,
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.messageEn || json?.error || res.statusText)
        setStep('crop')
        return
      }
      const draftRows: DraftRow[] = json.rows || []
      setRows(draftRows.map((r) => draftToEditable(r, defaultDate)))
      setStep('review')
    } catch {
      setError(t('screenshotExtractFailed'))
      setStep('crop')
    }
  }

  function updateRow(index: number, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  async function commitRows() {
    const toCommit = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.included && r.resolved && r.competitorName.trim())
    if (toCommit.length === 0) return
    setStep('committing')
    try {
      const res = await fetch(`/api/branches/${branchId}/competitor-rates/batch-commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: toCommit.map(({ r }) => ({
            competitorName: r.competitorName.trim(),
            roomType: r.roomType || 'Standard',
            rateThb: Number(r.rateThb),
            capturedAt: r.stayDate,
            channel: 'ota',
            source: `${platform} screenshot`,
          })),
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error || res.statusText)
        setStep('review')
        return
      }
      const rowErrors: string[] = (json.results || [])
        .filter((r: { ok: boolean }) => !r.ok)
        .map((r: { index: number; messageEn?: string }) =>
          t('screenshotCommitRowFailed', { index: r.index + 1, message: r.messageEn || 'failed' }),
        )
      setCommitSummary({ succeeded: json.succeeded ?? 0, failed: json.failed ?? 0, rowErrors })
      setStep('done')
      onCommitted()
    } catch {
      setError(t('screenshotExtractFailed'))
      setStep('review')
    }
  }

  const includedCount = rows.filter((r) => r.included && r.resolved && r.competitorName.trim()).length

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{t('importScreenshot')}</h3>
          <button type="button" onClick={onClose} style={secondaryBtn}>{t('screenshotClose')}</button>
        </div>

        {error && <div style={errorBox}>{error}</div>}

        {step === 'platform' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t('screenshotIntro')}</p>
            <label style={{ fontSize: 13, fontWeight: 500 }}>{t('screenshotStepPlatform')}</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {OTA_PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  style={p === platform ? primaryBtn : secondaryBtn}
                >
                  {p === 'Other' ? t('screenshotPlatformOther') : p}
                </button>
              ))}
            </div>
            <div>
              <button type="button" onClick={() => setStep('upload')} style={primaryBtn}>
                {t('screenshotStepUpload')} →
              </button>
            </div>
          </div>
        )}

        {step === 'upload' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{t('screenshotUploadHint')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFileChosen(f)
              }}
            />
            <div>
              <button type="button" onClick={() => fileInputRef.current?.click()} style={primaryBtn}>
                {t('screenshotChooseFile')}
              </button>
            </div>
            <button type="button" onClick={() => setStep('platform')} style={secondaryBtn}>{t('screenshotBack')}</button>
          </div>
        )}

        {step === 'crop' && imageUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{t('screenshotCropTitle')}</p>
            <div
              style={{ position: 'relative', display: 'inline-block', cursor: 'crosshair', maxWidth: '100%' }}
              onMouseDown={onCropMouseDown}
              onMouseMove={onCropMouseMove}
              onMouseUp={onCropMouseUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={imageUrl}
                alt="Screenshot to crop"
                onLoad={onImageLoad}
                style={{ maxWidth: '100%', display: 'block', userSelect: 'none' }}
                draggable={false}
              />
              {cropRect && (
                <div
                  style={{
                    position: 'absolute',
                    left: cropRect.x,
                    top: cropRect.y,
                    width: cropRect.w,
                    height: cropRect.h,
                    border: '2px solid #534AB7',
                    background: 'rgba(83,74,183,0.15)',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={runExtraction} style={primaryBtn}>{t('screenshotCropConfirm')}</button>
              <button type="button" onClick={() => { setCropRect(null); runExtraction() }} style={secondaryBtn}>
                {t('screenshotCropSkip')}
              </button>
            </div>
          </div>
        )}

        {step === 'extracting' && <p style={{ fontSize: 13 }}>{t('screenshotExtracting')}</p>}

        {step === 'review' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 500 }}>{t('screenshotReviewTitle')}</p>
            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{t('screenshotReviewHint')}</p>
            {rows.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>{t('screenshotNoRowsExtracted')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
                {rows.map((row, i) => (
                  <ReviewRow
                    key={i}
                    row={row}
                    knownCompetitors={knownCompetitors}
                    onChange={(patch) => updateRow(i, patch)}
                    t={t}
                  />
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="button" onClick={commitRows} disabled={includedCount === 0} style={primaryBtn}>
                {t('screenshotConfirmCommit', { n: includedCount })}
              </button>
              <button type="button" onClick={() => setStep('crop')} style={secondaryBtn}>{t('screenshotBack')}</button>
            </div>
          </div>
        )}

        {step === 'committing' && <p style={{ fontSize: 13 }}>{t('screenshotCommitting')}</p>}

        {step === 'done' && commitSummary && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 500 }}>
              {t('screenshotCommitSummary', { succeeded: commitSummary.succeeded, failed: commitSummary.failed })}
            </p>
            {commitSummary.rowErrors.length > 0 && (
              <ul style={{ fontSize: 12, color: '#A32D2D', paddingLeft: 18 }}>
                {commitSummary.rowErrors.map((msg, i) => <li key={i}>{msg}</li>)}
              </ul>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={onClose} style={primaryBtn}>{t('screenshotClose')}</button>
              <button
                type="button"
                onClick={() => {
                  setStep('platform')
                  setImageFile(null)
                  setImageUrl(null)
                  setCropRect(null)
                  setRows([])
                  setCommitSummary(null)
                }}
                style={secondaryBtn}
              >
                {t('screenshotStartOver')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ReviewRow({
  row,
  knownCompetitors,
  onChange,
  t,
}: {
  row: EditableRow
  knownCompetitors: ReadonlyArray<string>
  onChange: (patch: Partial<EditableRow>) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any
}) {
  const needsAttention = !row.resolved || row.confidence < LOW_CONFIDENCE_THRESHOLD || row.plausibilityFlagged
  return (
    <div
      style={{
        border: `1px solid ${needsAttention ? '#FCD34D' : 'var(--color-border)'}`,
        background: needsAttention ? '#FFFBEB' : 'var(--color-bg)',
        borderRadius: 8,
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="checkbox"
          checked={row.included}
          disabled={!row.resolved}
          onChange={(e) => onChange({ included: e.target.checked })}
        />
        {!row.resolved ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#92400E', fontWeight: 500 }}>{t('screenshotUnmatched')}</span>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  onChange({ competitorName: row.competitorName, resolved: true, included: true })
                } else if (e.target.value) {
                  onChange({ competitorName: e.target.value, resolved: true, included: true })
                }
              }}
              style={{ fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--color-border)' }}
            >
              <option value="">{t('screenshotMapTo')}</option>
              {knownCompetitors.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value="__new__">{t('screenshotAddAsNew', { name: row.competitorName || '?' })}</option>
            </select>
            <input
              type="text"
              value={row.competitorName}
              onChange={(e) => onChange({ competitorName: e.target.value })}
              style={{ fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--color-border)', minWidth: 140 }}
              placeholder={t('screenshotColCompetitor')}
            />
          </div>
        ) : (
          <strong style={{ fontSize: 13, flex: 1 }}>{row.competitorName}</strong>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          value={row.roomType}
          onChange={(e) => onChange({ roomType: e.target.value })}
          placeholder={t('screenshotColRoomType')}
          style={cellInput}
        />
        <input
          type="number"
          value={row.rateThb}
          onChange={(e) => onChange({ rateThb: e.target.value })}
          placeholder={t('screenshotColRate')}
          style={cellInput}
        />
        <input
          type="date"
          value={row.stayDate}
          onChange={(e) => onChange({ stayDate: e.target.value })}
          style={cellInput}
        />
        <span style={{ fontSize: 11, color: row.confidence < LOW_CONFIDENCE_THRESHOLD ? '#92400E' : 'var(--color-text-tertiary)' }}>
          {Math.round(row.confidence * 100)}%
        </span>
      </div>
      {row.confidence < LOW_CONFIDENCE_THRESHOLD && (
        <p style={{ fontSize: 11, color: '#92400E' }}>{t('screenshotLowConfidence')}</p>
      )}
      {row.plausibilityFlagged && row.plausibilityReasonEn && (
        <p style={{ fontSize: 11, color: '#92400E' }}>⚠ {row.plausibilityReasonEn}</p>
      )}
      {row.priceNote && (
        <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{t('screenshotPriceNotePrefix')} {row.priceNote}</p>
      )}
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '5vh 16px',
  zIndex: 1000,
  overflowY: 'auto',
}

const panelStyle: React.CSSProperties = {
  background: 'var(--color-bg)',
  borderRadius: 12,
  padding: 20,
  width: '100%',
  maxWidth: 640,
  maxHeight: '90vh',
  overflowY: 'auto',
}

const cellInput: React.CSSProperties = {
  fontSize: 12,
  padding: '5px 7px',
  borderRadius: 4,
  border: '1px solid var(--color-border)',
  width: 110,
}

const primaryBtn: React.CSSProperties = {
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 500,
  border: 'none',
  borderRadius: 6,
  background: 'var(--color-accent, #534AB7)',
  color: '#fff',
  cursor: 'pointer',
}

const secondaryBtn: React.CSSProperties = {
  padding: '8px 14px',
  fontSize: 13,
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  background: 'transparent',
  color: 'var(--color-text-secondary)',
  cursor: 'pointer',
}

const errorBox: React.CSSProperties = {
  background: '#FBEAEA',
  border: '1px solid #F5C6C6',
  color: '#A32D2D',
  borderRadius: 6,
  padding: '8px 12px',
  fontSize: 13,
  marginBottom: 12,
}
