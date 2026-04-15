'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import { KpiCard } from '@/components/kpi-card'
import { SparklineChart } from '@/components/sparkline-chart'
import { RecommendationCard } from '@/components/recommendation-card'
import { EntryStatusPanel } from '@/components/entry-status-panel'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { StaleBadge } from '@/components/stale-badge'
import { formatCurrency, formatPercent } from '@/lib/format'
import {
  getEntryTable,
  accommodationToUnified,
  fnbToUnified,
  type UnifiedMetric,
} from '@/lib/supabase/entry-tables'
import { getTodayBangkok } from '@/lib/businessDate'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export function HomeDashboard() {
  const { user, role, activeBranch, plan } = useUser()
  const t = useTranslations('home')
  const tCommon = useTranslations('common')
  const [metrics, setMetrics] = useState<UnifiedMetric[]>([])
  const [branchTarget, setBranchTarget] = useState<{ adr_target: number; cogs_target: number }>({ adr_target: 0, cogs_target: 32 })
  const [loading, setLoading] = useState(true)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const supabase = createClient()

  const isHotel = activeBranch?.business_type === 'accommodation'

  const loadMetrics = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    const todayStr = getTodayBangkok()
    const todayDate = new Date(todayStr + 'T00:00:00')
    todayDate.setDate(todayDate.getDate() - 7)
    const sevenDaysAgoStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`
    const table = getEntryTable(activeBranch.business_type)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const [metricsResult, targetResult] = await Promise.all([
      db.from(table).select('*').eq('branch_id', activeBranch.id).gte('metric_date', sevenDaysAgoStr).order('metric_date', { ascending: true }),
      db.from('targets').select('adr_target, cogs_target').eq('branch_id', activeBranch.id).maybeSingle(),
    ])
    if (targetResult.data) setBranchTarget(targetResult.data)
    const rows = metricsResult.data || []
    const unified = activeBranch.business_type === 'accommodation' ? rows.map(accommodationToUnified) : rows.map(fnbToUnified)
    setMetrics(unified)
    setLastFetched(new Date())
    setLoading(false)
  }, [activeBranch, supabase])

  useEffect(() => { loadMetrics() }, [loadMetrics])
  const handleRefresh = useCallback(async () => { await loadMetrics() }, [loadMetrics])

  if (!activeBranch) {
    return <div className="text-center" style={{ padding: 'var(--space-10) 0', color: 'var(--color-text-tertiary)' }}>{t('noBranch')}</div>
  }

  const latest = metrics[metrics.length - 1]
  const totalRooms = activeBranch.total_rooms || 0
  const adrTarget = branchTarget.adr_target || 0
  const occupancyPct = latest && totalRooms > 0 && latest.rooms_sold ? Math.round((latest.rooms_sold / totalRooms) * 100) : null
  const marginPct = latest && latest.revenue > 0 && latest.cost != null ? Math.round(((latest.revenue - latest.cost) / latest.revenue) * 100) : null

  function getStatus(value: number | null, target: number, threshold = 5): 'green' | 'amber' | 'red' | 'neutral' {
    if (value == null) return 'neutral'
    if (value >= target) return 'green'
    if (value >= target - threshold) return 'amber'
    return 'red'
  }

  // Staff view — minimal, calm
  if (role === 'staff') {
    const todayEntered = metrics.some((m) => m.metric_date === getTodayBangkok())
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {todayEntered ? (
          <div style={{ background: 'var(--color-green-light)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '24px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 'var(--font-size-md)', fontWeight: 500, color: 'var(--color-green-text)' }}>{t('todayDone')}</p>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginTop: 4 }}>{t('todayDoneSub')}</p>
          </div>
        ) : (
          <Link
            href="/entry"
            className="touch-target"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-primary-action)', color: 'white', borderRadius: 'var(--radius-lg)', padding: '16px 20px', textDecoration: 'none' }}
          >
            <div>
              <p style={{ fontSize: 'var(--font-size-md)', fontWeight: 500 }}>{t('enterData')}</p>
              <p style={{ fontSize: 'var(--font-size-sm)', opacity: 0.8, marginTop: 2 }}>{t('enterDataSub')}</p>
            </div>
            <ArrowRight size={18} />
          </Link>
        )}
        <EntryStatusPanel metrics={metrics} />
      </div>
    )
  }

  // Manager view
  if (role === 'manager') {
    return (
      <PullToRefresh onRefresh={handleRefresh}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <StaleBadge lastFetchedAt={lastFetched} />
          <Link
            href="/entry"
            className="touch-target"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-primary-action)', color: 'white', borderRadius: 'var(--radius-lg)', padding: '14px 20px', textDecoration: 'none' }}
          >
            <div>
              <p style={{ fontSize: 'var(--font-size-md)', fontWeight: 500 }}>{t('enterData')}</p>
              <p style={{ fontSize: 'var(--font-size-sm)', opacity: 0.8, marginTop: 2 }}>{t('enterDataSub')}</p>
            </div>
            <ArrowRight size={18} />
          </Link>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {isHotel ? (
              <>
                <KpiCard label={t('occupancyToday')} value={occupancyPct != null ? formatPercent(occupancyPct) : '-'} target={`${tCommon('target')} 80%`} status={getStatus(occupancyPct, 80)} />
                <KpiCard label={t('roomsTonight')} value={totalRooms && latest?.rooms_sold ? `${totalRooms - latest.rooms_sold}` : '-'} subLabel={`${tCommon('from')} ${totalRooms} ${tCommon('rooms')}`} status="neutral" />
              </>
            ) : (
              <>
                <KpiCard label={t('coversToday')} value={latest?.customers?.toLocaleString() || '-'} status="neutral" />
                <KpiCard label={t('marginToday')} value={marginPct != null ? formatPercent(marginPct) : '-'} status={getStatus(marginPct, 32)} />
              </>
            )}
          </div>
          <EntryStatusPanel metrics={metrics} />
        </div>
      </PullToRefresh>
    )
  }

  // Owner view — full dashboard
  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Greeting — text only, no card */}
        <div className="flex items-start justify-between">
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 'var(--line-height-tight)' }}>
              {t('greeting', { name: user.email.split('@')[0] })}
            </h2>
            {latest && (
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)', marginTop: 3 }}>
                {t('lastUpdate', {
                  date: new Date(latest.metric_date).toLocaleDateString('th-TH-u-ca-buddhist', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }),
                })}
              </p>
            )}
          </div>
          <StaleBadge lastFetchedAt={lastFetched} />
        </div>

        {/* Recommendation — left accent border */}
        <RecommendationCard
          branch={activeBranch}
          latest={latest ? { revenue: latest.revenue, adr: latest.adr, rooms_sold: latest.rooms_sold, customers: latest.customers, cost: latest.cost } : null}
          plan={plan} isHotel={isHotel} adrTarget={adrTarget} occupancyTarget={80}
        />

        {/* KPI cards grid */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '12px 14px', height: 80 }} />
            ))}
          </div>
        ) : isHotel ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <KpiCard label={t('adr')} value={latest?.adr ? formatCurrency(latest.adr) : '-'} target={adrTarget ? `${tCommon('target')} ${formatCurrency(adrTarget)}` : undefined} status={getStatus(latest?.adr || 0, adrTarget)} primary />
            <KpiCard label={t('occupancy')} value={occupancyPct != null ? formatPercent(occupancyPct) : '-'} target={`${tCommon('target')} 80%`} status={getStatus(occupancyPct, 80)} />
            <KpiCard label={t('revenue')} value={latest?.revenue ? formatCurrency(latest.revenue) : '-'} status="neutral" />
            <KpiCard label={t('roomsAvailable')} value={totalRooms && latest?.rooms_sold ? `${totalRooms - latest.rooms_sold} ${tCommon('rooms')}` : '-'} subLabel={`${tCommon('from')} ${totalRooms} ${tCommon('rooms')}`} status="neutral" />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <KpiCard label={t('grossMargin')} value={marginPct != null ? formatPercent(marginPct) : '-'} target={`${tCommon('target')} 32%`} status={getStatus(marginPct, 32)} primary />
            <KpiCard label={t('covers')} value={latest?.customers?.toLocaleString() || '-'} status="neutral" />
            <KpiCard label={t('sales')} value={latest?.revenue ? formatCurrency(latest.revenue) : '-'} status="neutral" />
            <KpiCard label={t('avgSpend')} value={latest?.avg_ticket ? formatCurrency(latest.avg_ticket) : '-'} status="neutral" />
          </div>
        )}

        {/* Chart */}
        {isHotel ? (
          <SparklineChart label={t('adr7days')} data={metrics.map((m) => ({ date: m.metric_date, value: m.adr || 0 }))} target={adrTarget} formatValue={(v) => formatCurrency(v)} />
        ) : (
          <SparklineChart label={t('margin7days')} data={metrics.map((m) => ({ date: m.metric_date, value: m.revenue > 0 && m.cost != null ? Math.round(((m.revenue - m.cost) / m.revenue) * 100) : 0 }))} target={32} formatValue={(v) => formatPercent(v)} />
        )}

        {/* Entry status */}
        <EntryStatusPanel metrics={metrics} />

        {/* CTA button */}
        <Link
          href="/entry"
          className="flex items-center justify-center gap-2 touch-target"
          style={{
            padding: '8px 16px',
            background: 'var(--color-primary-action)',
            color: 'white',
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 'var(--radius-md)',
            textDecoration: 'none',
          }}
        >
          {t('enterData')}
          <ArrowRight size={14} />
        </Link>
      </div>
    </PullToRefresh>
  )
}
