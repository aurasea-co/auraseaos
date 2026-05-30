'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ArrowLeft, Trash2, Plus, X } from 'lucide-react'
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
}

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
            <RateEntry
              competitorName={c.competitorName}
              roomTypes={roomTypes}
              defaultRoomType={c.lastRateRoomType || roomTypes[0] || 'Standard'}
              branchId={branchId}
              onSaved={() => {
                const name = c.competitorName
                setSavedRow(name)
                setOpenRateRow(null)
                onRateSaved()
                // Direct value clear after 1.8s — the parent owns the
                // `savedRow` state and only this row should ever be
                // showing "Saved ✓" at a time, so unconditionally
                // clearing the latest set is safe.
                window.setTimeout(() => setSavedRow(null), 1800)
              }}
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

function RateEntry({
  competitorName,
  roomTypes,
  defaultRoomType,
  branchId,
  onSaved,
  t,
}: {
  competitorName: string
  roomTypes: string[]
  defaultRoomType: string
  branchId: string
  onSaved: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any
}) {
  const [roomType, setRoomType] = useState(defaultRoomType)
  const [rateThb, setRateThb] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)
    const n = Number(rateThb)
    if (!rateThb || Number.isNaN(n) || n <= 0) {
      setError(t('errorRateRequired'))
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/branches/${branchId}/competitor-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitorName, roomType, rateThb: n }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body?.messageTh || body?.error || res.statusText)
        return
      }
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      background: 'var(--color-bg-surface)',
      borderRadius: 8,
      padding: 10,
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      flexWrap: 'wrap',
    }}>
      <select
        value={roomType}
        onChange={(e) => setRoomType(e.target.value)}
        style={{ ...input, maxWidth: 160 }}
      >
        {roomTypes.map((rt) => (
          <option key={rt} value={rt}>{rt}</option>
        ))}
      </select>
      <input
        type="number"
        inputMode="numeric"
        value={rateThb}
        onChange={(e) => setRateThb(e.target.value)}
        placeholder={t('ratePlaceholder')}
        min={1}
        style={{ ...input, maxWidth: 120 }}
        onKeyDown={(e) => { if (e.key === 'Enter') save() }}
        autoFocus
      />
      <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>฿</span>
      <button type="button" onClick={save} disabled={submitting} style={primaryBtn}>
        {submitting ? t('savingLabel') : t('save')}
      </button>
      {error && (
        <span style={{ fontSize: 12, color: '#A32D2D' }}>
          <X size={10} style={{ display: 'inline', marginRight: 4 }} />
          {error}
        </span>
      )}
    </div>
  )
}

// Returns a short string like "2 hours ago" / "3 hr ago" in the
// active locale. Falls back to the raw timestamp when the diff is
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
