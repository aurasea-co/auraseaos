'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { PlanGate } from '@/components/ui/PlanGate'
import { formatCurrency, formatPercent } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { calculateADR, calculateOccupancy, calculateRevPAR } from '@/lib/calculations/hotel'
import type { AccommodationDailyMetric } from '@/lib/supabase/entry-tables'
import type { Target } from '@/lib/supabase/types'
import type { KnownRoomType } from '@/lib/recommendations/hotel/room-types'

interface Props {
  existing: AccommodationDailyMetric | null
  target: Target | null
  totalRooms: number
  knownRoomTypes: KnownRoomType[]
  onSubmit: (data: Record<string, unknown>) => Promise<void>
  saving: boolean
}

// Local per-row state for the per-room-type entry section. Inputs stay
// strings so the form can distinguish "empty" from "explicit 0".
interface BreakdownEntry {
  roomType: string
  inventory: number
  occupied: string
  rateThb: string
}

export function AccommodationEntryForm({ existing, target, totalRooms, knownRoomTypes, onSubmit, saving }: Props) {
  useUser() // for PlanGate context
  const t = useTranslations('entryAccommodation')
  const tCommon = useTranslations('common')
  const tLive = useTranslations('entryLive')

  const [roomsSold, setRoomsSold] = useState(existing?.rooms_sold?.toString() || '')
  const [revenue, setRevenue] = useState(existing?.revenue?.toString() || '')
  const [channelDirect, setChannelDirect] = useState(existing?.channel_direct?.toString() || '')
  const [channelOta, setChannelOta] = useState(existing?.channel_ota?.toString() || '')
  const [notes, setNotes] = useState(existing?.notes || '')

  // Per-room-type rows — initialised from existing.room_type_breakdown
  // when editing a past entry, otherwise from knownRoomTypes with the
  // latest rate pre-filled and occupied blank (owner fills in fresh
  // each day; the rate is the only thing they typically nudge).
  const existingBreakdown = useMemo(() => {
    // accommodation_daily_metrics types don't declare room_type_breakdown
    // on the typed interface (it's a jsonb column we add separately).
    // Cast defensively.
    const raw = (existing as unknown as { room_type_breakdown?: Array<{ roomType: string; totalRooms?: number; occupiedRooms?: number; rateThb?: number }> | null })?.room_type_breakdown
    return Array.isArray(raw) ? raw : []
  }, [existing])

  const [breakdown, setBreakdown] = useState<BreakdownEntry[]>(() => {
    if (existingBreakdown.length > 0) {
      return existingBreakdown.map((b) => ({
        roomType: b.roomType,
        inventory: b.totalRooms || 0,
        occupied: String(b.occupiedRooms ?? ''),
        rateThb: String(b.rateThb ?? ''),
      }))
    }
    return knownRoomTypes.map((rt) => ({
      roomType: rt.roomType,
      inventory: rt.inventory,
      occupied: '',
      rateThb: rt.latestRateThb > 0 ? String(rt.latestRateThb) : '',
    }))
  })

  // When the user fills any per-type occupied/rate, auto-derive the
  // hotel-wide totals from the breakdown so they don't have to type
  // those numbers twice. Only fires when the hotel-wide field is
  // empty (so an explicit hotel-wide entry isn't overwritten).
  const breakdownTotals = useMemo(() => {
    let roomsFromBreakdown = 0
    let revenueFromBreakdown = 0
    let anyFilled = false
    for (const row of breakdown) {
      const occ = parseInt(row.occupied) || 0
      const rate = parseFloat(row.rateThb) || 0
      if (occ > 0) {
        roomsFromBreakdown += occ
        revenueFromBreakdown += occ * rate
        anyFilled = true
      }
    }
    return { roomsFromBreakdown, revenueFromBreakdown, anyFilled }
  }, [breakdown])

  useEffect(() => {
    if (!breakdownTotals.anyFilled) return
    if (roomsSold === '' && breakdownTotals.roomsFromBreakdown > 0) {
      setRoomsSold(String(breakdownTotals.roomsFromBreakdown))
    }
    if (revenue === '' && breakdownTotals.revenueFromBreakdown > 0) {
      setRevenue(String(Math.round(breakdownTotals.revenueFromBreakdown)))
    }
    // Intentional: we only auto-fill once when hotel-wide fields are
    // empty. Users typing into hotel-wide after fill should be
    // respected; we don't want to fight their input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdownTotals.anyFilled])

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

  // Build the room_type_breakdown jsonb payload from any rows the
  // owner filled. Empty rows are dropped so we don't write noise that
  // would later show up as Suite/0/0 in the dashboard breakdown.
  const filledBreakdown = useMemo(() => {
    return breakdown
      .map((row) => ({
        roomType: row.roomType,
        totalRooms: row.inventory,
        occupiedRooms: parseInt(row.occupied) || 0,
        rateThb: parseFloat(row.rateThb) || 0,
      }))
      .filter((row) => row.occupiedRooms > 0 || row.rateThb > 0)
  }, [breakdown])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSubmit({
      rooms_sold: calcs.rooms || 0,
      rooms_available: totalRooms,
      revenue: calcs.rev,
      channel_direct: channelDirect ? parseInt(channelDirect) : null,
      channel_ota: channelOta ? parseInt(channelOta) : null,
      notes: notes || null,
      // Send the jsonb when at least one row has data; otherwise send
      // null so we don't blow away a previous import's breakdown.
      ...(filledBreakdown.length > 0 ? { room_type_breakdown: filledBreakdown } : {}),
    })
  }

  function updateBreakdownRow(index: number, patch: Partial<BreakdownEntry>) {
    setBreakdown((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
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

      {/* Per-room-type breakdown — optional. Only renders when the
          branch has a history of breakdown data (so brand-new branches
          without any CSV import don't see an empty section with
          nothing to fill). Owners who fill any row get hotel-wide
          totals auto-summed (see the useEffect above). Owners who
          ignore this section keep the legacy hotel-wide-only flow. */}
      {knownRoomTypes.length > 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-slate-700">{t('roomTypeBreakdownTitle')}</h4>
            <span className="text-xs text-slate-500">{t('roomTypeBreakdownOptional')}</span>
          </div>
          <p className="text-xs text-slate-500">{t('roomTypeBreakdownHint')}</p>
          <div className="space-y-2">
            {breakdown.map((row, i) => (
              <div key={row.roomType} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-4 text-sm text-slate-700 font-medium">
                  {row.roomType}
                  {row.inventory > 0 && (
                    <span className="block text-xs text-slate-500 font-normal">
                      {t('roomTypeInventoryLabel', { count: row.inventory })}
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  value={row.occupied}
                  onChange={(e) => updateBreakdownRow(i, { occupied: e.target.value })}
                  className="col-span-4 px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
                  placeholder={t('roomTypeOccupiedPlaceholder')}
                  min={0}
                  max={row.inventory || undefined}
                />
                <input
                  type="number"
                  inputMode="numeric"
                  value={row.rateThb}
                  onChange={(e) => updateBreakdownRow(i, { rateThb: e.target.value })}
                  className="col-span-4 px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
                  placeholder={t('roomTypeRatePlaceholder')}
                  min={0}
                />
              </div>
            ))}
          </div>
          {breakdownTotals.anyFilled && (
            <div className="text-xs text-slate-500 border-t border-slate-100 pt-2">
              {t('roomTypeAutoSummed', {
                rooms: breakdownTotals.roomsFromBreakdown,
                revenue: formatCurrency(breakdownTotals.revenueFromBreakdown),
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-50 rounded-xl border border-dashed border-slate-300 p-4 text-xs text-slate-500">
          {t('roomTypeBreakdownNoHistory')}{' '}
          <Link href="/settings/import" className="text-blue-600 hover:underline">
            {t('roomTypeBreakdownNoHistoryCta')}
          </Link>
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
