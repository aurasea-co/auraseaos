'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle, Trash2, X } from 'lucide-react'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import type { RoomTypeOccupancy } from '@/lib/ingestion/types'

// Settings → ประเภทห้อง (Room types). Aggregates distinct room types
// from accommodation_daily_metrics.room_type_breakdown for the active
// hotel branch, lets the owner delete a bad import surgically (per
// the DELETE handler at /api/branches/[branchId]/rooms/[roomType]).

interface RoomTypeRow {
  roomType: string
  inventory: number  // max totalRooms across days — best-guess inventory
  latestRateThb: number  // rate from the most recent day this type appears
  dayCount: number
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
        setError(json.error || res.statusText)
        return
      }
      const total = (json.affectedDays ?? 0) + (json.deletedDays ?? 0)
      setToast(t('deleteSuccess', { type: deleteTarget.roomType, days: total }))
      window.setTimeout(() => setToast(null), 3500)
      setDeleteTarget(null)
      setConfirmChecked(false)
      await reload()
    } finally {
      setSubmitting(false)
    }
  }

  if (role !== 'owner') return null
  if (!activeBranch) return null

  // Only meaningful for hotel branches. F&B owners shouldn't see this
  // page wired up at all (the nav entry could be hidden by branch
  // type, but the page itself early-returns as a safety net).
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
          {activeBranch.name} · {t('subtitle')}
        </p>
      </div>

      {loading && (
        <div style={{ padding: 24, color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          {t('loading')}
        </div>
      )}

      {!loading && rows.length === 0 && (
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
                  <tr
                    key={r.roomType}
                    style={{ borderTop: '1px solid var(--color-border)' }}
                  >
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
                    <td style={td}>{r.inventory}</td>
                    <td style={td}>฿{r.latestRateThb.toLocaleString('th-TH')}</td>
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
            {t('modalTitle', { type: target.roomType })}
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
          {t('modalBody', { type: target.roomType, days: target.dayCount })}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={confirmChecked}
            onChange={(e) => setConfirmChecked(e.target.checked)}
            disabled={submitting}
          />
          {t('modalConfirm')}
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
            {submitting ? t('deletingLabel') : t('confirmDelete', { type: target.roomType })}
          </button>
        </div>
      </div>
    </div>
  )
}

// Collapses raw breakdown rows from accommodation_daily_metrics into
// one row per distinct room_type. inventory uses max(totalRooms) per
// type (same convention as the dashboard's room-type breakdown
// aggregator). latestRateThb walks the rows newest-first and takes
// the first hit; rows are pre-ordered DESC at the call site.
function aggregateRoomTypes(rows: MetricRow[]): RoomTypeRow[] {
  type Agg = { inventory: number; latestRateThb: number; dayCount: number }
  const byType = new Map<string, Agg>()
  for (const row of rows) {
    const breakdown = Array.isArray(row.room_type_breakdown) ? row.room_type_breakdown : []
    for (const b of breakdown) {
      const existing = byType.get(b.roomType) || { inventory: 0, latestRateThb: 0, dayCount: 0 }
      existing.inventory = Math.max(existing.inventory, b.totalRooms || 0)
      // Newest-first iteration → first non-zero rate is the latest.
      if (!existing.latestRateThb && b.rateThb) existing.latestRateThb = Math.round(b.rateThb)
      existing.dayCount += 1
      byType.set(b.roomType, existing)
    }
  }
  return Array.from(byType.entries())
    .map(([roomType, agg]) => ({ roomType, ...agg }))
    .sort((a, b) => b.dayCount - a.dayCount)
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  fontWeight: 500,
  fontSize: 11,
  color: 'var(--color-text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const td: React.CSSProperties = {
  padding: '10px 12px',
  color: 'var(--color-text-primary)',
}

const deleteBtn: React.CSSProperties = {
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
