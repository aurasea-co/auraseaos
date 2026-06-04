'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle, Trash2, X, Plus, Check } from 'lucide-react'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import type { RoomTypeOccupancy } from '@/lib/ingestion/types'

// Settings → ประเภทห้อง (Room types).
//
// Editable surface for the branch's room configuration. Edits land on
// the most recent accommodation_daily_metrics row's room_type_breakdown
// jsonb — the same jsonb the rate engine reads as `currentRate`, so a
// rack-rate edit here shows up in tomorrow morning's LINE brief.
//
// Read shape (display): we still aggregate ALL historical rows to show
// the dayCount column (which gives owners a "how much history does this
// type have" signal). But writes land ONLY on the latest row — that's
// the forward-looking semantics the spec calls for.
//
// Permissions: owner OR manager. Staff get an early-return. The API
// re-checks via authorizeRoomsMutation so a tampered client can't bypass.

interface RoomTypeRow {
  roomType: string
  inventory: number          // totalRooms on the LATEST row (forward-looking config)
  latestRateThb: number      // rateThb on the latest row
  dayCount: number           // # historical rows carrying this type (informational)
}

interface MetricRow {
  metric_date: string
  room_type_breakdown: RoomTypeOccupancy[] | null
}

export default function RoomsSettingsPage() {
  const t = useTranslations('settingsRooms')
  const { activeBranch, role } = useUser()
  const supabase = createClient()

  const [rows, setRows] = useState<RoomTypeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<RoomTypeRow | null>(null)
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Inline-edit state — { roomType, field } identifies the active cell.
  const [editingCell, setEditingCell] = useState<{ roomType: string; field: 'rooms' | 'rate' } | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [savedFlash, setSavedFlash] = useState<string | null>(null)  // roomType:field key
  // Add-form state.
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addRooms, setAddRooms] = useState('')
  const [addRate, setAddRate] = useState('')

  const canEdit = role === 'owner' || role === 'manager'

  const reload = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data } = await db
      .from('accommodation_daily_metrics')
      .select('metric_date, room_type_breakdown')
      .eq('branch_id', activeBranch.id)
      .order('metric_date', { ascending: false })
    setRows(aggregateRoomTypes((data as MetricRow[]) || []))
    setLoading(false)
  }, [activeBranch, supabase])

  useEffect(() => { reload() }, [reload])

  const maxDayCount = useMemo(
    () => rows.reduce((m, r) => Math.max(m, r.dayCount), 0),
    [rows],
  )

  function flashSaved(key: string) {
    setSavedFlash(key)
    window.setTimeout(() => setSavedFlash((cur) => (cur === key ? null : cur)), 1500)
  }

  function showToast(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2500)
  }

  async function performDelete() {
    if (!deleteTarget || !activeBranch || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/branches/${activeBranch.id}/rooms/${encodeURIComponent(deleteTarget.roomType)}`,
        { method: 'DELETE' },
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        setError(json.error ? t.has(`errors.${json.code}`) ? t(`errors.${json.code}`) : json.error : res.statusText)
        return
      }
      showToast(t('removeFromConfigSuccess', { type: deleteTarget.roomType }))
      setDeleteTarget(null)
      setConfirmChecked(false)
      await reload()
    } finally {
      setSubmitting(false)
    }
  }

  async function saveCellEdit(target: RoomTypeRow, field: 'rooms' | 'rate', raw: string) {
    if (!activeBranch) return
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0 || (field === 'rooms' && !Number.isInteger(n))) {
      setError(t(field === 'rooms' ? 'errors.total_rooms_invalid' : 'errors.rate_invalid'))
      setEditingCell(null)
      return
    }
    // Optimistic update.
    const key = `${target.roomType}:${field}`
    const optimisticRows = rows.map((r) =>
      r.roomType === target.roomType
        ? { ...r, ...(field === 'rooms' ? { inventory: n } : { latestRateThb: n }) }
        : r,
    )
    setRows(optimisticRows)
    setEditingCell(null)
    setSubmitting(true)
    setError(null)
    try {
      const body = field === 'rooms' ? { totalRooms: n } : { rateThb: n }
      const res = await fetch(
        `/api/branches/${activeBranch.id}/rooms/${encodeURIComponent(target.roomType)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        setError(json.code && t.has(`errors.${json.code}`) ? t(`errors.${json.code}`) : (json.error || res.statusText))
        await reload()  // roll back optimistic state
        return
      }
      flashSaved(key)
      await reload()
    } finally {
      setSubmitting(false)
    }
  }

  async function performAdd() {
    if (!activeBranch || submitting) return
    const name = addName.trim()
    if (!name) {
      setError(t('errors.room_type_required'))
      return
    }
    const rooms = Number(addRooms)
    const rate = Number(addRate)
    if (!Number.isFinite(rooms) || rooms < 0 || !Number.isInteger(rooms)) {
      setError(t('errors.total_rooms_invalid'))
      return
    }
    if (!Number.isFinite(rate) || rate < 0) {
      setError(t('errors.rate_invalid'))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/branches/${activeBranch.id}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomType: name, totalRooms: rooms, rateThb: rate }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        setError(json.code && t.has(`errors.${json.code}`) ? t(`errors.${json.code}`) : (json.error || res.statusText))
        return
      }
      showToast(t('addSuccess', { type: name }))
      setAddName('')
      setAddRooms('')
      setAddRate('')
      setShowAdd(false)
      await reload()
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render gates ──────────────────────────────────────────────────
  if (!canEdit) return null
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
        <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 }}>
          {t('title')}
        </h2>
      </div>
      <div>
        <h2
          className="hidden lg:block"
          style={{ fontSize: 'var(--font-size-lg)', fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 }}
        >
          {t('title')}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
          {activeBranch.name} · {t('editableSubtitle')}
        </p>
      </div>

      {/* Add room type — collapsed button, expanded form */}
      {!showAdd ? (
        <button
          type="button"
          onClick={() => { setShowAdd(true); setError(null) }}
          style={primaryBtn}
        >
          <Plus size={14} /> {t('addCta')}
        </button>
      ) : (
        <div style={{
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          padding: 14,
          display: 'grid',
          gridTemplateColumns: 'minmax(140px, 2fr) 100px 130px auto auto',
          gap: 8,
          alignItems: 'end',
        }}>
          <FormCell label={t('colRoomType')}>
            <input
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              maxLength={80}
              placeholder={t('addNamePlaceholder')}
              style={textInput}
              autoFocus
            />
          </FormCell>
          <FormCell label={t('colRooms')}>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={addRooms}
              onChange={(e) => setAddRooms(e.target.value)}
              placeholder="0"
              style={textInput}
            />
          </FormCell>
          <FormCell label={t('colRate')}>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={addRate}
              onChange={(e) => setAddRate(e.target.value)}
              placeholder="฿"
              style={textInput}
            />
          </FormCell>
          <button type="button" onClick={performAdd} disabled={submitting} style={primaryBtn}>
            {submitting ? t('savingLabel') : t('save')}
          </button>
          <button
            type="button"
            onClick={() => { setShowAdd(false); setAddName(''); setAddRooms(''); setAddRate(''); setError(null) }}
            disabled={submitting}
            style={secondaryBtn}
          >
            {t('cancel')}
          </button>
        </div>
      )}

      {error && (
        <div style={{ padding: '8px 12px', background: '#FBEAEA', color: '#A32D2D', borderRadius: 6, fontSize: 12 }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ padding: 24, color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          {t('loading')}
        </div>
      )}

      {!loading && rows.length === 0 && !showAdd && (
        <div style={{
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: '16px 18px',
          fontSize: 13,
          color: 'var(--color-text-tertiary)',
        }}>
          {t('emptyHint')}{' '}
          <Link href="/settings/import" style={{ color: 'var(--color-accent, #534AB7)' }}>
            {t('emptyCta')} →
          </Link>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={th}>{t('colRoomType')}</th>
                <th style={th}>{t('colRooms')}</th>
                <th style={th}>{t('colRate')}</th>
                <th style={th}>{t('colDays')}</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const suspicious = maxDayCount > 1 && r.dayCount < maxDayCount * 0.5
                return (
                  <tr key={r.roomType} style={{ borderTop: '1px solid var(--color-border)' }}>
                    <td style={td}>
                      <span style={{ fontWeight: 500 }}>{r.roomType}</span>
                      {suspicious && (
                        <span style={{
                          marginLeft: 8,
                          fontSize: 10,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: '#FFF4E0',
                          color: '#8A5A00',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}>
                          <AlertTriangle size={10} />
                          {t('possibleImportError')}
                        </span>
                      )}
                    </td>
                    <td style={td}>
                      <EditableCell
                        active={editingCell?.roomType === r.roomType && editingCell.field === 'rooms'}
                        flashing={savedFlash === `${r.roomType}:rooms`}
                        display={String(r.inventory)}
                        onStart={() => { setEditingCell({ roomType: r.roomType, field: 'rooms' }); setEditValue(String(r.inventory)); setError(null) }}
                        value={editValue}
                        onChange={setEditValue}
                        onCommit={() => saveCellEdit(r, 'rooms', editValue)}
                        onCancel={() => setEditingCell(null)}
                        ariaLabel={t('editRoomsAria', { type: r.roomType })}
                      />
                    </td>
                    <td style={td}>
                      <EditableCell
                        active={editingCell?.roomType === r.roomType && editingCell.field === 'rate'}
                        flashing={savedFlash === `${r.roomType}:rate`}
                        display={`฿${r.latestRateThb.toLocaleString('th-TH')}`}
                        onStart={() => { setEditingCell({ roomType: r.roomType, field: 'rate' }); setEditValue(String(r.latestRateThb)); setError(null) }}
                        value={editValue}
                        onChange={setEditValue}
                        onCommit={() => saveCellEdit(r, 'rate', editValue)}
                        onCancel={() => setEditingCell(null)}
                        ariaLabel={t('editRateAria', { type: r.roomType })}
                      />
                    </td>
                    <td style={{ ...td, color: 'var(--color-text-tertiary)' }}>
                      {t('dayCount', { n: r.dayCount })}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => { setDeleteTarget(r); setConfirmChecked(false); setError(null) }}
                        style={deleteBtn}
                        aria-label={`${t('deleteAria')} ${r.roomType}`}
                      >
                        <Trash2 size={13} />
                        {t('delete')}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <DeleteModal
          target={deleteTarget}
          confirmChecked={confirmChecked}
          setConfirmChecked={setConfirmChecked}
          submitting={submitting}
          error={error}
          onCancel={() => { setDeleteTarget(null); setConfirmChecked(false); setError(null) }}
          onConfirm={performDelete}
          t={t}
        />
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed', bottom: 24, right: 24,
            background: '#0F5132', color: '#fff',
            padding: '10px 16px', borderRadius: 8, fontSize: 13,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 200,
          }}
        >
          ✓ {toast}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────

function FormCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block',
        fontSize: 10,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--color-text-tertiary)',
        marginBottom: 4,
      }}>
        {label}
      </label>
      {children}
    </div>
  )
}

interface EditableCellProps {
  active: boolean
  flashing: boolean
  display: string
  value: string
  ariaLabel: string
  onStart: () => void
  onChange: (v: string) => void
  onCommit: () => void
  onCancel: () => void
}

function EditableCell({ active, flashing, display, value, ariaLabel, onStart, onChange, onCommit, onCancel }: EditableCellProps) {
  if (active) {
    return (
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') onCancel()
        }}
        autoFocus
        aria-label={ariaLabel}
        style={{
          width: '100%',
          maxWidth: 110,
          padding: '4px 8px',
          fontSize: 13,
          border: '1px solid var(--color-accent, #534AB7)',
          borderRadius: 4,
          background: 'var(--color-bg)',
          color: 'var(--color-text-primary)',
        }}
      />
    )
  }
  return (
    <button
      type="button"
      onClick={onStart}
      aria-label={ariaLabel}
      style={{
        background: flashing ? '#E8F8F0' : 'transparent',
        border: 'none',
        padding: '4px 6px',
        margin: '-4px -6px',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 13,
        color: 'var(--color-text-primary)',
        textAlign: 'left',
        fontFamily: 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        transition: 'background 0.2s',
      }}
    >
      {display}
      {flashing && <Check size={12} style={{ color: '#0F5132' }} />}
    </button>
  )
}

function DeleteModal({
  target,
  confirmChecked,
  setConfirmChecked,
  submitting,
  error,
  onCancel,
  onConfirm,
  t,
}: {
  target: RoomTypeRow
  confirmChecked: boolean
  setConfirmChecked: (v: boolean) => void
  submitting: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 200, padding: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, padding: 22,
          maxWidth: 440, width: '100%',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            {t('modalTitleForward', { type: target.roomType })}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('cancel')}
            style={{ background: 'transparent', border: 'none', color: '#9b9b9b', cursor: 'pointer', padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>
        <div style={{ fontSize: 13, color: '#3a3a3a', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
          {t('modalBodyForward', { type: target.roomType, days: target.dayCount })}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={confirmChecked}
            onChange={(e) => setConfirmChecked(e.target.checked)}
            disabled={submitting}
          />
          {t('modalConfirmForward')}
        </label>

        {error && (
          <div style={{ marginTop: 10, padding: '6px 10px', background: '#FBEAEA', color: '#A32D2D', borderRadius: 6, fontSize: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={{
              padding: '8px 14px', fontSize: 13,
              border: '1px solid #d4d4d4', borderRadius: 8,
              background: 'transparent', color: '#6b6b6b',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!confirmChecked || submitting}
            style={{
              padding: '8px 14px', fontSize: 13, fontWeight: 500,
              border: 'none', borderRadius: 8,
              background: !confirmChecked || submitting ? '#9b9b9b' : '#A32D2D',
              color: '#fff',
              cursor: !confirmChecked || submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? t('deletingLabel') : t('confirmRemoveForward', { type: target.roomType })}
          </button>
        </div>
      </div>
    </div>
  )
}

// Aggregate ALL historical rows for the dayCount column, but pull
// inventory + latestRateThb from the LATEST row only — that's what the
// page edits and what the engine reads. dayCount is informational.
function aggregateRoomTypes(rows: MetricRow[]): RoomTypeRow[] {
  type Agg = { latestInventory: number; latestRateThb: number; dayCount: number; seenInLatest: boolean }
  const byType = new Map<string, Agg>()
  const latest = rows[0]
  const latestBreakdown = Array.isArray(latest?.room_type_breakdown) ? latest.room_type_breakdown : []
  for (const b of latestBreakdown) {
    byType.set(b.roomType, {
      latestInventory: b.totalRooms || 0,
      latestRateThb: Math.round(b.rateThb || 0),
      dayCount: 0,
      seenInLatest: true,
    })
  }
  for (const row of rows) {
    const breakdown = Array.isArray(row.room_type_breakdown) ? row.room_type_breakdown : []
    for (const b of breakdown) {
      const existing = byType.get(b.roomType)
      if (existing) {
        existing.dayCount += 1
      }
      // Historical-only types (existed in older rows but not the latest)
      // aren't shown here — they've been removed from the live config.
      // Their data is preserved in audit + the historical rows themselves.
    }
  }
  return Array.from(byType.entries())
    .filter(([, a]) => a.seenInLatest)
    .map(([roomType, a]) => ({
      roomType,
      inventory: a.latestInventory,
      latestRateThb: a.latestRateThb,
      dayCount: a.dayCount,
    }))
    .sort((a, b) => b.dayCount - a.dayCount)
}

const th: CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  fontWeight: 500,
  fontSize: 11,
  color: 'var(--color-text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const td: CSSProperties = {
  padding: '10px 12px',
  color: 'var(--color-text-primary)',
}

const deleteBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 10px',
  fontSize: 12,
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  background: 'transparent',
  color: '#A32D2D',
  cursor: 'pointer',
}

const textInput: CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  fontSize: 13,
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  background: 'var(--color-bg)',
  color: 'var(--color-text-primary)',
}

const primaryBtn: CSSProperties = {
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 500,
  background: 'var(--color-accent, #534AB7)',
  color: 'white',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  alignSelf: 'flex-start',
}

const secondaryBtn: CSSProperties = {
  padding: '8px 14px',
  fontSize: 13,
  background: 'transparent',
  color: 'var(--color-text-secondary)',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  cursor: 'pointer',
}
