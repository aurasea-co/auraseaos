'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import { BranchTypeBadge } from '@/components/ui/BranchTypeBadge'
import { Button } from '@/components/ui/Button'
import { ArrowLeft, Pencil, Plus } from 'lucide-react'
import Link from 'next/link'
import { SEAT_LIMITS } from '@/lib/config/pricing'

const planBranchLimits = { starter: SEAT_LIMITS.starter.branches, growth: SEAT_LIMITS.growth.branches, pro: SEAT_LIMITS.pro.branches }

export default function BranchesPage() {
  const { branches, plan, role } = useUser()
  const t = useTranslations('settingsBranches')
  const tCommon = useTranslations('common')
  const supabase = createClient()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editRooms, setEditRooms] = useState('')
  const [editSeats, setEditSeats] = useState('')
  const [editCutoff, setEditCutoff] = useState('03:00')
  const [saving, setSaving] = useState(false)

  if (role !== 'owner') return null

  const limit = planBranchLimits[plan]
  const canAdd = branches.length < limit

  function startEdit(branch: typeof branches[0]) {
    setEditingId(branch.id)
    setEditName(branch.name)
    setEditRooms(branch.total_rooms?.toString() || '')
    setEditSeats((branch.total_seats)?.toString() || '')
    setEditCutoff(branch.business_day_cutoff_time?.slice(0, 5) || (branch.business_type === 'accommodation' ? '12:00' : '03:00'))
  }

  async function handleSave(branchId: string, isHotel: boolean) {
    setSaving(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const update: Record<string, unknown> = { name: editName, business_day_cutoff_time: editCutoff + ':00' }
    if (isHotel) update.total_rooms = parseInt(editRooms) || null
    else update.total_seats = parseInt(editSeats) || null
    await db.from('branches').update(update).eq('id', branchId)
    setSaving(false)
    setEditingId(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 lg:hidden mb-2">
        <Link href="/settings" className="p-1 text-slate-400 hover:text-slate-600 touch-target">
          <ArrowLeft size={20} />
        </Link>
        <h2 className="text-lg font-medium text-slate-900 leading-heading">{t('title')}</h2>
      </div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-slate-900 leading-heading hidden lg:block">{t('title')}</h2>
        <span className="text-xs text-slate-400">{branches.length}/{limit} {t('used')}</span>
      </div>

      {branches.map((branch) => {
        const isHotel = branch.business_type === 'accommodation'
        const isEditing = editingId === branch.id
        return (
          <div key={branch.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <BranchTypeBadge type={branch.business_type} />
                {isEditing ? (
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
                  />
                ) : (
                  <span className="font-medium text-slate-900">{branch.name}</span>
                )}
              </div>
              {!isEditing && (
                <button onClick={() => startEdit(branch)} className="p-1 text-slate-400 hover:text-slate-600 touch-target">
                  <Pencil size={14} />
                </button>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-2 mt-3">
                <div>
                  <label className="text-xs text-slate-500">
                    {isHotel ? t('totalRooms') : t('totalSeats')}
                  </label>
                  <input
                    type="number"
                    value={isHotel ? editRooms : editSeats}
                    onChange={(e) => isHotel ? setEditRooms(e.target.value) : setEditSeats(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>
                    {t('cutoffTime')}
                  </label>
                  <input
                    type="time"
                    value={editCutoff}
                    onChange={(e) => setEditCutoff(e.target.value)}
                    className="touch-target"
                  />
                  <p style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4, lineHeight: 1.5 }}>
                    {t('cutoffHint')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" disabled={saving} onClick={() => handleSave(branch.id, isHotel)}>
                    {saving ? tCommon('saving') : tCommon('save')}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setEditingId(null)}>
                    {tCommon('cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                {isHotel
                  ? `${branch.total_rooms ?? t('notSet')} ${branch.total_rooms ? t('rooms') : ''}`
                  : `${branch.total_seats || t('notSet')} ${(branch.total_seats) ? t('seats') : ''}`
                }
              </div>
            )}
          </div>
        )
      })}

      {canAdd ? (
        <button className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors touch-target">
          <Plus size={16} />
          {t('addBranch')}
        </button>
      ) : (
        <div className="text-center py-3 text-xs text-slate-400">
          {t('limitReached')}
          <Link href="/settings/billing" className="text-blue-600 hover:text-blue-700 ml-1">
            {t('upgrade')}
          </Link>
        </div>
      )}
    </div>
  )
}
