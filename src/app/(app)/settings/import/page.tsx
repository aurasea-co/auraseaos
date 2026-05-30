'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Upload, FileText, Download, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'

// Bulk-import CSV → accommodation_daily_metrics.
// Branch-type aware: F&B branches see a "not yet supported" notice
// instead of the upload widget so we don't promise a feature that
// doesn't exist yet.

interface PreviewDay {
  date: string
  occupancyRate: number
  adrThb: number
  revparThb: number
  totalRevenueThb: number
  roomTypeBreakdown: Array<{ roomType: string; totalRooms: number; occupiedRooms: number; rateThb: number }>
}

interface ApiResponse {
  success: boolean
  daysWritten: number
  daysParsed: number
  warnings: Array<{ row: number; code: string; messageTh: string; messageEn: string }>
  errors: Array<{ row: number; code: string; messageTh: string; messageEn: string }>
  // Present when the server bails before parsing (auth, missing csv,
  // binary file, etc.) or when the database write fails. Older
  // responses or network errors may produce a missing/undefined
  // value here, which is why the render path below treats every
  // array field with `?? []`. `detail` carries the raw Postgres
  // message on upsert_failed so the operator can diagnose schema
  // issues from the browser without digging through Vercel logs.
  routeError?: { code: string; messageTh: string; messageEn: string; detail?: string }
}

// Normalise any HTTP response payload into a safe ApiResponse so the
// render path never sees undefined arrays. The server side now
// always returns a full envelope, but old deployments / proxy errors
// / malformed JSON could still land here.
function normaliseApiResponse(raw: unknown, httpStatus: number, statusText: string): ApiResponse {
  const empty: ApiResponse = {
    success: false,
    daysWritten: 0,
    daysParsed: 0,
    warnings: [],
    errors: [],
  }
  if (!raw || typeof raw !== 'object') {
    return {
      ...empty,
      routeError: {
        code: 'invalid_response',
        messageTh: `เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง (HTTP ${httpStatus})`,
        messageEn: `Server returned an invalid response (HTTP ${httpStatus} ${statusText})`,
      },
    }
  }
  const r = raw as Partial<ApiResponse>
  return {
    success: r.success ?? false,
    daysWritten: r.daysWritten ?? 0,
    daysParsed: r.daysParsed ?? 0,
    warnings: Array.isArray(r.warnings) ? r.warnings : [],
    errors: Array.isArray(r.errors) ? r.errors : [],
    routeError: r.routeError,
  }
}

export default function ImportPage() {
  const { branches, activeBranch, role } = useUser()
  const t = useTranslations('settingsImport')
  const [csv, setCsv] = useState('')
  const [filename, setFilename] = useState('')
  const [parsing, setParsing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ApiResponse | null>(null)
  const [previewDays, setPreviewDays] = useState<PreviewDay[]>([])
  const [previewError, setPreviewError] = useState<string | null>(null)
  // Row numbers the parser skipped because of blank required fields
  // (most commonly: template rows for future dates the owner hasn't
  // filled in yet). Surfaced as an amber info banner — not red error.
  const [previewSkipped, setPreviewSkipped] = useState<number[]>([])
  const [selectedBranchId, setSelectedBranchId] = useState<string>(activeBranch?.id || '')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const accommodationBranches = useMemo(
    () => branches.filter((b) => b.business_type === 'accommodation'),
    [branches],
  )
  const aggregate = useMemo(() => {
    if (previewDays.length === 0) return null
    const occ = previewDays.reduce((a, d) => a + d.occupancyRate, 0) / previewDays.length
    const adr = previewDays.reduce((a, d) => a + d.adrThb, 0) / previewDays.length
    return {
      days: previewDays.length,
      avgOccupancy: occ,
      avgAdr: adr,
    }
  }, [previewDays])

  const selectedBranch = accommodationBranches.find((b) => b.id === selectedBranchId)

  // Layout-level role guard already blocks non-owners from this page;
  // we still guard defensively here so a future direct link doesn't
  // leak the upload widget. Must come after every hook so React's
  // rules-of-hooks invariant holds.
  if (role !== 'owner') return null

  async function handleFile(file: File) {
    setParsing(true)
    setResult(null)
    setPreviewError(null)
    setPreviewDays([])
    setPreviewSkipped([])
    setFilename(file.name)
    try {
      // Friendly rejection for binary formats we can't parse as CSV.
      // .numbers (Apple) and .xlsx (Excel) are ZIP archives; reading
      // them as .text() and feeding to the parser produces garbage
      // headers ("ไม่พบคอลัมน์ date" is what users were hitting). We
      // also sniff the ZIP magic bytes (PK\x03\x04) so a renamed
      // file (foo.csv that's actually a .numbers export) still gets
      // caught.
      const lower = file.name.toLowerCase()
      if (lower.endsWith('.numbers')) {
        setPreviewError(
          'ไฟล์ .numbers ไม่รองรับโดยตรง — เปิดไฟล์ใน Numbers แล้ว File → Export To → CSV ก่อน',
        )
        return
      }
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        setPreviewError(
          'ไฟล์ Excel ไม่รองรับโดยตรง — บันทึกเป็น CSV ก่อน (File → Save As → CSV)',
        )
        return
      }
      const firstBytes = new Uint8Array(await file.slice(0, 4).arrayBuffer())
      if (firstBytes[0] === 0x50 && firstBytes[1] === 0x4b && firstBytes[2] === 0x03 && firstBytes[3] === 0x04) {
        setPreviewError(
          'ไฟล์นี้ดูเหมือนเป็นไฟล์บีบอัด (.numbers/.xlsx) ไม่ใช่ CSV — กรุณา Export เป็น CSV ก่อน',
        )
        return
      }

      const text = await file.text()
      setCsv(text)
      // Quick preview parse — we don't post yet, just preview locally.
      const { parseHotelCsv } = await import('@/lib/ingestion/csv-hotel')
      const parsed = parseHotelCsv(text)
      if (parsed.errors.length > 0) {
        setPreviewError(parsed.errors[0].messageTh)
        setPreviewDays([])
      } else {
        setPreviewDays(parsed.days)
      }
      const skippedRows = parsed.warnings
        .filter((w) => w.code === 'incomplete_row')
        .map((w) => w.row)
      setPreviewSkipped(skippedRows)
    } catch (err) {
      setPreviewError((err as Error).message)
    } finally {
      setParsing(false)
    }
  }

  async function handleImport() {
    if (!csv || !selectedBranchId || submitting) return
    setSubmitting(true)
    try {
      let res: Response
      try {
        res = await fetch(`/api/branches/${selectedBranchId}/import-hotel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csv }),
        })
      } catch (err) {
        // Network failure / fetch threw — synth a routeError envelope
        // so the rest of the render path stays uniform.
        console.error('[import] fetch failed:', err)
        setResult({
          success: false,
          daysWritten: 0,
          daysParsed: 0,
          warnings: [],
          errors: [],
          routeError: {
            code: 'network_error',
            messageTh: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
            messageEn: 'Could not reach the server. Please check your connection and try again.',
          },
        })
        return
      }

      let raw: unknown = null
      try {
        raw = await res.json()
      } catch {
        /* fall through — normaliseApiResponse handles null */
      }
      setResult(normaliseApiResponse(raw, res.status, res.statusText))
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setCsv('')
    setFilename('')
    setPreviewDays([])
    setPreviewError(null)
    setPreviewSkipped([])
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}>
      <div className="flex items-center gap-2 lg:hidden mb-2">
        <Link href="/settings" className="p-1" style={{ color: '#6b6b6b' }}>
          <ArrowLeft size={20} />
        </Link>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-text-primary)' }}>{t('title')}</h2>
      </div>
      <h2 className="hidden lg:block" style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-text-primary)' }}>{t('title')}</h2>

      {accommodationBranches.length === 0 ? (
        <div style={notice}>
          <FileText size={16} />
          <span>{t('hotelOnlyNotice')}</span>
        </div>
      ) : (
        <>
          {/* Branch picker */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{t('selectBranch')}</span>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              style={input}
            >
              <option value="">{t('chooseBranchPlaceholder')}</option>
              {accommodationBranches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>

          {/* Template download */}
          <a
            href="/templates/ratedesk-import-template.csv"
            download="ratedesk-import-template.csv"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'var(--color-accent, #534AB7)',
              textDecoration: 'none',
              alignSelf: 'flex-start',
            }}
          >
            <Download size={14} />
            {t('downloadTemplate')}
          </a>

          {/* Drop / pick zone */}
          <label
            onDragOver={(e) => { e.preventDefault() }}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files?.[0]
              if (f) handleFile(f)
            }}
            style={{
              border: '2px dashed var(--color-border)',
              borderRadius: 12,
              padding: '32px 16px',
              textAlign: 'center',
              cursor: 'pointer',
              background: 'var(--color-bg-surface, #f7f7f5)',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
              style={{ display: 'none' }}
            />
            <Upload size={20} style={{ color: 'var(--color-text-tertiary)', display: 'inline-block', marginBottom: 6 }} />
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
              {filename || t('dropOrClick')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
              {t('expectedColumns')}
            </div>
          </label>

          {parsing && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{t('parsing')}</div>}

          {previewError && (
            <div style={errorBox}>
              <XCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{previewError}</span>
            </div>
          )}

          {/* Skipped-row notice — amber (info), not red (error). Blank
              occupied_rooms / total_rooms / rate_thb cells are usually
              "I haven't filled in this day yet" not "I uploaded a
              broken file." Lines list is truncated when long. */}
          {previewSkipped.length > 0 && !previewError && (
            <div style={{
              background: '#FFFBEB',
              border: '1px solid #FCD34D',
              color: '#92400E',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 13,
              lineHeight: 1.55,
            }}>
              ⚠ ข้ามแล้ว <strong>{previewSkipped.length}</strong> แถวที่ข้อมูลไม่ครบ
              {previewSkipped.length <= 10 && (
                <> (บรรทัด {previewSkipped.join(', ')})</>
              )}
              <br />
              <span style={{ fontSize: 12, opacity: 0.85 }}>
                Skipped {previewSkipped.length} rows with incomplete data
                {previewSkipped.length <= 10 && (
                  <> (lines {previewSkipped.join(', ')})</>
                )}
                .
              </span>
            </div>
          )}

          {/* Aggregate preview */}
          {aggregate && (
            <div style={{
              background: '#E6F4EE',
              border: '1px solid #BBE0D0',
              color: '#0F5132',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 13,
            }}>
              {t('aggregateSummary', {
                days: aggregate.days,
                adr: Math.round(aggregate.avgAdr).toLocaleString('th-TH'),
                occ: Math.round(aggregate.avgOccupancy * 100),
              })}
            </div>
          )}

          {/* First-five preview rows */}
          {previewDays.length > 0 && (
            <div style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              overflow: 'hidden',
            }}>
              <div style={previewHeader}>{t('previewHeader', { shown: Math.min(5, previewDays.length), total: previewDays.length })}</div>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <th style={th}>{t('colDate')}</th>
                    <th style={th}>{t('colOccupancy')}</th>
                    <th style={th}>{t('colAdr')}</th>
                    <th style={th}>{t('colRevpar')}</th>
                    <th style={th}>{t('colRevenue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {previewDays.slice(0, 5).map((d) => (
                    <tr key={d.date} style={{ borderTop: '1px solid #f0f0ee' }}>
                      <td style={td}>{d.date}</td>
                      <td style={td}>{Math.round(d.occupancyRate * 100)}%</td>
                      <td style={td}>฿{Math.round(d.adrThb).toLocaleString('th-TH')}</td>
                      <td style={td}>฿{Math.round(d.revparThb).toLocaleString('th-TH')}</td>
                      <td style={td}>฿{Math.round(d.totalRevenueThb).toLocaleString('th-TH')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Actions */}
          {csv && !result && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleImport}
                disabled={submitting || !selectedBranchId || previewDays.length === 0}
                style={{
                  ...primaryBtn,
                  background: submitting || !selectedBranchId || previewDays.length === 0
                    ? '#9b9b9b'
                    : 'var(--color-accent, #534AB7)',
                  cursor: submitting || !selectedBranchId || previewDays.length === 0
                    ? 'not-allowed'
                    : 'pointer',
                }}
              >
                {submitting
                  ? t('importing')
                  : t('importNDays', { n: previewDays.length, branch: selectedBranch?.name || '' })}
              </button>
              <button type="button" onClick={reset} style={secondaryBtn}>
                {t('cancel')}
              </button>
            </div>
          )}

          {/* Result */}
          {result && (() => {
            // Defensive copies — normaliseApiResponse already ensures
            // these are arrays, but a second guard here means the
            // render never crashes on a bad payload that somehow
            // bypassed the normaliser (older deployments, devtools
            // editing state, etc.).
            const resultWarnings = result.warnings ?? []
            const resultErrors = result.errors ?? []
            return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {result.routeError ? (
                // Top-level HTTP / auth / validation / DB failure —
                // distinct from parser-level errors. Shows the
                // bilingual message + the Postgres error detail when
                // present so the operator can spot schema problems
                // (missing column, RLS) without leaving the page.
                <div style={errorBox}>
                  <XCircle size={16} style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 500 }}>{result.routeError.messageTh}</div>
                    <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
                      {result.routeError.messageEn}
                    </div>
                    {result.routeError.detail && (
                      <div style={{
                        fontSize: 11,
                        marginTop: 6,
                        padding: '4px 8px',
                        background: 'rgba(0,0,0,0.05)',
                        borderRadius: 4,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        wordBreak: 'break-word',
                      }}>
                        {result.routeError.code}: {result.routeError.detail}
                      </div>
                    )}
                  </div>
                </div>
              ) : result.success ? (
                <div style={successBox}>
                  <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                  <span>{t('successWritten', { n: result.daysWritten })}</span>
                </div>
              ) : (
                <div style={errorBox}>
                  <XCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{t('failed')}</span>
                </div>
              )}
              {resultWarnings.length > 0 && (
                <div style={warningBox}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {resultWarnings.slice(0, 8).map((w, i) => (
                      <li key={i}>{w.messageTh}</li>
                    ))}
                    {resultWarnings.length > 8 && <li>… +{resultWarnings.length - 8}</li>}
                  </ul>
                </div>
              )}
              {resultErrors.length > 0 && (
                <div style={errorBox}>
                  <XCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {resultErrors.slice(0, 8).map((e, i) => (
                      <li key={i}>{e.messageTh}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <button type="button" onClick={reset} style={secondaryBtn}>
                  {t('importAnother')}
                </button>
                <Link
                  href="/ratedesk"
                  style={{ marginLeft: 10, fontSize: 13, color: 'var(--color-accent, #534AB7)' }}
                >
                  {t('viewDashboard')} →
                </Link>
              </div>
            </div>
            )
          })()}
        </>
      )}
    </div>
  )
}

const input: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #d4d4d4',
  borderRadius: 8,
  fontSize: 13,
  background: '#fff',
  color: '#1a1a1a',
}

const primaryBtn: React.CSSProperties = {
  padding: '10px 16px',
  background: 'var(--color-accent, #534AB7)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 500,
  border: 'none',
  borderRadius: 8,
}

const secondaryBtn: React.CSSProperties = {
  padding: '10px 16px',
  background: 'transparent',
  color: '#6b6b6b',
  fontSize: 13,
  fontWeight: 500,
  border: '1px solid #d4d4d4',
  borderRadius: 8,
  cursor: 'pointer',
}

const notice: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  background: 'var(--color-bg-surface, #f7f7f5)',
  border: '1px solid var(--color-border)',
  padding: '12px 14px',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--color-text-secondary)',
}

const successBox: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  background: '#E6F4EE', color: '#0F5132',
  padding: '10px 14px', borderRadius: 8, fontSize: 13,
}

const errorBox: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8,
  background: '#FBEAEA', color: '#A32D2D',
  padding: '10px 14px', borderRadius: 8, fontSize: 13,
}

const warningBox: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8,
  background: '#FFF4E0', color: '#8A5A00',
  padding: '10px 14px', borderRadius: 8, fontSize: 12,
}

const previewHeader: React.CSSProperties = {
  padding: '8px 14px',
  background: '#fafafa',
  borderBottom: '1px solid var(--color-border)',
  fontSize: 11,
  fontWeight: 600,
  color: '#6b6b6b',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--color-text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const td: React.CSSProperties = {
  padding: '8px 12px',
  color: 'var(--color-text-primary)',
}
