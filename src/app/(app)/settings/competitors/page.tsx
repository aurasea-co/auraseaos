'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ArrowLeft, Trash2, Plus } from 'lucide-react'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import type { RoomTypeOccupancy } from '@/lib/ingestion/types'

// Settings → ราคาคู่แข่ง (Competitor rates). A 2-minute daily task for
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
}

// Rate channels supported by the migration 033 CHECK constraint.
// Same set as RATE_CHANNELS in lib/types/competitor-rates.ts; kept
// local for the dropdown render order (we surface OTA first because
// it's the default daily-check channel).
const CHANNEL_ORDER = ['ota', 'walk_in', 'package', 'promo'] as const
type ChannelKey = (typeof CHANNEL_ORDER)[number]

interface MetricRowForRoomTypes {
  room_type_breakdown: RoomTypeOccupancy[] | null
}

export default function CompetitorsPage() {
  const t = useTranslations('settingsCompetitors')
  const { activeBranch, role } = useUser()
  const supabase = createClient()

  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [maxCompetitors, setMaxCompetitors] = useState(5)
  const [roomTypes, setRoomTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addName, setAddName] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openRateRow, setOpenRateRow] = useState<string | null>(null)
  const [savedRow, setSavedRow] = useState<string | null>(null)
  // Channel-mode toggle. OTA-only is the default because that's the
  // daily 2-minute task (check Agoda); expanding to all channels is
  // opt-in for the occasional full competitive shop.
  const [showAllChannels, setShowAllChannels] = useState(false)

  const reload = useCallback(async () => {
    if (!activeBranch) return
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
          .select('room_type_breakdown')
          .eq('branch_id', activeBranch.id)
          .order('metric_date', { ascending: false })
          .limit(30),
      ])
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
    } finally {
      setLoading(false)
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

  if (role !== 'owner') return null
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
      <div className="flex items-center gap-2 lg:hidden">
        <Link href="/settings" style={{ padding: 4, color: '#6b6b6b' }}>
          <ArrowLeft size={18} />
        </Link>
        <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>{t('title')}</h2>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2
            className="hidden lg:block"
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

      {!loading && (
        <>
          <CompetitorList
            competitors={competitors}
            roomTypes={roomTypes}
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
  showAllChannels,
  branchId,
  onSaved,
  onDone,
  t,
}: {
  competitorName: string
  roomTypes: string[]
  todayRates: Record<string, number>
  showAllChannels: boolean
  branchId: string
  onSaved: () => void
  onDone: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any
}) {
  const channels: ChannelKey[] = showAllChannels ? [...CHANNEL_ORDER] : ['ota']

  // Per-cell local input value. Key = `${roomType}|${channel}`. Strings
  // so empty is distinguishable from explicit 0.
  const [values, setValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const rt of roomTypes) {
      for (const ch of channels) {
        const key = `${rt}|${ch}`
        const existing = todayRates[key]
        out[key] = existing && existing > 0 ? String(Math.round(existing)) : ''
      }
    }
    return out
  })
  // Per-cell save state (idle / saving / saved / error).
  const [cellState, setCellState] = useState<Record<string, { status: 'idle' | 'saving' | 'saved' | 'error'; error?: string }>>({})

  function setCellValue(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
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
    // Skip when unchanged from the server-side pre-fill.
    const existing = todayRates[key]
    if (existing && Math.round(existing) === Math.round(n)) {
      return
    }
    setCellState((s) => ({ ...s, [key]: { status: 'saving' } }))
    try {
      const res = await fetch(`/api/branches/${branchId}/competitor-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitorName, roomType, rateThb: n, channel }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = body?.messageTh || body?.error || res.statusText
        setCellState((s) => ({ ...s, [key]: { status: 'error', error: msg } }))
        return
      }
      setCellState((s) => ({ ...s, [key]: { status: 'saved' } }))
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
          <div style={{ fontSize: 13, paddingTop: 6 }}>{rt}</div>
          {channels.map((ch) => {
            const key = `${rt}|${ch}`
            const state = cellState[key] ?? { status: 'idle' as const }
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
                    border: `1px solid ${state.status === 'error' ? '#FECACA' : 'var(--color-border)'}`,
                    borderRadius: 4,
                    background: 'var(--color-bg)',
                    color: 'var(--color-text-primary)',
                  }}
                />
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
