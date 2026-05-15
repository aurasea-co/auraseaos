'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import { BranchTypeBadge } from '@/components/ui/BranchTypeBadge'
import { OwnerOnlyBadge } from '@/components/ui/OwnerOnlyBadge'
import { formatCurrency } from '@/lib/format'
import { calculateDailySalaryCost, calculateMinRevenueForLabourTarget, calculateMinRoomsForLabourTarget } from '@/lib/calculations/hotel'
import { calculateMinCoversForLabourTarget } from '@/lib/calculations/fnb'
import { Button } from '@/components/ui/Button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import type { Target } from '@/lib/supabase/types'

export default function TargetsPage() {
  const { branches, organization, role, user } = useUser()
  const t = useTranslations('settingsTargets')
  const tCommon = useTranslations('common')
  const supabase = createClient()

  const [targets, setTargets] = useState<Record<string, Partial<Target>>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  if (role !== 'owner') return null

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!organization) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    db.from('targets')
      .select('*')
      .eq('organization_id', organization.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }: { data: any[] | null }) => {
        const map: Record<string, Partial<Target>> = {}
        ;(data || []).forEach((t: Target) => {
          map[t.branch_id] = t
        })
        setTargets(map)
      })
  }, [organization, supabase])

  function updateTarget(branchId: string, field: string, value: string) {
    setTargets((prev) => ({
      ...prev,
      [branchId]: {
        ...prev[branchId],
        [field]: value === '' ? null : isNaN(Number(value)) ? value : Number(value),
      },
    }))
  }

  async function handleSave(branchId: string) {
    if (!organization) return
    setSaving(branchId)
    const target = targets[branchId] || {}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const payload = {
      branch_id: branchId,
      organization_id: organization.id,
      adr_target: target.adr_target ?? null,
      occupancy_target: target.occupancy_target ?? target.occ_target ?? null,
      direct_booking_target: target.direct_booking_target ?? null,
      revpar_target: target.revpar_target ?? null,
      labour_target: target.labour_target ?? null,
      covers_target: target.covers_target ?? null,
      cogs_target: target.cogs_target ?? null,
      avg_spend_target: target.avg_spend_target ?? null,
      monthly_salary: target.monthly_salary ?? 0,
      operating_days: target.operating_days ?? 30,
      labour_alert_threshold: target.labour_alert_threshold ?? null,
    }

    await db.from('targets').upsert(payload, { onConflict: 'branch_id' })

    // Audit log
    await db.from('audit_log').insert({
      actor_user_id: user.id,
      organization_id: organization.id,
      action: 'update_targets',
      target_entity: 'targets',
      target_id: branchId,
      payload: { after: payload },
    })

    setSaving(null)
    setSaved(branchId)
    setTimeout(() => setSaved(null), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 lg:hidden mb-2">
        <Link href="/settings" className="p-1 text-slate-400 hover:text-slate-600 touch-target">
          <ArrowLeft size={20} />
        </Link>
        <h2 className="text-lg font-medium text-slate-900 leading-heading">{t('title')}</h2>
      </div>
      <h2 className="text-lg font-medium text-slate-900 leading-heading hidden lg:block">{t('title')}</h2>

      {branches.map((branch) => {
        const isHotel = branch.business_type === 'accommodation'
        const target = targets[branch.id] || {}
        return (
          <BranchTargetCard
            key={branch.id}
            branch={branch}
            isHotel={isHotel}
            target={target}
            onChange={(field, value) => updateTarget(branch.id, field, value)}
            onSave={() => handleSave(branch.id)}
            saving={saving === branch.id}
            saved={saved === branch.id}
            t={t}
            tCommon={tCommon}
          />
        )
      })}
    </div>
  )
}

function BranchTargetCard({
  branch,
  isHotel,
  target,
  onChange,
  onSave,
  saving,
  saved,
  t,
  tCommon,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  branch: any
  isHotel: boolean
  target: Partial<Target>
  onChange: (field: string, value: string) => void
  onSave: () => void
  saving: boolean
  saved: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tCommon: any
}) {
  const monthlySalary = Number(target.monthly_salary) || 0
  const operatingDays = Number(target.operating_days) || 30
  const labourTarget = Number(target.labour_target) || 30
  const dailyCost = calculateDailySalaryCost(monthlySalary, operatingDays)
  const minRevenue = calculateMinRevenueForLabourTarget(dailyCost, labourTarget)

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const autoCalcs = useMemo(() => {
    if (isHotel) {
      const adr = Number(target.adr_target) || 0
      const occ = Number(target.occupancy_target ?? target.occ_target) || 0
      const revpar = adr * (occ / 100)
      const minRooms = calculateMinRoomsForLabourTarget(minRevenue, adr)
      return { revpar, minRooms }
    } else {
      const avgSpend = Number(target.avg_spend_target) || 0
      const estRevenue = (Number(target.covers_target) || 0) * avgSpend
      const minCovers = calculateMinCoversForLabourTarget(dailyCost, labourTarget, avgSpend)
      return { estRevenue, minCovers }
    }
  }, [target, isHotel, dailyCost, labourTarget, minRevenue])

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 p-4 border-b border-slate-100">
        <BranchTypeBadge type={branch.business_type} size="md" />
        <span className="font-medium text-slate-900">{branch.name}</span>
      </div>

      {/* Revenue targets */}
      <div className="p-4 space-y-3">
        <h4 className="text-sm font-medium text-slate-700">{t('revenueTargets')}</h4>

        {isHotel ? (
          <>
            <TargetField label={t('adrTarget')} value={target.adr_target} field="adr_target" onChange={onChange} prefix="฿" />
            <TargetField label={t('occupancyTarget')} value={target.occupancy_target ?? target.occ_target} field="occupancy_target" onChange={onChange} suffix="%" />
            <TargetField label={t('directBookingTarget')} value={target.direct_booking_target} field="direct_booking_target" onChange={onChange} suffix="%" />
            <div className="flex justify-between text-sm py-2 bg-slate-50 px-3 rounded-lg">
              <span className="text-slate-500">RevPAR ({t('autoCalc')})</span>
              <span className="font-medium text-slate-900">{formatCurrency(autoCalcs.revpar || 0)}</span>
            </div>
          </>
        ) : (
          <>
            <TargetField label={t('coversTarget')} value={target.covers_target} field="covers_target" onChange={onChange} suffix={` ${t('perDay')}`} />
            <TargetField label={t('cogsTarget')} value={target.cogs_target} field="cogs_target" onChange={onChange} suffix="%" />
            <TargetField label={t('avgSpendTarget')} value={target.avg_spend_target} field="avg_spend_target" onChange={onChange} prefix="฿" />
            <div className="flex justify-between text-sm py-2 bg-slate-50 px-3 rounded-lg">
              <span className="text-slate-500">{t('estDailyRevenue')} ({t('autoCalc')})</span>
              <span className="font-medium text-slate-900">{formatCurrency(autoCalcs.estRevenue || 0)}</span>
            </div>
          </>
        )}
      </div>

      {/* Labour section — owner only */}
      <div className="p-4 border-t border-slate-100 space-y-3 bg-red-50/30">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-slate-700">{t('labourSection')}</h4>
          <OwnerOnlyBadge />
        </div>

        <TargetField label={t('monthlySalary')} value={target.monthly_salary} field="monthly_salary" onChange={onChange} prefix="฿" hint={t('salaryHint')} />
        <TargetField label={t('operatingDays')} value={target.operating_days} field="operating_days" onChange={onChange} suffix={` ${t('daysMonth')}`} />
        <TargetField label={t('labourTarget')} value={target.labour_target} field="labour_target" onChange={onChange} suffix="%" />
        <TargetField label={t('alertThreshold')} value={target.labour_alert_threshold} field="labour_alert_threshold" onChange={onChange} suffix="%" />

        {/* Auto-calculated readouts */}
        <div className="space-y-1.5 pt-2 border-t border-red-100">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">{t('dailyCost')} ({t('autoCalc')})</span>
            <span className="font-medium">{formatCurrency(dailyCost)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">{t('minRevenue')} ({t('autoCalc')})</span>
            <span className="font-medium">{formatCurrency(minRevenue)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">
              {isHotel ? t('minRooms') : t('minCovers')} ({t('autoCalc')})
            </span>
            <span className="font-medium">
              {isHotel ? autoCalcs.minRooms || 0 : autoCalcs.minCovers || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Save */}
      <div style={{ padding: 16, borderTop: '1px solid var(--color-border)' }}>
        <Button variant="primary" fullWidth disabled={saving} onClick={onSave}>
          {saving ? tCommon('saving') : saved ? '✓' : tCommon('save')}
        </Button>
      </div>
    </div>
  )
}

function TargetField({
  label,
  value,
  field,
  onChange,
  prefix,
  suffix,
  hint,
}: {
  label: string
  value: number | null | undefined
  field: string
  onChange: (field: string, value: string) => void
  prefix?: string
  suffix?: string
  hint?: string
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1 leading-body">{label}</label>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-sm text-slate-400">{prefix}</span>}
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(field, e.target.value)}
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
          inputMode="numeric"
        />
        {suffix && <span className="text-sm text-slate-400">{suffix}</span>}
      </div>
      {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  )
}
