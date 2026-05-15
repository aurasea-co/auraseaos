'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { useBranchMetrics, type BranchDailyMetric } from '@/hooks/useBranchMetrics'
import { useTargets } from '@/hooks/useTargets'
import { KpiCard } from '@/components/kpi-card'
import { BarChart } from '@/components/charts/BarChart'
import { formatBaht, formatPct, groupByWeek, formatWeekRange } from '@/lib/formatters'
import { calculateDailySalaryCost } from '@/lib/calculations/hotel'
import Link from 'next/link'
import type { Branch, Target } from '@/lib/supabase/types'
import { getTodayBangkok } from '@/lib/businessDate'

// Health score calculation (spec Appendix 14.1)
function calcHealthScore(
  data: BranchDailyMetric[],
  targets: Target | null,
  isHotel: boolean,
  dailyCost: number
): number {
  if (data.length === 0) return 50

  // 1. Target attainment (30%)
  let targetScore = 50
  if (isHotel && targets?.adr_target) {
    const avgAdr = data.filter((d) => d.adr).reduce((s, d) => s + (d.adr || 0), 0) / data.filter((d) => d.adr).length || 0
    const ratio = avgAdr / Number(targets.adr_target)
    targetScore = Math.min(100, Math.max(0, ratio * 100))
  } else if (!isHotel && targets?.cogs_target) {
    const margins = data.filter((d) => d.margin != null).map((d) => d.margin!)
    const avgMargin = margins.length > 0 ? margins.reduce((a, b) => a + b, 0) / margins.length : 0
    const marginTarget = 100 - Number(targets.cogs_target)
    targetScore = avgMargin >= marginTarget ? 100 : Math.max(0, (avgMargin / marginTarget) * 100)
  }

  // 2. Labour% (20%)
  let labourScore = 50
  const labourTarget = Number(targets?.labour_target) || 30
  if (dailyCost > 0) {
    const avgRev = data.reduce((s, d) => s + d.revenue, 0) / data.length
    const labourPct = avgRev > 0 ? (dailyCost / avgRev) * 100 : 100
    labourScore = labourPct <= labourTarget ? 100 : Math.max(0, 100 - ((labourPct - labourTarget) / labourTarget) * 100)
  }

  // 3. Volume (25%)
  let volumeScore = 50
  if (isHotel) {
    const occs = data.filter((d) => d.occupancy_rate != null).map((d) => d.occupancy_rate!)
    const avgOcc = occs.length > 0 ? occs.reduce((a, b) => a + b, 0) / occs.length : 0
    const occTarget = Number(targets?.occupancy_target ?? targets?.occ_target) || 80
    volumeScore = avgOcc >= occTarget ? 100 : Math.max(0, (avgOcc / occTarget) * 100)
  } else {
    const covers = data.filter((d) => d.customers != null).map((d) => d.customers!)
    const avgCovers = covers.length > 0 ? covers.reduce((a, b) => a + b, 0) / covers.length : 0
    const coverTarget = Number(targets?.covers_target) || 75
    volumeScore = avgCovers >= coverTarget ? 100 : Math.max(0, (avgCovers / coverTarget) * 100)
  }

  // 4. Trend (15%)
  let trendScore = 50
  if (data.length >= 14) {
    const first = data.slice(0, Math.floor(data.length / 2))
    const second = data.slice(Math.floor(data.length / 2))
    const firstRev = first.reduce((s, d) => s + d.revenue, 0) / first.length
    const secondRev = second.reduce((s, d) => s + d.revenue, 0) / second.length
    trendScore = secondRev > firstRev * 1.02 ? 100 : secondRev >= firstRev * 0.98 ? 50 : 0
  }

  // 5. Entry consistency (10%)
  const entryScore = Math.min(100, (data.length / 30) * 100)

  return Math.round(targetScore * 0.3 + labourScore * 0.2 + volumeScore * 0.25 + trendScore * 0.15 + entryScore * 0.1)
}

function HealthRing({ score, verdict, size = 80 }: { score: number; verdict: string; size?: number }) {
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = score >= 80 ? 'var(--color-positive)' : score >= 65 ? 'var(--color-amber)' : 'var(--color-negative)'

  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-bg-surface)" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={6} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 0.5s' }} />
        <text x="50%" y="50%" textAnchor="middle" dy="0.35em" style={{ fontSize: 18, fontWeight: 500, fill: 'var(--color-text-primary)' }}>{score}</text>
      </svg>
      <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color, marginTop: 4 }}>{verdict}</p>
    </div>
  )
}

function healthVerdictKey(score: number): 'health_good' | 'health_watch' | 'health_action' {
  if (score >= 80) return 'health_good'
  if (score >= 65) return 'health_watch'
  return 'health_action'
}

function useBranchData(branch: Branch) {
  const metrics = useBranchMetrics(branch.id, 30)
  const targets = useTargets(branch.id)
  return { metrics, targets }
}

export function PortfolioView() {
  const { branches } = useUser()
  const t = useTranslations('portfolio')

  // Fetch data for each branch (max 3 for Pro)
  const branch1 = useBranchData(branches[0])
  const branch2 = useBranchData(branches[1])

  const loading = branch1.metrics.loading || branch2.metrics.loading

  // Calculate health scores
  const branchCards = useMemo(() => {
    return branches.slice(0, 2).map((branch, i) => {
      const bd = i === 0 ? branch1 : branch2
      const data = bd.metrics.data
      const tgts = bd.targets.targets
      const isHotel = branch.business_type === 'accommodation'
      const monthlySalary = Number(tgts?.monthly_salary) || 0
      const operatingDays = Number(tgts?.operating_days) || 30
      const dailyCost = calculateDailySalaryCost(monthlySalary, operatingDays)
      const score = calcHealthScore(data, tgts, isHotel, dailyCost)
      const totalRevenue = data.reduce((s, d) => s + d.revenue, 0)
      const labourPct = data.length > 0 && dailyCost > 0 ? (dailyCost / (totalRevenue / data.length)) * 100 : null
      const entryDays = data.length

      // Issues — built from i18n templates so they flip language.
      const issues: string[] = []
      if (isHotel && tgts?.adr_target) {
        const avgAdr = data.filter((d) => d.adr).reduce((s, d) => s + (d.adr || 0), 0) / (data.filter((d) => d.adr).length || 1)
        if (avgAdr < Number(tgts.adr_target)) {
          issues.push(t('adr_below_target', { gap: formatBaht(Number(tgts.adr_target) - avgAdr) }))
        }
      }
      if (!isHotel && tgts?.cogs_target) {
        const margins = data.filter((d) => d.margin != null).map((d) => d.margin!)
        const avgMargin = margins.length > 0 ? margins.reduce((a, b) => a + b, 0) / margins.length : 0
        if (avgMargin < 100 - Number(tgts.cogs_target)) {
          issues.push(t('margin_below_target', { gap: formatPct(100 - Number(tgts.cogs_target) - avgMargin) }))
        }
      }
      if (labourPct != null && tgts?.labour_target && labourPct > Number(tgts.labour_target)) {
        issues.push(t('labour_over_target', { pct: formatPct(labourPct) }))
      }

      // Primary metric label — the slash pair stays identical in both
      // locales because ADR / Occ / Margin / Covers are industry terms.
      let primaryLabel = '', primaryValue = ''
      if (isHotel) {
        const avgAdr = data.filter((d) => d.adr).reduce((s, d) => s + (d.adr || 0), 0) / (data.filter((d) => d.adr).length || 1)
        const avgOcc = data.filter((d) => d.occupancy_rate != null).reduce((s, d) => s + (d.occupancy_rate || 0), 0) / (data.filter((d) => d.occupancy_rate != null).length || 1)
        primaryLabel = t('adr_occ')
        primaryValue = `${formatBaht(avgAdr)} / ${formatPct(avgOcc, 0)}`
      } else {
        const margins = data.filter((d) => d.margin != null).map((d) => d.margin!)
        const avgMargin = margins.length > 0 ? margins.reduce((a, b) => a + b, 0) / margins.length : 0
        const avgCovers = data.filter((d) => d.customers != null).reduce((s, d) => s + (d.customers || 0), 0) / (data.filter((d) => d.customers != null).length || 1)
        primaryLabel = t('margin_covers')
        primaryValue = `${formatPct(avgMargin, 0)} / ${Math.round(avgCovers)}`
      }

      return { branch, score, totalRevenue, labourPct, entryDays, issues, primaryLabel, primaryValue, isHotel }
    })
  }, [branches, branch1, branch2, t])

  if (loading) return <div style={{ padding: 'var(--space-10) 0', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>{t('loading')}</div>

  const totalRevenue = branchCards.reduce((s, b) => s + b.totalRevenue, 0)
  const avgScore = Math.round(branchCards.reduce((s, b) => s + b.score, 0) / branchCards.length)
  const needAttention = branchCards.filter((b) => b.score < 65).length
  const todayEntries = branchCards.filter((b) => {
    const today = getTodayBangkok()
    const bd = b === branchCards[0] ? branch1 : branch2
    return bd.metrics.data.some((d) => d.metric_date === today)
  }).length

  // Revenue stacked chart (4 weeks)
  const allWeeks1 = groupByWeek(branch1.metrics.data).slice(-4)
  const allWeeks2 = groupByWeek(branch2.metrics.data).slice(-4)
  const weekLabels = allWeeks1.map((w) => formatWeekRange(w.map((d) => d.metric_date)))

  // Insight — built from i18n templates so it flips with the locale
  // instead of baking in Thai prose.
  const best = branchCards.reduce((a, b) => a.score > b.score ? a : b)
  const worst = branchCards.reduce((a, b) => a.score < b.score ? a : b)
  const insightText = worst.issues.length > 0
    ? t('insight_template_with_issue', {
        best: best.branch.name,
        score: best.score,
        worst: worst.branch.name,
        issue: worst.issues[0],
      })
    : t('insight_template', {
        best: best.branch.name,
        score: best.score,
        worst: worst.branch.name,
      })

  // Three-action recommendation list
  const highLabourBranches = branchCards.filter((b) => b.labourPct != null && b.labourPct > 30)
  const labourAction = highLabourBranches.length > 1
    ? t('action_labour_all', { count: branchCards.length })
    : highLabourBranches.length === 1
    ? t('action_labour_one', { branch: highLabourBranches[0].branch.name })
    : t('action_labour_ok')

  const actions: string[] = [
    worst.issues.length > 0
      ? t('action_branch_issue', { branch: worst.branch.name, issue: worst.issues[0] })
      : t('action_branch_review', { branch: worst.branch.name }),
    labourAction,
    t('action_best_branch', { branch: best.branch.name, metric: best.primaryLabel }),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-text-primary)' }}>{t('title')}</h2>

      {/* KPI summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <KpiCard label={t('total_revenue')} value={formatBaht(totalRevenue)} subLabel={t('days_30')} status="neutral" />
        <KpiCard label={t('portfolio_score')} value={`${avgScore}`} status={avgScore >= 80 ? 'green' : avgScore >= 65 ? 'amber' : 'red'} />
        <KpiCard label={t('branches_need_attention')} value={`${needAttention}`} status={needAttention === 0 ? 'green' : 'red'} />
        <KpiCard label={t('entry_today')} value={`${todayEntries}/${branches.length}`} status={todayEntries === branches.length ? 'green' : 'amber'} />
      </div>

      {/* Branch health cards */}
      {branchCards.map((bc) => (
        <div
          key={bc.branch.id}
          style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderLeft: `2px solid ${bc.isHotel ? 'var(--color-accent)' : 'var(--color-green)'}`,
            borderRadius: 'var(--radius-lg)',
            padding: 16,
          }}
        >
          <div className="flex items-start gap-4">
            <HealthRing score={bc.score} verdict={t(healthVerdictKey(bc.score))} size={72} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500, color: 'var(--color-text-primary)' }}>{bc.branch.name}</p>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span>{bc.primaryLabel}: {bc.primaryValue}</span>
                {bc.labourPct != null && <span>Labour%: <span style={{ color: bc.labourPct <= 30 ? 'var(--color-positive)' : 'var(--color-negative)' }}>{formatPct(bc.labourPct)}</span></span>}
                <span>{t('entry_label')}: {t('entry_days_of_30', { days: bc.entryDays })}</span>
              </div>
              {bc.issues.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  {bc.issues.slice(0, 3).map((issue, i) => (
                    <p key={i} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-negative)', lineHeight: 1.5 }}>• {issue}</p>
                  ))}
                </div>
              )}
              <Link href="/trends" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-accent)', textDecoration: 'none', marginTop: 6, display: 'inline-block' }}>{t('view_detail')} →</Link>
            </div>
          </div>
        </div>
      ))}

      {/* Revenue share bars */}
      <Section label={t('revenue_share')}>
        {branchCards.map((bc) => {
          const pct = totalRevenue > 0 ? (bc.totalRevenue / totalRevenue) * 100 : 0
          return (
            <div key={bc.branch.id} className="flex items-center gap-3" style={{ marginBottom: 8 }}>
              <span style={{ width: 100, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bc.branch.name}</span>
              <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'var(--color-bg-surface)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: bc.isHotel ? 'var(--color-accent)' : 'var(--color-green)' }} />
              </div>
              <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500, color: 'var(--color-text-primary)', flexShrink: 0, width: 100, textAlign: 'right' }}>{formatPct(pct, 0)} ({formatBaht(bc.totalRevenue)})</span>
            </div>
          )
        })}
      </Section>

      {/* Stacked revenue chart */}
      <Section label={t('weekly_revenue')}>
        <BarChart
          labels={weekLabels}
          data={allWeeks1.map((w, i) => {
            const rev1 = w.reduce((s, d) => s + d.revenue, 0)
            const rev2 = (allWeeks2[i] || []).reduce((s: number, d: BranchDailyMetric) => s + d.revenue, 0)
            return rev1 + rev2
          })}
          colors={weekLabels.map(() => 'var(--color-accent)')}
          yFormatter={(v) => `฿${Math.round(v / 1000)}k`}
          height={180}
        />
      </Section>

      {/* Insight */}
      <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderLeft: '3px solid var(--color-accent)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
        <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{t('insight_title')}</p>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-primary)' }}>{insightText}</p>
      </div>

      {/* 3-action list */}
      <Section label={t('actions_title')}>
        {actions.map((action, i) => (
          <div key={i} className="flex items-start gap-3" style={{ marginBottom: 10 }}>
            <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--color-accent-light)', color: 'var(--color-accent-text)', fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
            <p style={{ fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.5 }}>{action}</p>
          </div>
        ))}
      </Section>

      {/* Entry compliance */}
      <Section label={t('entry_all_branches')}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${branchCards.length}, 1fr)`, gap: 12 }}>
          {branchCards.map((bc) => {
            const today = getTodayBangkok()
            const bd = bc === branchCards[0] ? branch1 : branch2
            const todayDone = bd.metrics.data.some((d) => d.metric_date === today)
            const last7 = bd.metrics.data.filter((d) => {
              const diff = (new Date(today).getTime() - new Date(d.metric_date).getTime()) / 86400000
              return diff <= 7
            }).length
            return (
              <div key={bc.branch.id}>
                <div className="flex items-center gap-1.5" style={{ marginBottom: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: bc.isHotel ? 'var(--color-accent)' : 'var(--color-green)' }} />
                  <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-text-primary)' }}>{bc.branch.name}</span>
                </div>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>{t('entry_last_7', { done: last7 })}</p>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>{t('entry_month', { done: bc.entryDays })}</p>
                <p style={{ fontSize: 'var(--font-size-xs)', color: todayDone ? 'var(--color-positive)' : 'var(--color-negative)', marginTop: 2 }}>{todayDone ? t('entry_done_today') : t('entry_not_done_today')}</p>
              </div>
            )
          })}
        </div>
      </Section>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
      <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12 }}>{label}</p>
      {children}
    </div>
  )
}
