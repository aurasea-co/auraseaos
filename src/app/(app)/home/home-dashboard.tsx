'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import { KpiCard } from '@/components/kpi-card'
import { SparklineChart } from '@/components/sparkline-chart'
import { RecommendationCard } from '@/components/recommendation-card'
import { EntryStatusPanel } from '@/components/entry-status-panel'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { StaleBadge } from '@/components/stale-badge'
import { OperationalCompletenessPill } from '@/components/ui/OperationalCompletenessPill'
import { formatCurrency, formatPercent } from '@/lib/format'
import {
  getEntryTable,
  accommodationToUnified,
  fnbToUnified,
  type UnifiedMetric,
} from '@/lib/supabase/entry-tables'
import { getTodayBangkok, toBangkokDateStr } from '@/lib/businessDate'
import { calculateGrossMarginStrict } from '@/lib/calculations/fnb'
import {
  periodAvgMargin,
  latestCompleteDayMargin,
  type MarginInputRow,
} from '@/lib/calculations/marginAggregates'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export function HomeDashboard() {
  const { user, role, activeBranch, plan } = useUser()
  const t = useTranslations('home')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const [metrics, setMetrics] = useState<UnifiedMetric[]>([])
  const [branchTarget, setBranchTarget] = useState<{
    adr_target: number
    cogs_target: number
    occupancy_target: number
    labour_target: number
    covers_target: number
    avg_spend_target: number
    operating_days: number
  }>({ adr_target: 0, cogs_target: 32, occupancy_target: 80, labour_target: 0, covers_target: 0, avg_spend_target: 0, operating_days: 26 })
  const [loading, setLoading] = useState(true)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const supabase = createClient()

  const isHotel = activeBranch?.business_type === 'accommodation'

  const loadMetrics = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    const todayStr = getTodayBangkok()
    const startDate = new Date(todayStr + 'T00:00:00')
    // 30-day window so the card's secondary "30-day avg" matches the
    // Trends tile exactly. The 7-day entry dots still read from the
    // same set (only the last 7 rows are needed for that panel).
    startDate.setDate(startDate.getDate() - 30)
    const thirtyDaysAgoStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`
    const table = getEntryTable(activeBranch.business_type)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const [metricsResult, targetResult] = await Promise.all([
      db.from(table).select('*').eq('branch_id', activeBranch.id).gte('metric_date', thirtyDaysAgoStr).order('metric_date', { ascending: true }),
      db.from('targets')
        .select('adr_target, cogs_target, occupancy_target, labour_target, covers_target, avg_spend_target, operating_days')
        .eq('branch_id', activeBranch.id)
        .maybeSingle(),
    ])
    if (targetResult.data) {
      setBranchTarget({
        adr_target: targetResult.data.adr_target || 0,
        cogs_target: targetResult.data.cogs_target || 32,
        occupancy_target: targetResult.data.occupancy_target || 80,
        labour_target: targetResult.data.labour_target || 0,
        covers_target: targetResult.data.covers_target || 0,
        avg_spend_target: targetResult.data.avg_spend_target || 0,
        operating_days: targetResult.data.operating_days || 26,
      })
    }
    // Margin display is gross-only across the app (Home, Trends, Portfolio,
    // and the morning-flash email) so the number doesn't depend on whether
    // an owner has configured a salary. Salary is no longer fetched here.
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
  // Margin is gross-only (excl. salary) across the entire app so the
  // displayed number is identical for every role looking at the same
  // branch. periodAvgMargin / latestCompleteDayMargin are called with
  // monthlySalary=0, operatingDays=0 to force `gross` mode internally.
  const marginInputs: MarginInputRow[] = metrics.map((m) => ({
    metric_date: m.metric_date,
    revenue: m.revenue,
    variableCost: m.cost,
  }))
  const latestMargin = !isHotel
    ? latestCompleteDayMargin(marginInputs, 0, 0)
    : null
  const thirtyDayMargin = !isHotel
    ? periodAvgMargin(marginInputs, 0, 0)
    : null
  // Headline number for the F&B margin card: 30-day rolling avg first,
  // then the latest complete day, then nothing. Matches the Trends tile.
  const marginPct: number | null = isHotel
    ? latest
      ? calculateGrossMarginStrict(latest.revenue, latest.cost)
      : null
    : thirtyDayMargin?.value ?? latestMargin?.value ?? null

  // "Last entry with cost" date — the most recent row where BOTH
  // revenue > 0 AND cost > 0 (the rows that actually contribute to
  // margin). Decoupled from latestCompleteDayMargin's result so a row
  // whose margin math falls outside the sanity band (e.g. cost > revenue)
  // still counts as a valid data-entry day for the label.
  const lastEntryDate: string | null = (() => {
    if (isHotel) return null
    for (let i = metrics.length - 1; i >= 0; i--) {
      const m = metrics[i]
      if ((m.revenue ?? 0) > 0 && (m.cost ?? 0) > 0) return m.metric_date
    }
    return null
  })()

  // Latest day the user has entered ANY data (revenue), regardless of
  // whether cost was filled in. Used to spot "you entered sales but
  // forgot the cost" gaps so we can nudge the user to complete the row.
  const latestRevenueOnlyDate: string | null = (() => {
    if (isHotel) return null
    for (let i = metrics.length - 1; i >= 0; i--) {
      const m = metrics[i]
      if ((m.revenue ?? 0) > 0 && (m.cost ?? 0) <= 0) return m.metric_date
    }
    return null
  })()

  // Show the missing-cost warning only when the revenue-only row is
  // strictly newer than the most recent row with cost — otherwise the
  // "Last entry with cost" line is already the most recent action and
  // there's nothing useful to nudge.
  const missingCostDate: string | null =
    latestRevenueOnlyDate && (lastEntryDate == null || latestRevenueOnlyDate > lastEntryDate)
      ? latestRevenueOnlyDate
      : null

  const missingCostMessage: string | null = (() => {
    if (!missingCostDate) return null
    const dateObj = new Date(missingCostDate + 'T00:00:00')
    const formatted = dateObj.toLocaleDateString(
      locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB',
      { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' },
    )
    return t('missingCostWarning', { date: formatted })
  })()

  const marginContext: string | undefined = (() => {
    if (isHotel) return undefined
    if (lastEntryDate) {
      const todayStr = getTodayBangkok()
      if (lastEntryDate === todayStr) return t('today')
      const dateObj = new Date(lastEntryDate + 'T00:00:00')
      const formatted = dateObj.toLocaleDateString(
        locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB',
        { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' },
      )
      return t('lastEntry', { date: formatted })
    }
    if (thirtyDayMargin) return t('thirtyDayAvg')
    return undefined
  })()
  // Secondary line — show the latest day's margin when we're showing the
  // 30-day avg as headline (the more common case). Suppressed when the
  // headline IS already the latest day.
  const marginSecondary: { label: string; value: string } | undefined =
    !isHotel && thirtyDayMargin && latestMargin
      ? { label: t('latestDay'), value: formatPercent(latestMargin.value) }
      : undefined
  // Gross-only target (no salary subtraction).
  const marginTarget = 100 - branchTarget.cogs_target

  function getStatus(value: number | null, target: number, threshold = 5): 'green' | 'amber' | 'red' | 'neutral' {
    if (value == null) return 'neutral'
    if (value >= target) return 'green'
    if (value >= target - threshold) return 'amber'
    return 'red'
  }

  // Staff view — minimal, calm
  if (role === 'staff') {
    const todayEntered = metrics.some((m) => toBangkokDateStr(m.metric_date) === getTodayBangkok())
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

  // Manager view — operational recommendations + KPIs (no revenue/labour/salary)
  if (role === 'manager') {
    const occupancyTarget = branchTarget.occupancy_target || 80
    const coversTarget = branchTarget.covers_target || 0
    const avgSpendTarget = branchTarget.avg_spend_target || 0
    // Managers don't have salary visibility → use the outer marginTarget
    // which falls back to gross target when monthlySalary is 0.
    const managerMarginTarget = marginTarget
    const roomsAvailable = totalRooms && latest?.rooms_sold != null ? totalRooms - latest.rooms_sold : totalRooms
    const adrGapVal = latest?.adr != null ? (latest.adr - adrTarget) : 0
    const marginGapVal = marginPct != null ? (marginPct - managerMarginTarget) : 0
    const coversGapVal = latest?.customers != null ? (latest.customers - coversTarget) : 0
    const recommendation = latest
      ? getManagerRecommendation({
          isHotel,
          adr: latest.adr || 0,
          adrTarget,
          roomsAvailable,
          totalRooms,
          occupancyPct: occupancyPct || 0,
          occupancyTarget,
          marginPct,
          marginTarget: managerMarginTarget,
          covers: latest.customers || 0,
          coversTarget,
          avgTicket: latest.avg_ticket || 0,
          avgSpendTarget,
        })
      : 'เริ่มกรอกข้อมูลเพื่อรับคำแนะนำ'

    return (
      <PullToRefresh onRefresh={handleRefresh}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="flex items-center justify-between">
            <OperationalCompletenessPill
              branchId={activeBranch.id}
              businessType={activeBranch.business_type as 'fnb' | 'accommodation'}
            />
            <StaleBadge lastFetchedAt={lastFetched} />
          </div>

          {/* Operational recommendation card */}
          <div
            style={{
              borderLeft: '3px solid #534AB7',
              background: 'var(--color-bg)',
              borderRadius: '0 6px 6px 0',
              padding: '12px 16px',
            }}
          >
            <p
              style={{
                fontSize: 10,
                fontWeight: 500,
                color: '#534AB7',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 6,
              }}
            >
              คำแนะนำวันนี้
            </p>
            <p style={{ fontSize: 13, fontWeight: 400, lineHeight: 1.5, color: 'var(--color-text-primary)' }}>
              {recommendation}
            </p>
          </div>

          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {isHotel ? (
              <>
                <KpiCard
                  label="ADR วันนี้"
                  value={latest?.adr ? formatCurrency(latest.adr) : '-'}
                  target={
                    adrTarget
                      ? adrGapVal < 0
                        ? `ต่ำกว่าเป้า ${formatCurrency(Math.abs(adrGapVal))}`
                        : `เหนือเป้า ${formatCurrency(adrGapVal)}`
                      : undefined
                  }
                  subLabel={adrTarget ? `เป้า ${formatCurrency(adrTarget)}` : undefined}
                  status={getStatus(latest?.adr || 0, adrTarget)}
                  primary
                />
                <KpiCard
                  label="Occupancy"
                  value={occupancyPct != null ? formatPercent(occupancyPct) : '-'}
                  target={`${tCommon('target')} ${occupancyTarget}%`}
                  status={getStatus(occupancyPct, occupancyTarget)}
                />
                <KpiCard
                  label="ห้องว่างคืนนี้"
                  value={totalRooms && latest?.rooms_sold != null ? `${roomsAvailable} ${tCommon('rooms')}` : '-'}
                  subLabel={`${tCommon('from')} ${totalRooms} ${tCommon('rooms')}`}
                  status="neutral"
                />
              </>
            ) : (
              <>
                <KpiCard
                  label={t('marginExclSalary')}
                  value={marginPct != null ? formatPercent(marginPct) : '-'}
                  valueContext={marginPct != null ? marginContext : undefined}
                  secondary={marginSecondary}
                  target={
                    marginPct != null
                      ? marginGapVal < 0
                        ? `ต่ำกว่าเป้า ${Math.abs(Math.round(marginGapVal))}pts`
                        : `เหนือเป้า ${Math.round(marginGapVal)}pts`
                      : undefined
                  }
                  subLabel={
                    marginPct != null
                      ? `${tCommon('target')} ${Math.round(managerMarginTarget)}%`
                      : t('marginNoDataTooltip')
                  }
                  status={marginPct != null ? getStatus(marginPct, managerMarginTarget) : 'neutral'}
                  primary
                />
                <KpiCard
                  label="Covers วันนี้"
                  value={latest?.customers?.toLocaleString() || '-'}
                  target={
                    coversTarget && latest?.customers != null
                      ? coversGapVal < 0
                        ? `ต่ำกว่าเป้า ${Math.abs(coversGapVal)} คน`
                        : `เหนือเป้า ${coversGapVal} คน`
                      : coversTarget
                      ? `${tCommon('target')} ${coversTarget}`
                      : undefined
                  }
                  status={coversTarget ? getStatus(latest?.customers || 0, coversTarget) : 'neutral'}
                />
                <KpiCard
                  label="Avg Spend"
                  value={latest?.avg_ticket ? formatCurrency(latest.avg_ticket) : '-'}
                  subLabel="ต่อคน"
                  status="neutral"
                />
              </>
            )}
          </div>

          {missingCostMessage && (
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-amber-text)', background: 'var(--color-amber-light)', border: '1px solid rgba(186,117,23,0.25)', borderRadius: 8, padding: '8px 12px', margin: 0 }}>
              ⚠ {missingCostMessage}
            </p>
          )}

          {/* Entry compliance dots */}
          <EntryStatusPanel metrics={metrics} />

          {/* CTA */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <OperationalCompletenessPill
              branchId={activeBranch.id}
              businessType={activeBranch.business_type as 'fnb' | 'accommodation'}
            />
            <StaleBadge lastFetchedAt={lastFetched} />
          </div>
        </div>

        {/* Recommendation — left accent border */}
        <RecommendationCard
          branch={activeBranch}
          latest={latest ? { revenue: latest.revenue, adr: latest.adr, rooms_sold: latest.rooms_sold, customers: latest.customers, cost: latest.cost } : null}
          plan={plan} isHotel={isHotel} adrTarget={adrTarget} occupancyTarget={80}
          marginPctOverride={!isHotel ? marginPct : undefined}
          marginTargetOverride={!isHotel ? marginTarget : undefined}
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
            <KpiCard
              label={t('marginExclSalary')}
              value={marginPct != null ? formatPercent(marginPct) : '-'}
              valueContext={marginPct != null ? marginContext : undefined}
              secondary={marginSecondary}
              target={marginPct != null ? `${tCommon('target')} ${Math.round(marginTarget)}%` : undefined}
              subLabel={marginPct == null ? t('marginNoDataTooltip') : undefined}
              status={marginPct != null ? getStatus(marginPct, marginTarget) : 'neutral'}
              primary
            />
            <KpiCard label={t('covers')} value={latest?.customers?.toLocaleString() || '-'} status="neutral" />
            <KpiCard label={t('sales')} value={latest?.revenue ? formatCurrency(latest.revenue) : '-'} status="neutral" />
            <KpiCard label={t('avgSpend')} value={latest?.avg_ticket ? formatCurrency(latest.avg_ticket) : '-'} status="neutral" />
          </div>
        )}

        {missingCostMessage && (
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-amber-text)', background: 'var(--color-amber-light)', border: '1px solid rgba(186,117,23,0.25)', borderRadius: 8, padding: '8px 12px', margin: 0 }}>
            ⚠ {missingCostMessage}
          </p>
        )}

        {/* Chart */}
        {isHotel ? (
          <SparklineChart label={t('adr7days')} data={metrics.map((m) => ({ date: m.metric_date, value: m.adr || 0 }))} target={adrTarget} formatValue={(v) => formatCurrency(v)} />
        ) : (
          <SparklineChart
            label={t('margin7days')}
            data={metrics.map((m) => {
              const g = calculateGrossMarginStrict(m.revenue, m.cost)
              return { date: m.metric_date, value: g ?? 0 }
            })}
            target={Math.round(marginTarget)}
            formatValue={(v) => formatPercent(v)}
          />
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

// Deterministic operational recommendation for managers (no API call, no financial totals)
function getManagerRecommendation(input: {
  isHotel: boolean
  adr: number
  adrTarget: number
  roomsAvailable: number
  totalRooms: number
  occupancyPct: number
  occupancyTarget: number
  marginPct: number | null
  marginTarget: number
  covers: number
  coversTarget: number
  avgTicket: number
  avgSpendTarget: number
}): string {
  const {
    isHotel,
    adr,
    adrTarget,
    roomsAvailable,
    totalRooms,
    occupancyPct,
    occupancyTarget,
    marginPct,
    marginTarget,
    covers,
    coversTarget,
    avgTicket,
    avgSpendTarget,
  } = input

  if (isHotel) {
    const adrGap = adr - adrTarget
    const suggestedWalkin = Math.round((adrTarget * 1.05) / 100) * 100
    const roomsPct = totalRooms > 0 ? roomsAvailable / totalRooms : 0
    const absAdrGap = Math.abs(Math.round(adrGap))

    if (adrGap < -100 && roomsPct > 0.3) {
      return `ADR เฉลี่ย 7 วันต่ำกว่าเป้า ฿${absAdrGap} — คืนนี้ยังว่างอยู่ ${roomsAvailable} ห้อง แนะนำให้ตั้งราคา walk-in ที่ ฿${suggestedWalkin} และแจ้ง front office ให้เสนอ "ราคาพิเศษวันนี้เท่านั้น" กับลูกค้าที่โทรถาม`
    }
    if (adrGap < -50 && roomsPct <= 0.3) {
      return `ADR ต่ำกว่าเป้า ฿${absAdrGap} แต่ occupancy ดี — วันนี้ลองเสนอ room upgrade ให้ลูกค้าที่ check-in เพื่อเพิ่ม ADR`
    }
    if (adrGap >= 0 && roomsPct > 0.4) {
      return `ADR ตามเป้า แต่คืนนี้ห้องว่างอยู่ ${roomsAvailable} ห้อง — แจ้ง OTA เพิ่ม visibility หรือเสนอราคา walk-in พิเศษช่วงบ่ายนี้`
    }
    if (adrGap >= 0 && roomsPct <= 0.2) {
      return `ADR เหนือเป้า ฿${Math.round(adrGap)} และ occupancy ดีมาก — รักษา service มาตรฐานและขอ review จากลูกค้า`
    }
    if (occupancyTarget > 0 && occupancyPct < occupancyTarget * 0.7) {
      return `Occupancy ${Math.round(occupancyPct)}% ต่ำกว่าเป้า ${occupancyTarget}% มาก — ติดต่อ OTA เพื่อโปรโมท last-minute deals และตรวจสอบว่า listing อัปเดตล่าสุดแล้ว`
    }
    return 'วันนี้ทุกอย่างอยู่ในเกณฑ์ดี — เน้น service คุณภาพและ upsell breakfast หรือ room upgrade ให้ลูกค้า'
  }

  // F&B
  const marginGap = marginPct != null ? marginPct - marginTarget : 0
  const coversGap = covers - coversTarget
  const absMarginGap = Math.abs(Math.round(marginGap))
  const absCoversGap = Math.abs(coversGap)

  if (marginPct != null && marginGap < -5 && coversGap < 0) {
    return `Margin ${Math.round(marginPct)}% ต่ำกว่าเป้า ${absMarginGap}pts และ covers น้อยกว่าเป้า ${absCoversGap} คน — ตรวจสอบ portion size และ waste ก่อนเปิดร้านพรุ่งนี้`
  }
  if (marginPct != null && marginGap < -3 && coversGap >= 0) {
    return `ลูกค้าตามเป้า แต่ margin ต่ำกว่าเป้า ${absMarginGap}pts — น่าจะมาจาก COGS หรือ waste ลองตรวจ portion และการสั่งวัตถุดิบ`
  }
  if (marginPct != null && marginGap >= 0 && coversGap < -10) {
    return `Margin ดี ${Math.round(marginPct)}% แต่ covers น้อยกว่าเป้า ${absCoversGap} คน — ลองโปรโมชันช่วงเที่ยงหรือ afternoon set เพื่อดึงลูกค้าเพิ่ม`
  }
  if (marginPct != null && marginGap >= 0 && coversGap >= 0) {
    return `วันนี้ทั้ง margin และ covers ตามเป้า — เน้น upsell เครื่องดื่มและของหวาน เพื่อเพิ่ม avg spend จาก ฿${Math.round(avgTicket)}`
  }
  if (avgSpendTarget > 0 && avgTicket < avgSpendTarget * 0.85) {
    return `Avg spend ฿${Math.round(avgTicket)} ต่ำกว่าเป้า — แนะนำเมนูพิเศษหรือ combo set ให้พนักงานเสิร์ฟ upsell กับทุกโต๊ะ`
  }
  return 'วันนี้ร้านอยู่ในเกณฑ์ดี — รักษา service และความสะอาด ขอ review จากลูกค้าที่ประทับใจ'
}
