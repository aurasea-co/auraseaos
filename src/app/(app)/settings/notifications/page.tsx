'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useUser } from '@/providers/user-context'
import { createClient } from '@/lib/supabase/client'
import { PlanGate } from '@/components/ui/PlanGate'
import { Button } from '@/components/ui/Button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function NotificationsPage() {
  const { user, organization, role } = useUser()
  const t = useTranslations('settingsNotifications')
  const tCommon = useTranslations('common')
  const supabase = createClient()

  const [emailNotif, setEmailNotif] = useState(true)
  // Line Notify removed — Messaging API in Phase 6
  const [entryReminder, setEntryReminder] = useState(true)
  const [entryReminderTime, setEntryReminderTime] = useState('22:00')
  const [morningFlashTime, setMorningFlashTime] = useState('09:00')
  const [labourAlert, setLabourAlert] = useState(false)
  const [cogsAlert, setCogsAlert] = useState(false)
  const [weeklyReport, setWeeklyReport] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!organization) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    db.from('notification_settings')
      .select('*')
      .eq('user_id', user.id)
      .eq('organization_id', organization.id)
      .maybeSingle()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }: { data: any }) => {
        if (data) {
          setEmailNotif(data.email_notifications ?? true)
          // line_notify_enabled — removed, Messaging API in Phase 6
          setEntryReminder(data.entry_reminder_enabled ?? true)
          setEntryReminderTime(data.entry_reminder_time || '22:00')
          setMorningFlashTime(data.morning_flash_time || '09:00')
          setLabourAlert(data.labour_alert_enabled ?? false)
          setCogsAlert(data.cogs_alert_enabled ?? false)
          setWeeklyReport(data.weekly_report_enabled ?? false)
        }
      })
  }, [user.id, organization, supabase])

  async function handleSave() {
    if (!organization) return
    setSaving(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    await db.from('notification_settings').upsert({
      user_id: user.id,
      organization_id: organization.id,
      email_notifications: emailNotif,
      // line_notify_enabled removed — Phase 6
      entry_reminder_enabled: entryReminder,
      entry_reminder_time: entryReminderTime,
      morning_flash_time: morningFlashTime,
      labour_alert_enabled: labourAlert,
      cogs_alert_enabled: cogsAlert,
      weekly_report_enabled: weeklyReport,
    }, { onConflict: 'user_id,organization_id' })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <Toggle label={t('emailNotifications')} checked={emailNotif} onChange={setEmailNotif} />

        {/* Line Messaging API */}
        <div style={{ padding: '4px 0' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>Line Notifications</span>
              <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 'var(--radius-pill)', background: 'var(--color-green-light)', color: 'var(--color-green-text)' }}>
                ✓ พร้อมใช้งาน
              </span>
            </div>
          </div>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            เพิ่มเพื่อน Line OA &quot;Aurasea&quot; แล้วส่งข้อความเพื่อเชื่อมต่อบัญชี
          </p>
          <a
            href="https://line.me/R/ti/p/@270cokmy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-block', marginTop: 8, fontSize: 12, fontWeight: 500, color: 'var(--color-accent)', textDecoration: 'none' }}
          >
            เพิ่มเพื่อน Line OA →
          </a>
        </div>
        <Toggle label={t('entryReminder')} checked={entryReminder} onChange={setEntryReminder} />
        {entryReminder && (
          <div className="ml-6">
            <label className="block text-xs text-slate-500 mb-1">{t('reminderTime')}</label>
            <input
              type="time"
              value={entryReminderTime}
              onChange={(e) => setEntryReminderTime(e.target.value)}
              className="touch-target"
            />
          </div>
        )}

        {role === 'owner' && (
          <>
            <div className="border-t border-slate-100 pt-4">
              <label className="block text-xs text-slate-500 mb-1">{t('morningFlashTime')}</label>
              <input
                type="time"
                value={morningFlashTime}
                onChange={(e) => setMorningFlashTime(e.target.value)}
                className="touch-target"
              />
            </div>

            <PlanGate requiredPlan="growth" featureName={t('labourAlert')}>
              <Toggle label={t('labourAlert')} checked={labourAlert} onChange={setLabourAlert} />
            </PlanGate>

            <PlanGate requiredPlan="growth" featureName={t('cogsAlert')}>
              <Toggle label={t('cogsAlert')} checked={cogsAlert} onChange={setCogsAlert} />
            </PlanGate>

            <PlanGate requiredPlan="pro" featureName={t('weeklyReport')}>
              <Toggle label={t('weeklyReport')} checked={weeklyReport} onChange={setWeeklyReport} />
            </PlanGate>
          </>
        )}
      </div>

      <Button variant="primary" fullWidth disabled={saving} onClick={handleSave}>
        {saving ? tCommon('saving') : saved ? '✓' : tCommon('save')}
      </Button>
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer touch-target">
      <span className="text-sm text-slate-700 leading-body">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{ background: checked ? 'var(--color-accent)' : 'rgba(0,0,0,0.15)', width: 40, height: 24, borderRadius: 12, position: 'relative', border: 'none', cursor: 'pointer', transition: 'background 0.2s ease' }}
      >
        <span style={{ position: 'absolute', top: 2, left: checked ? 18 : 2, width: 20, height: 20, background: 'white', borderRadius: '50%', boxShadow: '0 1px 2px rgba(0,0,0,0.2)', transition: 'left 0.2s ease' }} />
      </button>
    </label>
  )
}
