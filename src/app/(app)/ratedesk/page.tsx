'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, Upload, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { SparklineChart } from '@/components/sparkline-chart'

// RateDesk — hotel-specific dashboard.
//
// Reads accommodation_daily_metrics + competitor_rates for the active
// branch over a selectable window (30 / 60 / 90 days). Renders KPI
// cards with vs-prior-period deltas, a 30-day occupancy sparkline,
// the room-type breakdown table (derived from the most recent day's
// room_type_breakdown jsonb), and a competitor-rate overlay panel.
//
// Empty state surfaces the CSV import CTA — the only way to bulk-seed
// historical data right now.

interface MetricRow {
  metric_date: string
  total_rooms: number | null
  rooms_sold: number | null
  revenue: number | null
  room_type_breakdown: Array<{
    roomType: string
    totalRooms: number
    occupiedRooms: number
    rateThb: number
  }> | null
}

interface CompetitorRow {
  competitor_name: string
  room_type: string
  rate: number
  captured_at: string
}

const WINDOWS = [30, 60, 90] as const
type Window = (typeof WINDOWS)[number]

export default function RateDeskPage() {
  const { activeBranch } = useUser()
  const t = useTranslations('ratedesk')
  const [window, setWindow] = useState<Window>(30)
  const [rows, setRows] = useState<MetricRow[]>([])
  const [priorRows, setPriorRows] = useState<MetricRow[]>([])
  const [competitors, setCompetitors] = useState<CompetitorRow[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const load = useCallback(async () => {
    if (!activeBranch || activeBranch.business_type !== 'accommodation') {
      setLoading(false)
      return
    }
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const endDate = new Date()
    const windowStart = new Date(endDate.getTime() - window * 86_400_000)
    const priorStart = new Date(endDate.getTime() - 2 * window * 86_400_000)
    const iso = (d: Date) => d.toISOString().slice(0, 10)

    const [currentRes, priorRes, compRes] = await Promise.all([
      db
        .from('accommodation_daily_metrics')
        .select('metric_date, total_rooms, rooms_sold, revenue, room_type_breakdown')
        .eq('branch_id', activeBranch.id)
        .gte('metric_date', iso(windowStart))
        .lte('metric_date', iso(endDate))
        .order('metric_date', { ascending: true }),
      db
        .from('accommodation_daily_metrics')
        .select('metric_date, total_rooms, rooms_sold, revenue, room_type_breakdown')
        .eq('branch_id', activeBranch.id)
        .gte('metric_date', iso(priorStart))
        .lt('metric_date', iso(windowStart)),
      db
        .from('competitor_rates')
        .select('competitor_name, room_type, rate, captured_at')
        .eq('branch_id', activeBranch.id)
        .gte('captured_at', iso(windowStart))
        .order('captured_at', { ascending: false }),
    ])
    setRows(currentRes.data || [])
    setPriorRows(priorRes.data || [])
    setCompetitors(compRes.data || [])
    setLoading(false)
  }, [activeBranch, window, supabase])

  useEffect(() => { load() }, [load])

  const stats = useMemo(() => {
    return {
      current: aggregate(rows),
      prior: aggregate(priorRows),
    }
  }, [rows, priorRows])

  // Active branch isn't a hotel → friendly redirect-ish notice.
  if (activeBranch && activeBranch.business_type !== 'accommodation') {
    return (
      <div style={{ padding: 40, color: 'var(--color-text-tertiary)', fontSize: 14 }}>
        {t('hotelOnly')}
      </div>
    )
  }

  if (loading) {
    return <div style={{ padding: 40, color: 'var(--color-text-tertiary)' }}>{t('loading')}</div>
  }

  if (rows.length === 0) {
    return <EmptyState t={t} />
  }

  const sparkData = rows.map((r) => {
    const occ = r.total_rooms && r.total_rooms > 0 && r.rooms_sold != null
      ? (r.rooms_sold / r.total_rooms) * 100
      : 0
    return { date: r.metric_date, value: occ }
  })

  // Latest day's room-type breakdown drives the breakdown table.
  // We pick the most recent row with a non-null breakdown; if every
  // row is form-entered (no breakdown), the table is empty and we
  // surface a hint to import via CSV.
  const latestWithBreakdown = [...rows]
    .reverse()
    .find((r) => Array.isArray(r.room_type_breakdown) && r.room_type_breakdown.length > 0)

  const breakdownRows = (latestWithBreakdown?.room_type_breakdown || []).map((b) => {
    const occ = b.totalRooms > 0 ? b.occupiedRooms / b.totalRooms : 0
    return {
      roomType: b.roomType,
      totalRooms: b.totalRooms,
      occupancyRate: occ,
      adr: b.rateThb,
      revpar: b.rateThb * occ,
    }
  }).sort((a, b) => b.revpar - a.revpar)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 }}>
            {t('title')}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            {activeBranch?.name} · {t('windowLabel', { days: window })}
          </p>
        </div>
        <div style={{ display: 'inline-flex', gap: 4, background: 'var(--color-bg-surface, #f4f4f2)', padding: 3, borderRadius: 999 }}>
          {WINDOWS.map((w) => {
            const active = w === window
            return (
              <button
                key={w}
                type="button"
                onClick={() => setWindow(w)}
                style={{
                  padding: '6px 14px',
                  border: 'none',
                  borderRadius: 999,
                  background: active ? '#ffffff' : 'transparent',
                  color: active ? '#1a1a1a' : '#6b6b6b',
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  cursor: 'pointer',
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                {w}d
              </button>
            )
          })}
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <KpiCard
          label={t('occupancy')}
          value={`${Math.round(stats.current.occupancy * 100)}%`}
          delta={pct(stats.current.occupancy, stats.prior.occupancy)}
        />
        <KpiCard
          label={t('adr')}
          value={`฿${Math.round(stats.current.adr).toLocaleString('th-TH')}`}
          delta={pct(stats.current.adr, stats.prior.adr)}
        />
        <KpiCard
          label={t('revpar')}
          value={`฿${Math.round(stats.current.revpar).toLocaleString('th-TH')}`}
          delta={pct(stats.current.revpar, stats.prior.revpar)}
        />
        <KpiCard
          label={t('totalRevenue')}
          value={`฿${Math.round(stats.current.totalRevenue).toLocaleString('th-TH')}`}
          delta={pct(stats.current.totalRevenue, stats.prior.totalRevenue)}
        />
      </div>

      {/* Sparkline */}
      <section style={card}>
        <h3 style={cardTitle}>{t('occupancyTrend')}</h3>
        <SparklineChart label="" data={sparkData} target={80} formatValue={(v) => `${Math.round(v)}%`} />
      </section>

      {/* Room-type breakdown */}
      <section style={card}>
        <h3 style={cardTitle}>{t('roomTypeBreakdown')}</h3>
        {breakdownRows.length === 0 ? (
          <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {t('noBreakdownHint')}{' '}
            <Link href="/settings/import" style={{ color: 'var(--color-accent, #534AB7)' }}>
              {t('importCsv')} →
            </Link>
          </div>
        ) : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginTop: 6 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={th}>{t('colRoomType')}</th>
                <th style={th}>{t('colRooms')}</th>
                <th style={th}>{t('colOccupancy')}</th>
                <th style={th}>{t('colAdr')}</th>
                <th style={th}>{t('colRevpar')}</th>
              </tr>
            </thead>
            <tbody>
              {breakdownRows.map((r) => (
                <tr key={r.roomType} style={{ borderTop: '1px solid #f0f0ee' }}>
                  <td style={td}>{r.roomType}</td>
                  <td style={td}>{r.totalRooms}</td>
                  <td style={td}>{Math.round(r.occupancyRate * 100)}%</td>
                  <td style={td}>฿{Math.round(r.adr).toLocaleString('th-TH')}</td>
                  <td style={td}>฿{Math.round(r.revpar).toLocaleString('th-TH')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Competitor overlay */}
      <section style={card}>
        <h3 style={cardTitle}>{t('competitorRates')}</h3>
        {competitors.length === 0 ? (
          <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {t('noCompetitors')}
          </div>
        ) : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginTop: 6 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={th}>{t('colCompetitor')}</th>
                <th style={th}>{t('colRoomType')}</th>
                <th style={th}>{t('colRate')}</th>
                <th style={th}>{t('colCaptured')}</th>
              </tr>
            </thead>
            <tbody>
              {competitors.slice(0, 10).map((c, i) => (
                <tr key={i} style={{ borderTop: '1px solid #f0f0ee' }}>
                  <td style={td}>{c.competitor_name}</td>
                  <td style={td}>{c.room_type}</td>
                  <td style={td}>฿{Math.round(c.rate).toLocaleString('th-TH')}</td>
                  <td style={{ ...td, color: 'var(--color-text-tertiary)' }}>{c.captured_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function aggregate(rows: MetricRow[]) {
  if (rows.length === 0) return { occupancy: 0, adr: 0, revpar: 0, totalRevenue: 0 }
  let totalRooms = 0
  let roomsSold = 0
  let totalRevenue = 0
  for (const r of rows) {
    totalRooms += r.total_rooms || 0
    roomsSold += r.rooms_sold || 0
    totalRevenue += r.revenue || 0
  }
  const occupancy = totalRooms > 0 ? roomsSold / totalRooms : 0
  const adr = roomsSold > 0 ? totalRevenue / roomsSold : 0
  const revpar = adr * occupancy
  return { occupancy, adr, revpar, totalRevenue }
}

function pct(curr: number, prior: number): { value: number; direction: 'up' | 'down' | 'flat' } {
  if (prior === 0) return { value: 0, direction: 'flat' }
  const delta = ((curr - prior) / prior) * 100
  const direction = delta > 0.5 ? 'up' : delta < -0.5 ? 'down' : 'flat'
  return { value: Math.abs(delta), direction }
}

function KpiCard({ label, value, delta }: { label: string; value: string; delta: { value: number; direction: 'up' | 'down' | 'flat' } }) {
  const Icon = delta.direction === 'up' ? TrendingUp : delta.direction === 'down' ? TrendingDown : Minus
  const color = delta.direction === 'up' ? '#0F5132' : delta.direction === 'down' ? '#A32D2D' : '#9b9b9b'
  return (
    <div style={{
      background: 'var(--color-bg)',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      padding: '14px 16px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--color-text-primary)', margin: '6px 0 4px' }}>
        {value}
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color }}>
        <Icon size={12} />
        {delta.direction === 'flat' ? '—' : `${delta.value.toFixed(1)}%`}
      </div>
    </div>
  )
}

function EmptyState({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div style={{
      background: 'var(--color-bg-surface, #f7f7f5)',
      border: '1px dashed var(--color-border)',
      borderRadius: 12,
      padding: '40px 20px',
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
    }}>
      <Upload size={28} style={{ color: '#9b9b9b' }} />
      <h2 style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 }}>
        {t('emptyHeading')}
      </h2>
      <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', maxWidth: 360, margin: 0, lineHeight: 1.55 }}>
        {t('emptyBody')}
      </p>
      <Link
        href="/settings/import"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '10px 18px',
          background: 'var(--color-accent, #534AB7)',
          color: '#ffffff',
          fontSize: 13,
          fontWeight: 500,
          borderRadius: 8,
          textDecoration: 'none',
        }}
      >
        {t('emptyCta')} <ArrowRight size={14} />
      </Link>
    </div>
  )
}

const card: React.CSSProperties = {
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  padding: '14px 16px',
}
const cardTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  margin: '0 0 8px',
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
