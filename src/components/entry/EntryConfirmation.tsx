'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatPercent } from '@/lib/format'
import { getEntryTable } from '@/lib/supabase/entry-tables'
import { Check } from 'lucide-react'
import { getTodayBangkok, toBangkokDateStr } from '@/lib/businessDate'
import Link from 'next/link'

interface Props {
  date: string
  businessDateLabel: string  // "วันนี้" or "เมื่อวาน" or ""
  businessDateStr: string    // "11 เม.ย. 2569"
  isHotel: boolean
  submittedData: Record<string, unknown>
  adrTarget?: number
  cogsTarget?: number
}

export function EntryConfirmation({ businessDateLabel, businessDateStr, isHotel, submittedData, adrTarget, cogsTarget }: Props) {
  const { role, activeBranch } = useUser()
  const t = useTranslations('entryConfirm')
  const supabase = createClient()
  const [streakDays, setStreakDays] = useState<boolean[]>([])

  useEffect(() => {
    if (!activeBranch) return
    const todayStr = getTodayBangkok()
    const todayDate = new Date(todayStr + 'T00:00:00')
    const days: string[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayDate)
      d.setDate(d.getDate() - i)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      days.push(`${y}-${m}-${day}`)
    }

    const table = getEntryTable(activeBranch.business_type)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any)
      .from(table)
      .select('metric_date')
      .eq('branch_id', activeBranch.id)
      .in('metric_date', days)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }: { data: any[] | null }) => {
        const dates = (data || []).map((d: { metric_date: string }) => toBangkokDateStr(d.metric_date))
        setStreakDays(days.map((d) => dates.includes(d)))
      })
  }, [activeBranch, supabase])

  const revenue = Number(submittedData.revenue) || 0
  const roomsSold = Number(submittedData.rooms_sold) || 0
  const customers = Number(submittedData.total_customers) || 0
  const cost = Number(submittedData.additional_cost_today) || 0
  const adr = roomsSold > 0 ? revenue / roomsSold : 0
  const marginPct = revenue > 0 && cost > 0 ? ((revenue - cost) / revenue) * 100 : null

  const checkColor = isHotel ? 'var(--color-accent-light)' : 'var(--color-green-light)'
  const checkIconColor = isHotel ? 'var(--color-accent)' : 'var(--color-green)'

  // Business date display — the most important element
  const dateLabel = businessDateLabel
    ? `${businessDateLabel} ${businessDateStr}`
    : businessDateStr

  return (
    <div className="flex flex-col items-center" style={{ paddingTop: 32, gap: 24 }}>
      {/* Checkmark */}
      <div
        className="flex items-center justify-center"
        style={{ width: 80, height: 80, borderRadius: '50%', background: checkColor }}
      >
        <Check size={40} style={{ color: checkIconColor }} />
      </div>

      {/* Title with business date */}
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1.3 }}>
          {role === 'staff' ? t('staffTitle') : t('managerTitle')}
        </h2>
        <p style={{ fontSize: 'var(--font-size-md)', fontWeight: 500, color: 'var(--color-accent)', marginTop: 6 }}>
          {dateLabel}
        </p>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
          {activeBranch?.name}
        </p>
      </div>

      {/* Data echo — non-staff */}
      {role !== 'staff' && (
        <div style={{ width: '100%', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
          {isHotel ? (
            <>
              <DataRow label={t('roomsSold')} value={`${roomsSold}`} />
              <DataRow label={t('revenue')} value={formatCurrency(revenue)} />
              <DataRow label="ADR" value={formatCurrency(adr)} highlight={adr >= (adrTarget || 0) ? 'green' : 'red'} />
            </>
          ) : (
            <>
              <DataRow label={t('sales')} value={formatCurrency(revenue)} />
              <DataRow label={t('covers')} value={`${customers}`} />
              {marginPct != null && (
                <DataRow label="Margin (excl. salary)" value={formatPercent(marginPct)} highlight={marginPct >= (cogsTarget || 32) ? 'green' : 'red'} />
              )}
            </>
          )}
        </div>
      )}

      {/* Staff — simple confirmation */}
      {role === 'staff' && (
        <div style={{ width: '100%', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            {isHotel ? t('roomsSubmitted', { count: roomsSold }) : t('coversSubmitted', { count: customers })}
          </p>
        </div>
      )}

      {/* Owner insight */}
      {role === 'owner' && (
        <div style={{ width: '100%', background: 'var(--color-accent-light)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-accent-text)', lineHeight: 1.6 }}>
            {isHotel
              ? t('ownerInsightHotel', { adr: formatCurrency(adr), target: formatCurrency(adrTarget || 0) })
              : t('ownerInsightFnb', { margin: formatPercent(marginPct || 0), target: formatPercent(cogsTarget || 32) })}
          </p>
        </div>
      )}

      {/* 7-day streak */}
      <div style={{ width: '100%' }}>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 8, textAlign: 'center' }}>{t('streak7days')}</p>
        <div className="flex justify-center gap-2">
          {streakDays.map((filled, i) => (
            <div
              key={i}
              className="flex items-center justify-center"
              style={{
                width: 30, height: 30, borderRadius: '50%',
                fontSize: 'var(--font-size-xs)', fontWeight: 500,
                background: filled ? 'var(--color-green-light)' : 'var(--color-bg-surface)',
                color: filled ? 'var(--color-green)' : 'var(--color-text-tertiary)',
              }}
            >
              {filled ? '✓' : '–'}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3" style={{ width: '100%' }}>
        {role !== 'staff' && (
          <Link href="/entry" style={{ flex: 1, padding: '9px 18px', textAlign: 'center', fontSize: 13, fontWeight: 500, background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', textDecoration: 'none' }} className="touch-target">
            {t('editEntry')}
          </Link>
        )}
        <Link href="/home" style={{ flex: 1, padding: '9px 18px', textAlign: 'center', fontSize: 13, fontWeight: 500, background: 'var(--color-accent)', color: 'white', borderRadius: 'var(--radius-md)', textDecoration: 'none' }} className="touch-target">
          {t('backToHome')}
        </Link>
      </div>
    </div>
  )
}

function DataRow({ label, value, highlight }: { label: string; value: string; highlight?: 'green' | 'red' }) {
  return (
    <div className="flex justify-between" style={{ padding: '6px 0', fontSize: 'var(--font-size-sm)', borderBottom: '1px solid var(--color-border)' }}>
      <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: 500, color: highlight === 'green' ? 'var(--color-positive)' : highlight === 'red' ? 'var(--color-negative)' : 'var(--color-text-primary)' }}>{value}</span>
    </div>
  )
}
