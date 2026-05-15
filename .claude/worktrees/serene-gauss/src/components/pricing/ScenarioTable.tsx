'use client'

import { useTranslations } from 'next-intl'
import type { PricingScenario } from '@/lib/calculations/pricing'
import { formatBaht } from '@/lib/formatters'

export function ScenarioTable({ scenarios }: { scenarios: PricingScenario[] }) {
  const t = useTranslations('pricing')

  return (
    <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 16, overflowX: 'auto' }}>
      <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>{t('scenario_table_title')}</p>

      <table style={{ width: '100%', fontSize: 'var(--font-size-sm)', borderCollapse: 'collapse', minWidth: 460 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
            <th style={th}>{t('scenario')}</th>
            <th style={{ ...th, textAlign: 'right' }}>ADR</th>
            <th style={{ ...th, textAlign: 'right' }}>{t('expected_rooms')}</th>
            <th style={{ ...th, textAlign: 'right' }}>{t('expected_revenue')}</th>
            <th style={{ ...th, textAlign: 'right' }}>{t('vs_current')}</th>
          </tr>
        </thead>
        <tbody>
          {scenarios.map((s, i) => {
            const isCurrent = s.label === 'ราคาปัจจุบัน'
            return (
              <tr
                key={i}
                style={{
                  borderBottom: '1px solid var(--color-border)',
                  background: s.isRecommended ? 'var(--color-green-light)' : isCurrent ? 'var(--color-bg-surface)' : 'transparent',
                }}
              >
                <td style={{ ...td, fontWeight: s.isRecommended ? 500 : 400, fontStyle: isCurrent ? 'italic' : 'normal' }}>
                  {s.label}
                  {s.isRecommended && (
                    <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 'var(--radius-pill)', background: 'var(--color-green)', color: 'white' }}>
                      {t('recommended')}
                    </span>
                  )}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>{formatBaht(s.adr)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{s.estimatedRooms}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: s.isRecommended ? 500 : 400, color: s.isRecommended ? 'var(--color-positive)' : undefined }}>{formatBaht(s.estimatedRevenue)}</td>
                <td style={{ ...td, textAlign: 'right', color: s.revenueVsCurrentADR >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}>
                  {s.revenueVsCurrentADR >= 0 ? '+' : ''}{formatBaht(s.revenueVsCurrentADR)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 10 }}>
        ห้องที่คาดว่าขายประมาณจากรูปแบบ demand ของรีสอร์ทนี้ ยิ่งมีข้อมูลมากยิ่งแม่นยำ
      </p>
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', fontWeight: 500, color: 'var(--color-text-tertiary)', fontSize: 11 }
const td: React.CSSProperties = { padding: '8px', color: 'var(--color-text-primary)' }
