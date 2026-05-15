'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { PlanGate } from '@/components/ui/PlanGate'
import { formatCurrency, formatPercent } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { calculateADR, calculateOccupancy, calculateRevPAR } from '@/lib/calculations/hotel'
import type { AccommodationDailyMetric } from '@/lib/supabase/entry-tables'
import type { Target } from '@/lib/supabase/types'

interface Props {
  existing: AccommodationDailyMetric | null
  target: Target | null
  totalRooms: number
  onSubmit: (data: Record<string, unknown>) => Promise<void>
  saving: boolean
}

export function AccommodationEntryForm({ existing, target, totalRooms, onSubmit, saving }: Props) {
  useUser() // for PlanGate context
  const t = useTranslations('entryAccommodation')
  const tCommon = useTranslations('common')
  const tLive = useTranslations('entryLive')

  const [roomsSold, setRoomsSold] = useState(existing?.rooms_sold?.toString() || '')
  const [revenue, setRevenue] = useState(existing?.revenue?.toString() || '')
  const [channelDirect, setChannelDirect] = useState(existing?.channel_direct?.toString() || '')
  const [channelOta, setChannelOta] = useState(existing?.channel_ota?.toString() || '')
  const [notes, setNotes] = useState(existing?.notes || '')

  const occTarget = Number(target?.occupancy_target ?? target?.occ_target) || 80

  const calcs = useMemo(() => {
    const rooms = parseInt(roomsSold) || 0
    const rev = parseFloat(revenue) || 0
    const adr = calculateADR(rev, rooms)
    const occ = calculateOccupancy(rooms, totalRooms)
    const revpar = calculateRevPAR(adr, occ)
    const adrGap = adr - (Number(target?.adr_target) || 0)
    return { adr, occ, revpar, adrGap, rooms, rev }
  }, [roomsSold, revenue, totalRooms, target])

  const channelTotal = (parseInt(channelDirect) || 0) + (parseInt(channelOta) || 0)
  const channelMismatch = channelDirect !== '' && channelOta !== '' && channelTotal !== calcs.rooms && calcs.rooms > 0

  function getColor(value: number, tgt: number, threshold = 5) {
    if (value >= tgt) return 'text-emerald-600'
    if (value >= tgt - threshold) return 'text-amber-600'
    return 'text-red-600'
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSubmit({
      rooms_sold: calcs.rooms || 0,
      rooms_available: totalRooms,
      revenue: calcs.rev,
      channel_direct: channelDirect ? parseInt(channelDirect) : null,
      channel_ota: channelOta ? parseInt(channelOta) : null,
      notes: notes || null,
    })
  }

  const canSubmit = calcs.rooms > 0 && calcs.rev > 0

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1 leading-body">{t('roomsSold')}</label>
          <input type="number" inputMode="numeric" value={roomsSold} onChange={(e) => setRoomsSold(e.target.value)} max={totalRooms} min={0} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target" placeholder={t('roomsSoldHint', { max: totalRooms })} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1 leading-body">{t('totalRevenue')}</label>
          <input type="number" inputMode="numeric" value={revenue} onChange={(e) => setRevenue(e.target.value)} min={0} step="0.01" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target" placeholder="฿" required />
        </div>
      </div>

      {(roomsSold || revenue) && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">{tLive('adr')}</span>
            <span className={`font-medium ${getColor(calcs.adr, Number(target?.adr_target) || 0)}`}>{formatCurrency(calcs.adr)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">{tLive('occupancy')}</span>
            <span className={`font-medium ${getColor(calcs.occ, occTarget)}`}>{formatPercent(calcs.occ)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">RevPAR</span>
            <span className="font-medium text-slate-900">{formatCurrency(calcs.revpar)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">{tLive('adrGap')}</span>
            <span className={`font-medium ${calcs.adrGap >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {calcs.adrGap >= 0 ? '+' : ''}{formatCurrency(calcs.adrGap)}
              <span className="text-xs ml-1">{calcs.adrGap >= 0 ? tLive('aboveTarget') : tLive('belowTarget')}</span>
            </span>
          </div>
        </div>
      )}

      <PlanGate requiredPlan="growth" featureName={t('channelBreakdown')}>
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <h4 className="text-sm font-medium text-slate-700">{t('channelBreakdown')}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('channelDirect')}</label>
              <input type="number" inputMode="numeric" value={channelDirect} onChange={(e) => setChannelDirect(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('channelOta')}</label>
              <input type="number" inputMode="numeric" value={channelOta} onChange={(e) => setChannelOta(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target" />
            </div>
          </div>
          {channelMismatch && <p className="text-xs text-red-600">{t('channelMismatch', { total: channelTotal, rooms: calcs.rooms })}</p>}
        </div>
      </PlanGate>

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
