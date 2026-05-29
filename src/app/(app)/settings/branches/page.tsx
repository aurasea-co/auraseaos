'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import { BranchTypeBadge } from '@/components/ui/BranchTypeBadge'
import { Button } from '@/components/ui/Button'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { SEAT_LIMITS } from '@/lib/config/pricing'
import { DeleteBranchModal } from '@/components/branches/DeleteBranchModal'

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
  const [editCutoff, setEditCutoff] = useState('05:00')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; dataRows: number } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const router = useRouter()

  const isLastBranch = branches.length <= 1

  async function openDeleteModal(branchId: string, name: string) {
    // Probe usage so the modal knows whether to demand typed
    // confirmation. The route is service-role-backed but checks
    // ownership against the caller — we don't pass anything but the
    // cookie session.
    try {
      const res = await fetch(`/api/branches/${branchId}/usage`)
      if (!res.ok) {
        setToast(t('deleteFailed'))
        return
      }
      const json: { dataRows: number; isLastBranch: boolean } = await res.json()
      // Defensive double-check; UI already hides the trigger on the
      // last branch, but the server returns this too so we honour it.
      if (json.isLastBranch) return
      setDeleteTarget({ id: branchId, name, dataRows: json.dataRows })
    } catch {
      setToast(t('deleteFailed'))
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    const res = await fetch(`/api/branches/${deleteTarget.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error || t('deleteFailed'))
    }
    setDeleteTarget(null)
    setToast(t('deleteSuccess'))
    // router.refresh() re-runs the (app)/layout server component
    // so getUserContext re-fetches branches and the page re-renders
    // without the deleted row.
    router.refresh()
    window.setTimeout(() => setToast(null), 3500)
  }

  if (role !== 'owner') return null

  const limit = planBranchLimits[plan]
  const canAdd = branches.length < limit

  function startEdit(branch: typeof branches[0]) {
    setEditingId(branch.id)
    setEditName(branch.name)
    setEditRooms(branch.total_rooms?.toString() || '')
    setEditSeats((branch.total_seats)?.toString() || '')
    setEditCutoff(branch.business_day_cutoff_time?.slice(0, 5) || (branch.business_type === 'accommodation' ? '14:00' : '05:00'))
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
                <div className="flex items-center gap-1">
                  <button onClick={() => startEdit(branch)} className="p-1 text-slate-400 hover:text-slate-600 touch-target" aria-label="Edit">
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => openDeleteModal(branch.id, branch.name)}
                    disabled={isLastBranch}
                    title={isLastBranch ? t('deleteDisabledLast') : t('deleteBranch')}
                    aria-label={t('deleteBranch')}
                    className="p-1 touch-target"
                    style={{
                      color: isLastBranch ? '#cfcfcf' : '#A32D2D',
                      cursor: isLastBranch ? 'not-allowed' : 'pointer',
                      background: 'transparent',
                      border: 'none',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
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
                  <p style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                    {t(isHotel ? 'cutoffHintAccommodation' : 'cutoffHintFnb')}
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

      {deleteTarget && (
        <DeleteBranchModal
          branchName={deleteTarget.name}
          dataRows={deleteTarget.dataRows}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1a1a1a',
            color: '#ffffff',
            padding: '10px 18px',
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            zIndex: 220,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
