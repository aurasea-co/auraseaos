'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Trash2, Plus, Upload, Download, Camera } from 'lucide-react'
import { ScreenshotImportPanel } from './ScreenshotImportPanel'
import { useUser } from '@/providers/user-context'
import { canAccessRateDesk, type RateDeskRole } from '@/lib/auth/ratedesk-permissions'
import { createClient } from '@/lib/supabase/client'
import type { RoomTypeOccupancy } from '@/lib/ingestion/types'
import { deriveRoomTypesFromBreakdowns } from '@/lib/recommendations/hotel/room-types'
import { buildCompetitorCsvTemplate } from '@/lib/ingestion/csv-competitor'

// RateDesk → ราคาคู่แข่ง (Competitor rates). A 2-minute daily task for
// the hotel owner. Two sections:
//   1. Roster — short list of competitors (max 5). Add by name, delete.
//   2. Today's update — quick rate-entry inline form per competitor.
// All writes go through /api/branches/[branchId]/competitor-rates which
// authn's, checks role (owner), and enforces the max.

interface Competitor {
  competitorName: string
  lastRateThb: number | null
  lastRateRoomType: string | null
  lastRateCapturedAt: string | null
  lastUpdatedAt: string | null
  /** Today's rates per (roomType|channel) — keys like "Suite|ota" → 4200.
   *  Populated by the GET response (Slice 1 + 2). Used by the
   *  multi-channel rate grid to pre-fill input values. */
  todayRates: Record<string, number>
  /** Most recent rate EVER recorded per (roomType|channel), regardless
   *  of date — a suggestion for "unchanged since last time", distinct
   *  from todayRates (which only counts as already-confirmed-today).
   *  The grid shows this as an editable placeholder/suggestion, not a
   *  pre-saved value — the operator still taps to confirm it. */
  lastRates: Record<string, number>
}

// Rate channels supported by the migration 033 CHECK constraint.
// Same set as RATE_CHANNELS in lib/types/competitor-rates.ts; kept
// local for the dropdown render order (we surface OTA first because
// it's the default daily-check channel).
const CHANNEL_ORDER = ['ota', 'walk_in', 'package', 'promo'] as const
type ChannelKey = (typeof CHANNEL_ORDER)[number]

interface MetricRowForRoomTypes {
  metric_date: string
  room_type_breakdown: RoomTypeOccupancy[] | null
}

export default function CompetitorsPage() {
  const t = useTranslations('settingsCompetitors')
  const { activeBranch, role } = useUser()
  const supabase = createClient()

  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [maxCompetitors, setMaxCompetitors] = useState(5)
  const [roomTypes, setRoomTypes] = useState<string[]>([])
  // "Our" rate per room type — the most recently observed rate from
  // historical breakdowns. Used by the grid to compute the delta vs
  // each competitor cell ("+฿X above ours" / "-฿X below ours"). Empty
  // when the branch has no breakdown history yet (delta hidden).
  const [myRateByType, setMyRateByType] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addName, setAddName] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showScreenshotImport, setShowScreenshotImport] = useState(false)
  const [openRateRow, setOpenRateRow] = useState<string | null>(null)
  const [savedRow, setSavedRow] = useState<string | null>(null)
  // Channel-mode toggle. OTA-only is the default because that's the
  // daily 2-minute task (check Agoda); expanding to all channels is
  // opt-in for the occasional full competitive shop.
  const [showAllChannels, setShowAllChannels] = useState(false)

  // Monotonic id per reload() invocation. activeBranch defaults to the
  // alphabetically-first branch on a fresh load (often an F&B sibling),
  // so a fetch can be in flight for one branch when the user switches
  // to another. Each in-flight response checks it's still the newest
  // invocation before touching state — a late 400 (or stale data) from
  // the previous branch can never paint over the current one.
  const reloadSeq = useRef(0)

  const reload = useCallback(async () => {
    if (!activeBranch) return
    if (activeBranch.business_type !== 'accommodation') {
      // Non-hotel branch: never fetch — the render's hotelOnly notice
      // covers it and the API would 400 wrong_business_type anyway.
      // Same early-return the RateDesk dashboard's load() does. Bump
      // the seq so any response still in flight is invalidated too.
      reloadSeq.current++
      return
    }
    const seq = ++reloadSeq.current
    setLoading(true)
    setError(null)
    try {
      const [compRes, rtsRes] = await Promise.all([
        fetch(`/api/branches/${activeBranch.id}/competitor-rates`, { cache: 'no-store' }),
        // Re-uses the room_type_breakdown jsonb we already populate from
        // CSV imports. No new table; the rooms list is whatever shows
        // up in the latest 30 days of breakdowns. Same logic as the
        // /settings/rooms page.
        (supabase as ReturnType<typeof createClient>)
          .from('accommodation_daily_metrics')
          .select('metric_date, room_type_breakdown')
          .eq('branch_id', activeBranch.id)
          .order('metric_date', { ascending: false })
          .limit(30),
      ])
      // Superseded while in flight (branch switched, or a newer save
      // triggered reload) — drop this result silently.
      if (seq !== reloadSeq.current) return
      if (compRes.ok) {
        const json = (await compRes.json()) as { competitors: Competitor[]; maxCompetitors: number }
        setCompetitors(json.competitors || [])
        setMaxCompetitors(json.maxCompetitors || 5)
      } else {
        const body = await compRes.json().catch(() => ({}))
        setError(body?.messageTh || body?.error || compRes.statusText)
      }
      const rtsData = (rtsRes.data as MetricRowForRoomTypes[] | null) || []
      const types = new Set<string>()
      for (const row of rtsData) {
        const breakdown = Array.isArray(row.room_type_breakdown) ? row.room_type_breakdown : []
        for (const b of breakdown) {
          if (b.roomType) types.add(b.roomType)
        }
      }
      // Always include Standard as a fallback so the dropdown isn't
      // empty for a brand-new branch.
      if (types.size === 0) types.add('Standard')
      setRoomTypes(Array.from(types).sort())

      // Derive "our" latest rate per room type. Reuses the same helper
      // the daily-entry form uses to pre-fill rate inputs — single
      // source of truth for "what was our last known rate".
      const known = deriveRoomTypesFromBreakdowns(
        rtsData.map((r) => ({
          metric_date: r.metric_date,
          room_type_breakdown: Array.isArray(r.room_type_breakdown) ? r.room_type_breakdown : null,
        })),
      )
      const rateMap: Record<string, number> = {}
      for (const k of known) {
        if (k.latestRateThb > 0) rateMap[k.roomType] = k.latestRateThb
      }
      setMyRateByType(rateMap)
    } finally {
      if (seq === reloadSeq.current) setLoading(false)
    }
  }, [activeBranch, supabase])

  useEffect(() => { reload() }, [reload])

  async function handleAdd() {
    if (!activeBranch || adding) return
    const name = addName.trim()
    if (!name) {
      setError(t('errorNameRequired'))
      return
    }
    setAdding(true)
    setError(null)
    try {
      const res = await fetch(`/api/branches/${activeBranch.id}/competitor-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitorName: name }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body?.messageTh || body?.error || res.statusText)
        return
      }
      setAddName('')
      setShowAddForm(false)
      await reload()
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(name: string) {
    if (!activeBranch) return
    if (!window.confirm(t('confirmDelete', { name }))) return
    const res = await fetch(
      `/api/branches/${activeBranch.id}/competitor-rates?competitor=${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    )
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body?.messageTh || body?.error || res.statusText)
      return
    }
    await reload()
  }

  // CSV import state. Single-shot: pick file → upload → show result.
  // No drag-drop; the file picker keeps the UX simple and works on
  // mobile (LINE in-app browser can attach files from the OS).
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<
    | null
    | { imported: number; skipped: number; skippedUnknownCompetitor?: number; warnings: Array<{ lineNumber: number; code: string; raw: string }> }
  >(null)

  async function handleImportFile(file: File) {
    if (!activeBranch) return
    setImporting(true)
    setImportResult(null)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/branches/${activeBranch.id}/competitor-rates/import`, {
        method: 'POST',
        body: form,
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError((json?.error as string) || res.statusText)
        return
      }
      setImportResult(json)
      await reload()
    } finally {
      setImporting(false)
    }
  }

  // Download a pre-filled CSV template for the next 7 days × the
  // branch's known competitors × known room types. Owner fills the
  // rate_thb column in Excel and uploads. Reuses the page's existing
  // competitor + room-type state — no extra round-trip.
  function downloadTemplate() {
    const competitorNames = competitors.map((c) => c.competitorName)
    if (competitorNames.length === 0 || roomTypes.length === 0) {
      setError(t('templateNoData'))
      return
    }
    const tmrw = tomorrowBkk()
    const csv = buildCompetitorCsvTemplate({
      competitors: competitorNames,
      roomTypes,
      startDate: tmrw,
      days: 7,
    })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `competitor-rates-template-${tmrw}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // RateDesk access matrix — owner + manager + superadmin (not staff).
  // Matches the rest of the RateDesk surface via canAccessRateDesk;
  // the legacy owner-only guard was tightened here to align with the
  // section this page now lives in.
  if (!canAccessRateDesk(role as RateDeskRole, 'ratedesk_competitors')) return null
  if (!activeBranch) return null
  if (activeBranch.business_type !== 'accommodation') {
    return (
      <div style={{ padding: 24, color: 'var(--color-text-tertiary)', fontSize: 13 }}>
        {t('hotelOnly')}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          {/* Tab bar in the RateDesk layout handles navigation, so the
              page title shows on every breakpoint (no mobile back-link
              header — that was the Settings-era affordance). */}
          <h2
            style={{ fontSize: 'var(--font-size-lg)', fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 }}
          >
            {t('title')}
          </h2>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            {activeBranch.name} · {t('subtitle')}
          </p>
        </div>
        {/* Channel-mode toggle. Default is OTA-only (the daily 2-minute
            task); expand for a full competitive shop with walk-in /
            package / promo as additional columns. */}
        <button
          type="button"
          onClick={() => setShowAllChannels((v) => !v)}
          style={{
            fontSize: 12,
            color: 'var(--color-accent, #534AB7)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 0',
          }}
        >
          {showAllChannels ? t('showOtaOnly') : t('showAllChannels')}
        </button>
      </div>

      {error && (
        <div style={{
          background: '#FBEAEA',
          border: '1px solid #F5C6C6',
          color: '#A32D2D',
          borderRadius: 6,
          padding: '8px 12px',
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ padding: 24, color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          {t('loading')}
        </div>
      )}

      {/* Collapsible guide — closed by default. Walks the owner through
          the Agoda check-rate flow so the daily 2-minute task is
          mechanical and predictable. */}
      <details
        style={{
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 12,
          color: 'var(--color-text-secondary)',
        }}
      >
        <summary style={{ cursor: 'pointer', fontWeight: 500, fontSize: 13, color: 'var(--color-text-primary)' }}>
          {t('guideTitle')}
        </summary>
        <div style={{ marginTop: 10, lineHeight: 1.7, paddingLeft: 4 }}>
          <p>{t('guideStep1')}</p>
          <p>{t('guideStep2')}</p>
          <p>{t('guideStep3')}</p>
          <p>{t('guideStep4')}</p>
          <p>{t('guideStep5')}</p>
          <p style={{ color: 'var(--color-text-tertiary)', marginTop: 4 }}>{t('guideFooter')}</p>
        </div>
      </details>

      {/* CSV bulk import — file picker + template download. Slice 4
          of the competitor redesign. Owner picks a CSV → POST to the
          /import route → result panel summarises imported/skipped
          rows + per-line warnings. */}
      {!loading && competitors.length > 0 && (
        <section
          style={{
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: '10px 14px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 10,
            fontSize: 12,
          }}
        >
          <span style={{ color: 'var(--color-text-secondary)', flex: 1, minWidth: 200 }}>
            {t('csvBlurb')}
          </span>
          <button
            type="button"
            onClick={downloadTemplate}
            style={{
              padding: '6px 10px',
              fontSize: 12,
              background: 'transparent',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Download size={12} /> {t('downloadTemplate')}
          </button>
          <label
            style={{
              padding: '6px 10px',
              fontSize: 12,
              background: 'var(--color-accent, #534AB7)',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: importing ? 'not-allowed' : 'pointer',
              opacity: importing ? 0.5 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Upload size={12} /> {importing ? t('importing') : t('importCsv')}
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={importing}
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  handleImportFile(file)
                  // Reset the input so the same file can be re-uploaded.
                  e.target.value = ''
                }
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => setShowScreenshotImport(true)}
            style={{
              padding: '6px 10px',
              fontSize: 12,
              background: 'transparent',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Camera size={12} /> {t('importScreenshot')}
          </button>
        </section>
      )}

      {showScreenshotImport && activeBranch && (
        <ScreenshotImportPanel
          branchId={activeBranch.id}
          knownCompetitors={competitors.map((c) => c.competitorName)}
          defaultDate={tomorrowBkk()}
          onClose={() => setShowScreenshotImport(false)}
          onCommitted={reload}
          t={t}
        />
      )}

      {importResult && (
        <section
          style={{
            background: importResult.imported > 0 ? '#F0FDF4' : '#FFFBEB',
            border: `1px solid ${importResult.imported > 0 ? '#BBF7D0' : '#FCD34D'}`,
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 12,
            color: importResult.imported > 0 ? '#166534' : '#92400E',
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            {t('importSummary', {
              imported: importResult.imported,
              skipped: importResult.skipped,
            })}
          </div>
          {importResult.skippedUnknownCompetitor && importResult.skippedUnknownCompetitor > 0 && (
            <div style={{ marginTop: 4 }}>
              {t('importSkippedUnknown', { count: importResult.skippedUnknownCompetitor })}
            </div>
          )}
          {importResult.warnings.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer' }}>
                {t('importWarningsToggle', { count: importResult.warnings.length })}
              </summary>
              <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 11, lineHeight: 1.5 }}>
                {importResult.warnings.slice(0, 20).map((w, i) => (
                  <li key={i}>
                    {t('importWarningLine', { line: w.lineNumber })} — {t(`importError.${w.code}`)}
                  </li>
                ))}
                {importResult.warnings.length > 20 && (
                  <li style={{ color: 'var(--color-text-tertiary)' }}>
                    {t('importWarningsMore', { count: importResult.warnings.length - 20 })}
                  </li>
                )}
              </ul>
            </details>
          )}
        </section>
      )}

      {!loading && (
        <>
          <CompetitorList
            competitors={competitors}
            roomTypes={roomTypes}
            myRateByType={myRateByType}
            openRateRow={openRateRow}
            setOpenRateRow={setOpenRateRow}
            savedRow={savedRow}
            setSavedRow={setSavedRow}
            onDelete={handleDelete}
            onRateSaved={reload}
            branchId={activeBranch.id}
            showAllChannels={showAllChannels}
            t={t}
          />

          {competitors.length < maxCompetitors && (
            <div>
              {!showAddForm ? (
                <button
                  type="button"
                  onClick={() => { setShowAddForm(true); setError(null) }}
                  style={addBtn}
                >
                  <Plus size={14} />
                  {t('addCompetitor')}
                </button>
              ) : (
                <div style={{
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                  padding: 12,
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}>
                  <input
                    type="text"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder={t('addPlaceholder')}
                    maxLength={80}
                    autoFocus
                    style={input}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
                  />
                  <button type="button" onClick={handleAdd} disabled={adding} style={primaryBtn}>
                    {adding ? t('addingLabel') : t('addConfirm')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddForm(false); setAddName(''); setError(null) }}
                    style={secondaryBtn}
                  >
                    {t('cancel')}
                  </button>
                </div>
              )}
            </div>
          )}
          {competitors.length >= maxCompetitors && (
            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              {t('maxReached', { max: maxCompetitors })}
            </p>
          )}
        </>
      )}
    </div>
  )
}

function CompetitorList({
  competitors,
  roomTypes,
  myRateByType,
  openRateRow,
  setOpenRateRow,
  savedRow,
  setSavedRow,
  onDelete,
  onRateSaved,
  branchId,
  showAllChannels,
  t,
}: {
  competitors: Competitor[]
  roomTypes: string[]
  myRateByType: Record<string, number>
  openRateRow: string | null
  setOpenRateRow: (n: string | null) => void
  savedRow: string | null
  setSavedRow: (n: string | null) => void
  onDelete: (name: string) => void
  onRateSaved: () => void
  branchId: string
  showAllChannels: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any
}) {
  if (competitors.length === 0) {
    return (
      <div style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: '16px 18px',
        fontSize: 13,
        color: 'var(--color-text-tertiary)',
      }}>
        {t('emptyHint')}
      </div>
    )
  }
  return (
    <div style={{
      background: 'var(--color-bg)',
      border: '1px solid var(--color-border)',
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      {competitors.map((c, i) => (
        <div
          key={c.competitorName}
          style={{
            padding: '12px 14px',
            borderTop: i > 0 ? '1px solid var(--color-border)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <strong style={{ flex: 1, fontSize: 14 }}>{c.competitorName}</strong>
            {/* Per-competitor "updated today" badge — green tick when
                the lastUpdatedAt is on today's BKK calendar date, amber
                when not. Makes "what still needs my attention" a
                glance-level question. */}
            {(() => {
              const updatedToday = isUpdatedTodayBkk(c.lastUpdatedAt)
              const badgeStyle: React.CSSProperties = {
                fontSize: 11,
                fontWeight: 500,
                padding: '2px 8px',
                borderRadius: 999,
                background: updatedToday ? '#F0FDF4' : '#FFFBEB',
                color: updatedToday ? '#166534' : '#92400E',
                border: `1px solid ${updatedToday ? '#BBF7D0' : '#FCD34D'}`,
              }
              return (
                <span style={badgeStyle}>
                  {updatedToday ? `✓ ${t('updatedToday')}` : t('notUpdatedToday')}
                </span>
              )
            })()}
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              {c.lastRateThb != null
                ? t('lastRate', {
                    rate: c.lastRateThb.toLocaleString('th-TH'),
                    type: c.lastRateRoomType || 'Standard',
                  })
                : t('noRateYet')}
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {c.lastUpdatedAt ? t('lastUpdated', { ago: humanizeAgo(c.lastUpdatedAt, t) }) : ''}
            </span>
            <button
              type="button"
              onClick={() =>
                setOpenRateRow(openRateRow === c.competitorName ? null : c.competitorName)
              }
              style={updateBtn}
            >
              {openRateRow === c.competitorName ? t('cancel') : t('updateToday')}
            </button>
            <button
              type="button"
              aria-label={t('deleteAria')}
              onClick={() => onDelete(c.competitorName)}
              style={iconBtn}
            >
              <Trash2 size={13} />
            </button>
          </div>
          {openRateRow === c.competitorName && (
            <MultiChannelRateGrid
              competitorName={c.competitorName}
              roomTypes={roomTypes.length > 0 ? roomTypes : ['Standard']}
              todayRates={c.todayRates}
              lastRates={c.lastRates}
              myRateByType={myRateByType}
              showAllChannels={showAllChannels}
              branchId={branchId}
              onSaved={() => {
                const name = c.competitorName
                setSavedRow(name)
                onRateSaved()
                // Keep the grid open so the owner can fill more cells
                // in one sitting. "Saved ✓" pill blinks per cell save
                // to confirm individual writes (no global "all done"
                // affordance — closing the grid is an explicit "Done"
                // button).
                window.setTimeout(() => setSavedRow(null), 1800)
              }}
              onDone={() => setOpenRateRow(null)}
              t={t}
            />
          )}
          {savedRow === c.competitorName && (
            <span style={{ fontSize: 11, color: '#0F5132' }}>{t('saved')} ✓</span>
          )}
        </div>
      ))}
    </div>
  )
}

// Multi-channel rate entry grid. Rows = room types, columns = channels
// (1 column in OTA-only mode, 4 columns when "Show all channels" is on).
// Each cell is a numeric input that:
//   - pre-fills from today's saved rate for that (roomType, channel)
//     pair if one exists (server-side aggregation in route.ts GET)
//   - saves on blur — no global "save all" button. Sets a brief
//     per-cell "saving / saved ✓" indicator so the owner sees that
//     individual edits stuck. Errors stay attached to the cell.
//   - skips the network call when the value didn't actually change
//     (compares parsed number against the pre-fill).
function MultiChannelRateGrid({
  competitorName,
  roomTypes,
  todayRates,
  lastRates,
  myRateByType,
  showAllChannels,
  branchId,
  onSaved,
  onDone,
  t,
}: {
  competitorName: string
  roomTypes: string[]
  todayRates: Record<string, number>
  /** Most recent rate ever recorded per cell, regardless of date — see
   *  the Competitor interface's doc comment. Used to prefill a cell as
   *  a SUGGESTION (distinct from an already-confirmed todayRates value)
   *  when the selected date has no rate on file yet. */
  lastRates: Record<string, number>
  myRateByType: Record<string, number>
  showAllChannels: boolean
  branchId: string
  onSaved: () => void
  onDone: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any
}) {
  const channels: ChannelKey[] = showAllChannels ? [...CHANNEL_ORDER] : ['ota']
  const todayIso = bkkTodayIso()

  // Which calendar date this grid session is entering rates FOR — not
  // necessarily today (item 11: "support entering for a chosen date").
  const [selectedDate, setSelectedDate] = useState(todayIso)
  // Optional repeat — writes the same confirmed rate to this many
  // consecutive days starting at selectedDate (a lightweight date-
  // range: "same rate holds for the next N nights").
  const [daysCount, setDaysCount] = useState(1)

  // Per-cell local input value. Key = `${roomType}|${channel}`. Strings
  // so empty is distinguishable from explicit 0. Recomputed whenever
  // the selected date, channel set, or room-type list changes — a
  // plain lazy useState initializer would go stale the moment any of
  // those change after the grid first mounts.
  const [values, setValues] = useState<Record<string, string>>({})
  // Cells whose current value came from lastRates (a suggestion) not
  // todayRates (an already-confirmed value) — drives the "tap to
  // confirm" caption and lighter visual treatment.
  const [suggestedKeys, setSuggestedKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    const nextValues: Record<string, string> = {}
    const nextSuggested = new Set<string>()
    const isToday = selectedDate === todayIso
    for (const rt of roomTypes) {
      for (const ch of channels) {
        const key = `${rt}|${ch}`
        const confirmedToday = isToday ? todayRates[key] : undefined
        if (confirmedToday && confirmedToday > 0) {
          nextValues[key] = String(Math.round(confirmedToday))
          continue
        }
        const suggestion = lastRates[key]
        if (suggestion && suggestion > 0) {
          nextValues[key] = String(Math.round(suggestion))
          nextSuggested.add(key)
        } else {
          nextValues[key] = ''
        }
      }
    }
    setValues(nextValues)
    setSuggestedKeys(nextSuggested)
    // roomTypes/channels are derived from props each render (new array
    // identity every time) — depend on their serialized form instead
    // of the arrays themselves so this doesn't re-run every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, todayIso, roomTypes.join('|'), channels.join('|'), todayRates, lastRates])

  // Per-cell save state (idle / saving / saved / error).
  const [cellState, setCellState] = useState<Record<string, { status: 'idle' | 'saving' | 'saved' | 'error'; error?: string }>>({})

  function setCellValue(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
    setSuggestedKeys((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  async function saveCell(roomType: string, channel: ChannelKey) {
    const key = `${roomType}|${channel}`
    const raw = values[key]
    if (raw == null || raw === '') {
      // Allow clearing the cell back to empty — no DELETE yet (the
      // schema requires keeping today's row to maintain the unique
      // index integrity). Just skip the save.
      return
    }
    const n = Number(raw)
    if (Number.isNaN(n) || n <= 0) {
      setCellState((s) => ({ ...s, [key]: { status: 'error', error: t('errorRateRequired') } }))
      return
    }
    // Skip-when-unchanged only applies when we actually KNOW the
    // on-file value for the exact selected date (i.e. today, via
    // todayRates) — for any other date we don't have that data, so
    // always attempt the save; the upsert's dedupe key makes a
    // no-op re-save harmless either way.
    if (selectedDate === todayIso && !suggestedKeys.has(key)) {
      const existing = todayRates[key]
      if (existing && Math.round(existing) === Math.round(n)) {
        return
      }
    }
    setCellState((s) => ({ ...s, [key]: { status: 'saving' } }))
    try {
      const dates = Array.from({ length: Math.max(1, Math.min(daysCount, 60)) }, (_, i) => addDaysIso(selectedDate, i))
      const rows = dates.map((d) => ({ competitorName, roomType, rateThb: n, capturedAt: d, channel }))
      const res = await fetch(`/api/branches/${branchId}/competitor-rates/batch-commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || (body?.failed ?? 0) > 0) {
        const firstError = body?.results?.find((r: { ok: boolean }) => !r.ok)
        const msg = firstError?.messageTh || body?.error || res.statusText
        setCellState((s) => ({ ...s, [key]: { status: 'error', error: msg } }))
        return
      }
      setCellState((s) => ({ ...s, [key]: { status: 'saved' } }))
      setSuggestedKeys((prev) => {
        if (!prev.has(key)) return prev
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      onSaved()
      window.setTimeout(() => {
        setCellState((s) => ({ ...s, [key]: { status: 'idle' } }))
      }, 1800)
    } catch {
      setCellState((s) => ({ ...s, [key]: { status: 'error', error: t('errorRateRequired') } }))
    }
  }

  return (
    <div
      style={{
        background: 'var(--color-bg-surface)',
        borderRadius: 8,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Date + repeat-days controls — which calendar date(s) this
          session's saves apply to. Defaults to today (unchanged
          behavior); picking another date switches every cell's
          prefill/skip-if-unchanged logic to that date instead (see the
          useEffect above and saveCell). */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('batchDateLabel')}
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value || todayIso)}
            style={{ padding: '4px 6px', fontSize: 12, border: '1px solid var(--color-border)', borderRadius: 4 }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('batchDaysLabel', { n: daysCount })}
          <input
            type="number"
            min={1}
            max={60}
            value={daysCount}
            onChange={(e) => setDaysCount(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
            style={{ width: 56, padding: '4px 6px', fontSize: 12, border: '1px solid var(--color-border)', borderRadius: 4 }}
          />
        </label>
      </div>

      {/* Column header row — Room type label + one column per channel. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `minmax(120px, 1fr) repeat(${channels.length}, minmax(110px, 1fr))`,
          gap: 8,
          paddingBottom: 6,
          borderBottom: '1px solid var(--color-border)',
          fontSize: 10,
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--color-text-tertiary)',
        }}
      >
        <div>{t('colRoomType')}</div>
        {channels.map((ch) => (
          <div key={ch}>{t(`channel.${ch}.label`)}</div>
        ))}
      </div>

      {/* One row per room type. */}
      {roomTypes.map((rt) => (
        <div
          key={rt}
          style={{
            display: 'grid',
            gridTemplateColumns: `minmax(120px, 1fr) repeat(${channels.length}, minmax(110px, 1fr))`,
            gap: 8,
            alignItems: 'start',
          }}
        >
          <div style={{ paddingTop: 6 }}>
            <div style={{ fontSize: 13 }}>{rt}</div>
            {/* "Our rate" reference — shown only when we have one for
                this room type. Anchors the green/red delta cells to a
                visible number rather than an invisible mental model. */}
            {myRateByType[rt] > 0 && (
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                {t('ourRate')}: ฿{Math.round(myRateByType[rt]).toLocaleString('th-TH')}
              </div>
            )}
          </div>
          {channels.map((ch) => {
            const key = `${rt}|${ch}`
            const state = cellState[key] ?? { status: 'idle' as const }
            // Delta vs "our rate" for this room type — drives the
            // colored border and the "+฿X / -฿X vs ours" caption.
            // Only render the delta indicator when:
            //   - we have a known rate for this room type
            //   - the cell has a current valid value
            //   - the channel is OTA (other channels aren't directly
            //     comparable to our base rate — see channel notes in
            //     i18n)
            const ourRate = myRateByType[rt]
            const parsedCellRate = (() => {
              const v = values[key]
              if (!v) return null
              const n = Number(v)
              return Number.isFinite(n) && n > 0 ? Math.round(n) : null
            })()
            const showDelta = ch === 'ota' && ourRate && ourRate > 0 && parsedCellRate != null
            const deltaThb = showDelta ? parsedCellRate - Math.round(ourRate) : 0
            const isAbove = showDelta && deltaThb > 0
            const isBelow = showDelta && deltaThb < 0
            const isSuggested = suggestedKeys.has(key)
            const borderColor = state.status === 'error'
              ? '#FECACA'
              : isSuggested
                ? '#FCD34D'
                : isAbove
                  ? '#BBF7D0'
                  : isBelow
                    ? '#FECACA'
                    : 'var(--color-border)'
            return (
              <div key={key}>
                <input
                  type="number"
                  inputMode="numeric"
                  value={values[key] ?? ''}
                  onChange={(e) => setCellValue(key, e.target.value)}
                  onBlur={() => saveCell(rt, ch)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  }}
                  placeholder="฿"
                  min={1}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: 13,
                    border: `1px solid ${borderColor}`,
                    borderRadius: 4,
                    background: isSuggested ? '#FFFBEB' : 'var(--color-bg)',
                    color: 'var(--color-text-primary)',
                  }}
                />
                {/* Prefilled from the competitor's last-known rate, not
                    yet confirmed for the selected date — one tap
                    (blur/Enter) commits it as-is, or the operator edits
                    first. */}
                {isSuggested && state.status === 'idle' && (
                  <p style={{ fontSize: 10, marginTop: 2, color: '#92400E' }}>
                    {t('batchSuggested', { rate: values[key] })}
                  </p>
                )}
                {/* Delta vs our rate — green when competitor priced
                    above us (opportunity), red when below (risk). */}
                {showDelta && deltaThb !== 0 && (
                  <p
                    style={{
                      fontSize: 10,
                      marginTop: 2,
                      color: isAbove ? '#166534' : '#991B1B',
                    }}
                  >
                    {isAbove ? '+' : ''}฿{deltaThb.toLocaleString('th-TH')} {t('vsOurs')}
                  </p>
                )}
                {state.status === 'saving' && (
                  <p style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                    {t('savingLabel')}
                  </p>
                )}
                {state.status === 'saved' && (
                  <p style={{ fontSize: 10, color: '#0F5132', marginTop: 2 }}>
                    {t('saved')} ✓
                  </p>
                )}
                {state.status === 'error' && state.error && (
                  <p style={{ fontSize: 10, color: '#A32D2D', marginTop: 2 }}>{state.error}</p>
                )}
              </div>
            )
          })}
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <button type="button" onClick={onDone} style={secondaryBtn}>
          {t('done')}
        </button>
      </div>
    </div>
  )
}

// Tomorrow's BKK calendar date — the daily-check convention (owners
// check tomorrow's rate). Shared by the CSV template's start date and
// the screenshot-import panel's default stay date.
function tomorrowBkk(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + 24 * 60 * 60 * 1000))
}

// Today's BKK calendar date (YYYY-MM-DD) — the batch-entry grid's
// date-picker default, and the "is this cell already confirmed for
// the selected date" check (only meaningful when selectedDate === this).
function bkkTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// Pure date-string arithmetic (no TZ reads) for the grid's "repeat for
// N days" range — mirrors the same UTC-midnight-anchor pattern used
// throughout the engine/loader code for YYYY-MM-DD arithmetic.
function addDaysIso(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Returns a short string like "2 hours ago" / "3 hr ago" in the
// active locale. Falls back to the raw timestamp when the diff is
// True when the timestamp falls on today's Bangkok calendar date.
// Used by the "Updated today" badge on each competitor row — gives the
// owner a glance-level "what still needs my attention" signal each
// morning. Null lastUpdatedAt is treated as not-updated.
function isUpdatedTodayBkk(iso: string | null): boolean {
  if (!iso) return false
  const todayBkk = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const updatedBkk = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
  return todayBkk === updatedBkk
}

// implausibly large (clock skew).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function humanizeAgo(iso: string, t: any): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMs = Math.max(0, now - then)
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return t('agoMinutes', { n: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t('agoHours', { n: hours })
  const days = Math.floor(hours / 24)
  return t('agoDays', { n: days })
}

const input: React.CSSProperties = {
  flex: 1,
  minWidth: 140,
  padding: '8px 10px',
  fontSize: 13,
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  background: 'var(--color-bg)',
  color: 'var(--color-text-primary)',
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

const updateBtn: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: 12,
  fontWeight: 500,
  border: '1px solid var(--color-accent, #534AB7)',
  borderRadius: 6,
  background: 'transparent',
  color: 'var(--color-accent, #534AB7)',
  cursor: 'pointer',
}

const iconBtn: React.CSSProperties = {
  padding: 6,
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  background: 'transparent',
  color: '#A32D2D',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
}

const addBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 500,
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  background: 'var(--color-bg)',
  color: 'var(--color-text-primary)',
  cursor: 'pointer',
}
