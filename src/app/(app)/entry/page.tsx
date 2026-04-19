'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import { AccommodationEntryForm } from '@/components/entry/AccommodationEntryForm'
import { FnbEntryForm } from '@/components/entry/FnbEntryForm'
import { EntryConfirmation } from '@/components/entry/EntryConfirmation'
import { BranchTypeBadge } from '@/components/ui/BranchTypeBadge'
import {
  getEntryTable,
  type AccommodationDailyMetric,
  type FnbDailyMetric,
} from '@/lib/supabase/entry-tables'
import {
  getBusinessDate,
  getTodayBangkok,
  getMinAllowedDate,
  formatBusinessDateDisplay,
} from '@/lib/businessDate'
import type { Target } from '@/lib/supabase/types'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function EntryPage() {
  const { activeBranch, role, user, organization } = useUser()
  const t = useTranslations('entry')
  const supabase = createClient()

  const isHotel = activeBranch?.business_type === 'accommodation'
  const totalRooms = activeBranch?.total_rooms || 0
  const cutoffTime = activeBranch?.business_day_cutoff_time || (isHotel ? '14:00:00' : '05:00:00')

  // Business date — uses cutoff logic
  const [date, setDate] = useState(() => getBusinessDate(cutoffTime))
  const [existingAccom, setExistingAccom] = useState<AccommodationDailyMetric | null>(null)
  const [existingFnb, setExistingFnb] = useState<FnbDailyMetric | null>(null)
  const [target, setTarget] = useState<Target | null>(null)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submittedData, setSubmittedData] = useState<Record<string, unknown>>({})

  // Max backdating: owner 7 days, others 2 days
  const maxBackDays = role === 'owner' ? 7 : 2
  const minDate = getMinAllowedDate(maxBackDays)
  const todayBangkok = getTodayBangkok()

  // Business date display
  const dateDisplay = formatBusinessDateDisplay(date, 'th')

  // Load existing entry + targets
  const loadData = useCallback(async () => {
    if (!activeBranch) return
    setSubmitted(false)
    setExistingAccom(null)
    setExistingFnb(null)

    const table = getEntryTable(activeBranch.business_type)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const [entryResult, targetResult] = await Promise.all([
      db.from(table).select('*').eq('branch_id', activeBranch.id).eq('metric_date', date).maybeSingle(),
      db.from('targets').select('adr_target, occupancy_target, occ_target, covers_target, cogs_target, avg_spend_target, labour_target, operating_days').eq('branch_id', activeBranch.id).maybeSingle(),
    ])

    if (isHotel) {
      setExistingAccom(entryResult.data as AccommodationDailyMetric | null)
    } else {
      setExistingFnb(entryResult.data as FnbDailyMetric | null)
    }
    setTarget(targetResult.data as Target | null)
  }, [activeBranch, date, supabase, isHotel])

  useEffect(() => { loadData() }, [loadData])

  async function handleSubmit(data: Record<string, unknown>) {
    if (!activeBranch) return
    setSaving(true)

    const table = getEntryTable(activeBranch.business_type)
    const entry = { branch_id: activeBranch.id, metric_date: date, ...data }

    // Use API route with UPSERT to bypass RLS triggers
    const res = await fetch('/api/entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, entry }),
    })
    const result = await res.json()

    if (!res.ok || result.error) {
      console.error('Entry save failed:', result.error)
      alert(`บันทึกไม่สำเร็จ: ${result.error}`)
      setSaving(false)
      return
    }

    if (organization) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('audit_log').insert({
        actor_user_id: user.id,
        organization_id: organization.id,
        action: (existingAccom || existingFnb) ? 'update_entry' : 'create_entry',
        target_entity: table,
        payload: { branch_id: activeBranch.id, date, ...data },
      })
    }

    setSaving(false)
    setSubmittedData(data)
    setSubmitted(true)
  }

  function shiftDate(days: number) {
    const d = new Date(date + 'T00:00:00')
    d.setDate(d.getDate() + days)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (dateStr >= minDate && dateStr <= todayBangkok) {
      setDate(dateStr)
    }
  }

  if (!activeBranch) {
    return <div style={{ padding: 'var(--space-10) 0', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>{t('noBranch')}</div>
  }

  if (submitted) {
    return (
      <EntryConfirmation
        date={date}
        businessDateLabel={dateDisplay.label}
        businessDateStr={dateDisplay.dateStr}
        isHotel={isHotel}
        submittedData={submittedData}
        adrTarget={Number(target?.adr_target) || undefined}
        cogsTarget={Number(target?.cogs_target) || undefined}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Business date selector */}
      <div
        className="flex items-center justify-between"
        style={{
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '10px 16px',
        }}
      >
        <button
          onClick={() => shiftDate(-1)}
          disabled={date <= minDate}
          className="touch-target flex items-center justify-center"
          style={{
            width: 32, height: 32,
            background: 'none', border: 'none', cursor: date <= minDate ? 'not-allowed' : 'pointer',
            color: date <= minDate ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
            opacity: date <= minDate ? 0.3 : 1,
          }}
        >
          <ChevronLeft size={18} />
        </button>

        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 2 }}>
            กรอกข้อมูลสำหรับ
          </span>
          <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 500, color: 'var(--color-text-primary)' }}>
            {dateDisplay.label ? `${dateDisplay.label} ` : ''}{dateDisplay.dateStr}
          </span>
        </div>

        <button
          onClick={() => shiftDate(1)}
          disabled={date >= todayBangkok}
          className="touch-target flex items-center justify-center"
          style={{
            width: 32, height: 32,
            background: 'none', border: 'none', cursor: date >= todayBangkok ? 'not-allowed' : 'pointer',
            color: date >= todayBangkok ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
            opacity: date >= todayBangkok ? 0.3 : 1,
          }}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Backdate warning */}
      {dateDisplay.daysBack > 1 && (
        <div style={{
          background: 'var(--color-amber-light)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '6px 12px',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-amber-text)',
        }}>
          กรอกข้อมูลย้อนหลัง {dateDisplay.daysBack} วัน
        </div>
      )}

      {/* Branch info */}
      <div className="flex items-center gap-2" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
        <BranchTypeBadge type={activeBranch.business_type} size="sm" />
        <span>{activeBranch.name}</span>
        {(existingAccom || existingFnb) && (
          <span style={{
            fontSize: 10, fontWeight: 500,
            padding: '1px 8px',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--color-amber-light)',
            color: 'var(--color-amber-text)',
          }}>
            {t('editing')}
          </span>
        )}
      </div>

      {/* Form */}
      {isHotel ? (
        <AccommodationEntryForm
          key={date}
          existing={existingAccom}
          target={target}
          totalRooms={totalRooms}
          onSubmit={handleSubmit}
          saving={saving}
        />
      ) : (
        <FnbEntryForm
          key={date}
          existing={existingFnb}
          target={target}
          onSubmit={handleSubmit}
          saving={saving}
        />
      )}
    </div>
  )
}
