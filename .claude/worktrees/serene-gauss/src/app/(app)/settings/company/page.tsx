'use client'

import { useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { ArrowLeft, Pencil } from 'lucide-react'
import Link from 'next/link'

export default function CompanyPage() {
  const { organization, branches, role } = useUser()
  const t = useTranslations('settingsCompany')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const supabase = createClient()

  const [editing, setEditing] = useState(false)
  const [companyName, setCompanyName] = useState(organization?.name || '')
  const [saving, setSaving] = useState(false)

  if (role !== 'owner' || !organization) return null

  async function handleSave() {
    setSaving(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    await db.from('organizations').update({ name: companyName }).eq('id', organization!.id)
    setSaving(false)
    setEditing(false)
  }

  const typeLabel =
    organization.vertical_type === 'accommodation'
      ? t('typeAccommodation')
      : organization.vertical_type === 'fnb'
      ? t('typeFnb')
      : t('typeHybrid')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 lg:hidden mb-2">
        <Link href="/settings" className="p-1 text-slate-400 hover:text-slate-600 touch-target">
          <ArrowLeft size={20} />
        </Link>
        <h2 className="text-lg font-medium text-slate-900 leading-heading">{t('title')}</h2>
      </div>
      <h2 className="text-lg font-medium text-slate-900 leading-heading hidden lg:block">{t('title')}</h2>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">{t('companyName')}</p>
            {editing ? (
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="mt-1 px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
              />
            ) : (
              <p className="font-medium text-slate-900">{organization.name}</p>
            )}
          </div>
          {!editing && (
            <button onClick={() => setEditing(true)} className="p-2 text-slate-400 hover:text-slate-600 touch-target">
              <Pencil size={16} />
            </button>
          )}
        </div>

        {editing && (
          <div className="flex gap-2">
            <Button variant="primary" size="sm" disabled={saving} onClick={handleSave}>
              {saving ? tCommon('saving') : tCommon('save')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setEditing(false); setCompanyName(organization.name) }}>
              {tCommon('cancel')}
            </Button>
          </div>
        )}

        <InfoRow label={t('type')} value={typeLabel} />
        <InfoRow label={t('plan')} value={t('planFormat', { plan: organization.plan.charAt(0).toUpperCase() + organization.plan.slice(1) })} />
        <InfoRow label={t('branchCount')} value={`${branches.length}`} />
        <InfoRow label={t('created')} value={formatDate(organization.created_at, locale)} />
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-t border-slate-100">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  )
}
