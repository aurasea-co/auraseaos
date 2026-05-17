/**
 * Weekly report — HTML email body. Multi-branch: optional portfolio
 * summary at top (when more than one branch), then a section per branch
 * with key metrics vs target, a 7-day breakdown table, week-over-week
 * comparison, and a recommendation. A PDF version is attached by the
 * sender route.
 */
import { Html, Head, Body, Container, Section, Row, Column, Text, Button, Hr, Link } from '@react-email/components'
import type { BranchReport, PortfolioSummary } from '@/lib/notifications/weeklyReportData'

interface WeeklyReportProps {
  weekRange: string
  lang: 'th' | 'en'
  reports: BranchReport[]
  portfolio?: PortfolioSummary
  dashboardUrl: string
}

const COLORS = {
  text: '#1a1a1a',
  muted: '#9b9b9b',
  border: '#e5e5e5',
  rowBg: '#f7f7f5',
  accent: '#534AB7',
  above: '#1D9E75',
  below: '#A32D2D',
  amber: '#BA7517',
  bg: '#ffffff',
  rowGreen: '#f0faf5',
  rowRed: '#fdf3f3',
} as const

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "IBM Plex Sans Thai", sans-serif'

const UNSUBSCRIBE_URL = 'https://auraseaos.com/settings/notifications?unsubscribe=weekly_report'

function fmtCurrency(n: number | undefined): string {
  if (n == null) return '—'
  return `฿${Math.round(n).toLocaleString()}`
}
function fmtPct(n: number | undefined, dp = 1): string {
  if (n == null) return '—'
  return `${n.toFixed(dp)}%`
}
function fmtInt(n: number | undefined): string {
  if (n == null) return '—'
  return Math.round(n).toLocaleString()
}

function scoreChip(s: BranchReport['weekScore'], lang: 'th' | 'en'): { label: string; color: string } {
  if (lang === 'th') {
    switch (s) {
      case 'on-track': return { label: 'ตามเป้า', color: COLORS.above }
      case 'needs-attention': return { label: 'ต้องดูแล', color: COLORS.amber }
      case 'critical': return { label: 'วิกฤต', color: COLORS.below }
    }
  }
  switch (s) {
    case 'on-track': return { label: 'On Track', color: COLORS.above }
    case 'needs-attention': return { label: 'Needs Attention', color: COLORS.amber }
    case 'critical': return { label: 'Critical', color: COLORS.below }
  }
}

function compareVsTarget(value: number | undefined, target: number | undefined, kind: 'currency' | 'percent'): { text: string; isAbove: boolean } | undefined {
  if (value == null || target == null || target === 0) return undefined
  const gap = value - target
  if (gap === 0) return undefined
  const isAbove = gap > 0
  const sign = isAbove ? '+' : '-'
  if (kind === 'percent') return { text: `${sign}${Math.abs(gap).toFixed(1)}% vs เป้าหมาย`, isAbove }
  return { text: `${sign}฿${Math.round(Math.abs(gap)).toLocaleString()} vs เป้าหมาย`, isAbove }
}

function compareVsPrev(value: number | undefined, prev: number | undefined): { text: string; isAbove: boolean } | undefined {
  if (value == null || prev == null || prev === 0) return undefined
  const gap = value - prev
  if (gap === 0) return undefined
  const pct = (gap / prev) * 100
  const isAbove = gap > 0
  return { text: `${isAbove ? '+' : '-'}${Math.abs(pct).toFixed(0)}% vs สัปดาห์ก่อน`, isAbove }
}

function MetricBlock({ label, value, compare }: { label: string; value: string; compare?: { text: string; isAbove: boolean } }) {
  return (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '14px 16px', backgroundColor: COLORS.bg, minHeight: 78 }}>
      <Text style={{ fontSize: 11, fontWeight: 500, color: COLORS.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', margin: '0 0 6px' }}>
        {label}
      </Text>
      <Text style={{ fontSize: 22, fontWeight: 700, color: COLORS.text, lineHeight: 1.1, margin: '0 0 2px' }}>{value}</Text>
      {compare ? (
        <Text style={{ fontSize: 11, fontWeight: 500, color: compare.isAbove ? COLORS.above : COLORS.below, margin: '4px 0 0' }}>{compare.text}</Text>
      ) : (
        <Text style={{ fontSize: 11, color: COLORS.muted, margin: '4px 0 0' }}>{' '}</Text>
      )}
    </div>
  )
}

function BranchBlock({ report, lang }: { report: BranchReport; lang: 'th' | 'en' }) {
  const isHotel = report.branchType === 'accommodation'
  const score = scoreChip(report.weekScore, lang)

  // Header
  const header = (
    <Row style={{ marginBottom: 16 }}>
      <Column style={{ verticalAlign: 'top' as const }}>
        <Text style={{ fontSize: 18, fontWeight: 700, color: COLORS.text, margin: '0 0 2px' }}>{report.branchName}</Text>
        <Text style={{ fontSize: 12, color: COLORS.muted, margin: 0 }}>{`${report.weekStartLabel} – ${report.weekEndLabel}`}</Text>
      </Column>
      <Column style={{ textAlign: 'right' as const, verticalAlign: 'top' as const, width: 140 }}>
        <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 600, color: '#ffffff', backgroundColor: score.color, padding: '4px 10px', borderRadius: 4 }}>
          {score.label}
        </span>
      </Column>
    </Row>
  )

  // Key metrics
  const m1 = isHotel
    ? { label: lang === 'th' ? 'ADR เฉลี่ย' : 'Avg ADR', value: fmtCurrency(report.current.avgAdr), compare: compareVsTarget(report.current.avgAdr, report.targets.adr, 'currency') }
    : { label: lang === 'th' ? 'Margin (ไม่รวมเงินเดือน)' : 'Margin (excl. salary)', value: report.current.avgMargin != null ? `${Math.round(report.current.avgMargin)}%` : '—', compare: compareVsTarget(report.current.avgMargin, report.targets.margin, 'percent') }
  const m2 = isHotel
    ? { label: lang === 'th' ? 'Occupancy เฉลี่ย' : 'Avg Occupancy', value: fmtPct(report.current.avgOccupancy), compare: compareVsTarget(report.current.avgOccupancy, report.targets.occupancy, 'percent') }
    : { label: lang === 'th' ? 'ลูกค้ารวม' : 'Total Covers', value: report.current.totalCovers != null ? `${fmtInt(report.current.totalCovers)} คน` : '—', compare: undefined }
  const m3 = { label: lang === 'th' ? 'รายได้รวม' : 'Revenue', value: fmtCurrency(report.current.totalRevenue), compare: compareVsPrev(report.current.totalRevenue, report.previous?.totalRevenue) }
  const m4 = isHotel
    ? { label: 'RevPAR', value: fmtCurrency(report.current.avgRevpar), compare: undefined }
    : { label: lang === 'th' ? 'Avg Spend' : 'Avg Spend', value: fmtCurrency(report.current.avgSpend), compare: undefined }

  return (
    <Section style={{ marginBottom: 16 }}>
      {header}

      <Row style={{ marginBottom: 8 }}>
        <Column style={{ width: '50%', paddingRight: 4, verticalAlign: 'top' as const }}><MetricBlock {...m1} /></Column>
        <Column style={{ width: '50%', paddingLeft: 4, verticalAlign: 'top' as const }}><MetricBlock {...m2} /></Column>
      </Row>
      <Row style={{ marginBottom: 16 }}>
        <Column style={{ width: '50%', paddingRight: 4, verticalAlign: 'top' as const }}><MetricBlock {...m3} /></Column>
        <Column style={{ width: '50%', paddingLeft: 4, verticalAlign: 'top' as const }}><MetricBlock {...m4} /></Column>
      </Row>

      {/* 7-day breakdown table */}
      <Text style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', margin: '0 0 6px' }}>
        {lang === 'th' ? 'รายละเอียดรายวัน' : '7-day breakdown'}
      </Text>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, border: `1px solid ${COLORS.border}`, borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
        <thead>
          <tr style={{ backgroundColor: COLORS.rowBg }}>
            <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: COLORS.muted, fontSize: 10 }}>{lang === 'th' ? 'วันที่' : 'Date'}</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, color: COLORS.muted, fontSize: 10 }}>{lang === 'th' ? 'รายได้' : 'Revenue'}</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, color: COLORS.muted, fontSize: 10 }}>{isHotel ? 'ADR' : 'Margin'}</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, color: COLORS.muted, fontSize: 10 }}>{isHotel ? 'Occ' : (lang === 'th' ? 'ลูกค้า' : 'Covers')}</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, color: COLORS.muted, fontSize: 10 }}>{lang === 'th' ? 'สถานะ' : 'Status'}</th>
          </tr>
        </thead>
        <tbody>
          {report.daily.map((d) => {
            const isMarginEstimate = !isHotel && d.margin == null && d.marginFallback != null
            const marginCell = isHotel
              ? (d.adr != null ? Math.round(d.adr).toLocaleString() : '—')
              : (d.margin != null
                  ? `${Math.round(d.margin)}%`
                  : d.marginFallback != null
                    ? `${Math.round(d.marginFallback)}%`
                    : '—')
            return (
              <tr key={d.date} style={{ backgroundColor: d.onTarget ? COLORS.rowGreen : COLORS.rowRed }}>
                <td style={{ textAlign: 'left', padding: '6px 8px' }}>{d.date}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>{d.revenue != null ? Math.round(d.revenue).toLocaleString() : '—'}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px', color: isMarginEstimate ? COLORS.muted : undefined }}>{marginCell}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>{isHotel ? (d.occupancy != null ? `${d.occupancy.toFixed(1)}%` : '—') : (d.customers != null ? `${d.customers} คน` : '—')}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px', color: d.onTarget ? COLORS.above : COLORS.below, fontWeight: 700 }}>{d.onTarget ? '✓' : '✗'}</td>
              </tr>
            )
          })}
          <tr style={{ backgroundColor: COLORS.rowBg, fontWeight: 700 }}>
            <td style={{ textAlign: 'left', padding: '6px 8px' }}>{lang === 'th' ? 'รวม/เฉลี่ย' : 'Total / Avg'}</td>
            <td style={{ textAlign: 'right', padding: '6px 8px' }}>{Math.round(report.current.totalRevenue).toLocaleString()}</td>
            <td style={{ textAlign: 'right', padding: '6px 8px' }}>
              {isHotel
                ? (report.current.avgAdr != null ? Math.round(report.current.avgAdr).toLocaleString() : '—')
                : (report.current.avgMargin != null ? `${Math.round(report.current.avgMargin)}%` : '—')}
            </td>
            <td style={{ textAlign: 'right', padding: '6px 8px' }}>
              {isHotel
                ? (report.current.avgOccupancy != null ? `${report.current.avgOccupancy.toFixed(1)}%` : '—')
                : (report.current.totalCovers != null ? `${report.current.totalCovers.toLocaleString()} คน` : '—')}
            </td>
            <td style={{ textAlign: 'right', padding: '6px 8px' }}> </td>
          </tr>
        </tbody>
      </table>

      {!isHotel && report.daily.some((d) => d.margin == null && d.marginFallback != null) && (
        <Text style={{ fontSize: 11, color: COLORS.muted, margin: '-8px 0 16px', lineHeight: 1.5 }}>
          หมายเหตุ: ตัวเลข Margin ที่แสดงในสีเทาคือค่าเฉลี่ย 30 วัน (ไม่มีข้อมูลต้นทุนวันนั้น)
        </Text>
      )}

      {/* Recommendation */}
      <Section style={{ borderLeft: `3px solid ${COLORS.accent}`, backgroundColor: COLORS.rowBg, padding: '12px 14px', borderRadius: '0 6px 6px 0' }}>
        <Text style={{ fontSize: 13, lineHeight: 1.55, color: COLORS.text, fontStyle: 'italic', margin: 0 }}>{report.recommendation}</Text>
      </Section>
    </Section>
  )
}

export default function WeeklyReport({ weekRange, lang, reports, portfolio, dashboardUrl }: WeeklyReportProps) {
  const headerLabel = lang === 'th' ? 'รายงานรายสัปดาห์' : 'Weekly Report'
  const ctaLabel = lang === 'th' ? 'ดูรายละเอียดใน Dashboard' : 'Open dashboard'
  const unsubscribeLabel = lang === 'th' ? 'ยกเลิกการแจ้งเตือน' : 'Unsubscribe'

  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: COLORS.bg, fontFamily: FONT_STACK, margin: 0, padding: 0, color: COLORS.text }}>
        <Container style={{ maxWidth: 600, margin: '0 auto', padding: '32px 24px' }}>
          <Text style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, letterSpacing: '-0.01em', margin: '0 0 28px' }}>aurasea</Text>

          <Text style={{ fontSize: 26, fontWeight: 700, color: COLORS.text, letterSpacing: '-0.02em', lineHeight: 1.2, margin: '0 0 4px' }}>{headerLabel}</Text>
          <Text style={{ fontSize: 14, color: COLORS.muted, margin: '0 0 24px' }}>{weekRange}</Text>

          {portfolio && (
            <Section style={{ backgroundColor: COLORS.rowBg, padding: '14px 16px', borderRadius: 8, marginBottom: 24 }}>
              <Text style={{ fontSize: 11, fontWeight: 600, color: COLORS.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', margin: '0 0 8px' }}>
                {lang === 'th' ? 'ภาพรวมพอร์ตโฟลิโอ' : 'Portfolio summary'}
              </Text>
              <Text style={{ fontSize: 14, color: COLORS.text, margin: '0 0 4px' }}>
                <strong>{lang === 'th' ? 'รายได้รวม' : 'Total revenue'}:</strong>{' '}
                {fmtCurrency(portfolio.totalRevenueCurrent)}
                {portfolio.revenueChangePct != null && (
                  <span style={{ color: portfolio.revenueChangePct >= 0 ? COLORS.above : COLORS.below, marginLeft: 6 }}>
                    {portfolio.revenueChangePct > 0 ? '+' : ''}{portfolio.revenueChangePct.toFixed(0)}%{' '}{lang === 'th' ? 'เทียบสัปดาห์ก่อน' : 'vs prev week'}
                  </span>
                )}
              </Text>
              {portfolio.bestBranchName && (
                <Text style={{ fontSize: 13, color: COLORS.text, margin: 0 }}>
                  <strong>{lang === 'th' ? 'สาขาที่ทำผลงานดีที่สุด' : 'Best performer'}:</strong>{' '}
                  {portfolio.bestBranchName} — {portfolio.bestBranchReason}
                </Text>
              )}
            </Section>
          )}

          {reports.map((r, i) => (
            <div key={r.branchId}>
              {i > 0 && <Hr style={{ borderTop: `1px solid ${COLORS.border}`, margin: '12px 0 20px' }} />}
              <BranchBlock report={r} lang={lang} />
            </div>
          ))}

          <Section style={{ textAlign: 'center' as const, marginTop: 16, marginBottom: 32 }}>
            <Button
              href={dashboardUrl}
              style={{ backgroundColor: COLORS.accent, color: '#ffffff', fontSize: 14, fontWeight: 600, padding: '12px 28px', borderRadius: 8, textDecoration: 'none', display: 'inline-block' }}
            >
              {ctaLabel}
            </Button>
          </Section>

          <Text style={{ fontSize: 11, color: COLORS.muted, textAlign: 'center' as const, margin: 0 }}>
            {'Aurasea OS · '}
            <Link href={UNSUBSCRIBE_URL} style={{ color: '#999999', fontSize: 11, textDecoration: 'underline' }}>
              {unsubscribeLabel}
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
