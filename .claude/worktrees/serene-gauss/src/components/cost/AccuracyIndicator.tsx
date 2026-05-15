'use client'

import { useTranslations } from 'next-intl'

interface Props {
  daysWithCost: number
  totalDays: number
}

export function AccuracyIndicator({ daysWithCost, totalDays }: Props) {
  const t = useTranslations('cost')

  const entryRate = totalDays > 0 ? daysWithCost / totalDays : 0
  let accuracy: number
  if (entryRate >= 0.9) accuracy = 90
  else if (entryRate >= 0.7) accuracy = Math.round(entryRate * 85)
  else if (entryRate >= 0.4) accuracy = Math.round(entryRate * 70)
  else accuracy = Math.round(entryRate * 50)

  let note: string
  if (accuracy < 50) note = 'กรอกต้นทุนทุกวันเพื่อให้การประมาณแม่นยำขึ้น'
  else if (accuracy < 80) note = 'ดีมาก — เป้าหมายคือ 90%+ หลัง 90 วัน'
  else note = 'ยอดเยี่ยม — Aurasea ประมาณต้นทุนได้แม่นยำสูง'

  return (
    <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
      {/* Progress bar */}
      <div style={{ width: '100%', height: 8, borderRadius: 4, background: 'var(--color-bg-surface)', overflow: 'hidden' }}>
        <div style={{ width: `${accuracy}%`, height: '100%', borderRadius: 4, background: 'var(--color-green)', transition: 'width 0.3s' }} />
      </div>

      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 6 }}>
        {t('accuracy_label')} {accuracy}% — กรอกข้อมูลครบ {daysWithCost}/{totalDays} วัน
      </p>
      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
        {note}
      </p>
    </div>
  )
}
