'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import { BranchTypeBadge } from '@/components/ui/BranchTypeBadge'
import { getEntryTable } from '@/lib/supabase/entry-tables'
import { ArrowLeft, Download, FileText } from 'lucide-react'
import Link from 'next/link'

export default function ExportPage() {
  const { branches, role } = useUser()
  const t = useTranslations('settingsExport')
  const supabase = createClient()
  const [downloading, setDownloading] = useState<string | null>(null)

  if (role !== 'owner') return null

  async function handleCSV(branchId: string, branchName: string, businessType: string) {
    setDownloading(branchId)
    const table = getEntryTable(businessType)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data } = await db
      .from(table)
      .select('*')
      .eq('branch_id', branchId)
      .order('metric_date', { ascending: true })

    if (!data || data.length === 0) {
      setDownloading(null)
      return
    }

    const headers = Object.keys(data[0])
    const csv = [
      headers.join(','),
      ...data.map((row: Record<string, unknown>) =>
        headers.map((h) => {
          const v = row[h]
          if (v == null) return ''
          if (typeof v === 'string' && v.includes(',')) return `"${v}"`
          return String(v)
        }).join(',')
      ),
    ].join('\n')

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${branchName.replace(/\s+/g, '_')}_daily_metrics.csv`
    a.click()
    URL.revokeObjectURL(url)
    setDownloading(null)
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

      {branches.map((branch) => (
        <div key={branch.id} className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <BranchTypeBadge type={branch.business_type} />
            <span className="font-medium text-slate-900">{branch.name}</span>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => handleCSV(branch.id, branch.name, branch.business_type)}
              disabled={downloading === branch.id}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors touch-target"
            >
              <Download size={16} />
              {downloading === branch.id ? t('downloading') : t('downloadCSV')}
            </button>

            <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-400 border border-slate-200 rounded-lg">
              <FileText size={16} />
              <span>{t('downloadPDF')}</span>
              <span className="ml-auto text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                {t('comingSoon')}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
