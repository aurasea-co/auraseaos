'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { PlanGate } from '@/components/ui/PlanGate'
import { formatCurrency, formatPercent } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { calculateAvgSpend, calculateGrossMargin } from '@/lib/calculations/fnb'
import type { FnbDailyMetric } from '@/lib/supabase/entry-tables'
import type { Target } from '@/lib/supabase/types'
import { AlertTriangle } from 'lucide-react'

interface Props {
  existing: FnbDailyMetric | null
  target: Target | null
  onSubmit: (data: Record<string, unknown>) => Promise<void>
  saving: boolean
}

export function FnbEntryForm({ existing, target, onSubmit, saving }: Props) {
  useUser() // for PlanGate context
  const t = useTranslations('entryFnb')
  const tCommon = useTranslations('common')
  const tLive = useTranslations('entryLive')

  const [sales, setSales] = useState(existing?.revenue?.toString() || '')
  const [covers, setCovers] = useState(existing?.total_customers?.toString() || '')
  const [costTotal, setCostTotal] = useState(existing?.additional_cost_today?.toString() || '')
  const [costFood, setCostFood] = useState(existing?.cost_food?.toString() || '')
  const [costNonfood, setCostNonfood] = useState(existing?.cost_nonfood?.toString() || '')
  const [splitCost, setSplitCost] = useState(!!(existing?.cost_food || existing?.cost_nonfood))
  const [notes, setNotes] = useState(existing?.notes || '')

  const cogsTarget = Number(target?.cogs_target) || 32

  const calcs = useMemo(() => {
    const salesNum = parseFloat(sales) || 0
    const coversNum = parseInt(covers) || 0
    const food = parseFloat(costFood) || 0
    const nonfood = parseFloat(costNonfood) || 0
    const totalCost = splitCost ? food + nonfood : parseFloat(costTotal) || 0
    const avgSpend = calculateAvgSpend(salesNum, coversNum)
    const marginPct = totalCost > 0 ? calculateGrossMargin(salesNum, totalCost) : null
    const grossProfit = salesNum - totalCost
    return { salesNum, coversNum, totalCost, avgSpend, marginPct, grossProfit, food, nonfood }
  }, [sales, covers, costTotal, costFood, costNonfood, splitCost])

  function getColor(value: number, tgt: number) {
    if (value >= tgt) return 'text-emerald-600'
    if (value >= tgt - 5) return 'text-amber-600'
    return 'text-red-600'
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSubmit({
      total_customers: calcs.coversNum || 0,
      revenue: calcs.salesNum,
      avg_ticket: calcs.coversNum > 0 ? calcs.avgSpend : 0,
      additional_cost_today: calcs.totalCost > 0 ? calcs.totalCost : 0,
      cost_food: splitCost && calcs.food > 0 ? calcs.food : null,
      cost_nonfood: splitCost && calcs.nonfood > 0 ? calcs.nonfood : null,
      notes: notes || null,
    })
  }

  const canSubmit = calcs.salesNum > 0 && calcs.coversNum > 0

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1 leading-body">{t('totalSales')}</label>
          <input type="number" inputMode="numeric" value={sales} onChange={(e) => setSales(e.target.value)} min={0} step="0.01" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target" placeholder="฿" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1 leading-body">{t('covers')}</label>
          <input type="number" inputMode="numeric" value={covers} onChange={(e) => setCovers(e.target.value)} min={0} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target" placeholder={t('coversHint')} required />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        {!splitCost ? (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 leading-body">{t('costTotal')}</label>
            <input type="number" inputMode="numeric" value={costTotal} onChange={(e) => setCostTotal(e.target.value)} min={0} step="0.01" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target" placeholder={t('costTotalHint')} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('costFood')}</label>
              <input type="number" inputMode="numeric" value={costFood} onChange={(e) => setCostFood(e.target.value)} min={0} step="0.01" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target" placeholder={t('costFoodHint')} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('costNonfood')}</label>
              <input type="number" inputMode="numeric" value={costNonfood} onChange={(e) => setCostNonfood(e.target.value)} min={0} step="0.01" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target" placeholder={t('costNonfoodHint')} />
            </div>
          </div>
        )}
        <PlanGate requiredPlan="growth" featureName={t('splitCostFeature')}>
          <button type="button" onClick={() => setSplitCost(!splitCost)} className="text-xs text-blue-600 hover:text-blue-700 touch-target">
            {splitCost ? t('useSingleCost') : t('splitFoodNonfood')}
          </button>
        </PlanGate>
      </div>

      {!costTotal && !costFood && !costNonfood && calcs.salesNum > 0 && (
        <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-700 leading-body">{t('noCostWarning')}</p>
        </div>
      )}

      {(sales || covers) && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
          {calcs.coversNum > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{tLive('avgSpend')}</span>
              <span className="font-medium text-slate-900">{formatCurrency(calcs.avgSpend)}</span>
            </div>
          )}
          {calcs.marginPct != null && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">{tLive('margin')}</span>
                <span className={`font-medium ${getColor(calcs.marginPct, cogsTarget)}`}>{formatPercent(calcs.marginPct)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">{tLive('grossProfit')}</span>
                <span className="font-medium text-slate-900">{formatCurrency(calcs.grossProfit)}</span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <label className="block text-sm font-medium text-slate-700 mb-1 leading-body">{t('notes')}</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={200} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none touch-target" placeholder={t('notesHint')} />
      </div>

      <Button type="submit" variant="primary" fullWidth disabled={saving || !canSubmit}>
        {saving ? tCommon('saving') : existing ? t('update') : t('submit')}
      </Button>
    </form>
  )
}
