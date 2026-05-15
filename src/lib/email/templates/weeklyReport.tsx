import { Html, Head, Body, Container, Section, Row, Column, Text, Button } from '@react-email/components'

interface WeeklyReportProps {
  branchName: string
  weekRange: string
  lang: 'th' | 'en'
  branchType: 'accommodation' | 'fnb'
  daysWithData: number
  totalRevenue: number
  /** Optional metric averages (per-day means across rows with data) */
  avgAdr?: number
  avgOccupancy?: number
  avgMargin?: number
  avgCovers?: number
  avgSpend?: number
  /** Previous-week comparison values, when available. */
  prev?: {
    totalRevenue?: number
    avgAdr?: number
    avgOccupancy?: number
    avgMargin?: number
    avgCovers?: number
    avgSpend?: number
  }
  dashboardUrl: string
}

const COLORS = {
  text: '#1a1a1a',
  muted: '#9b9b9b',
  border: '#e5e5e5',
  cardBg: '#ffffff',
  rowBg: '#f7f7f5',
  accent: '#534AB7',
  above: '#1D9E75',
  below: '#A32D2D',
  bg: '#ffffff',
} as const

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "IBM Plex Sans Thai", sans-serif'

export default function WeeklyReport(props: WeeklyReportProps) {
  const { branchName, weekRange, lang, branchType, daysWithData, totalRevenue, prev, dashboardUrl } = props
  const isHotel = branchType === 'accommodation'

  const cards: MetricCardData[] = isHotel
    ? [
        currencyCard(lang === 'th' ? 'รายได้รวม' : 'Revenue', totalRevenue, prev?.totalRevenue, '฿'),
        currencyCard(lang === 'th' ? 'ADR เฉลี่ย' : 'Avg ADR', props.avgAdr, prev?.avgAdr, '฿'),
        percentCard(lang === 'th' ? 'Occupancy เฉลี่ย' : 'Avg Occupancy', props.avgOccupancy, prev?.avgOccupancy),
        plainCard(lang === 'th' ? 'วันที่มีข้อมูล' : 'Days with data', `${daysWithData}/7`),
      ]
    : [
        currencyCard(lang === 'th' ? 'ยอดขายรวม' : 'Revenue', totalRevenue, prev?.totalRevenue, '฿'),
        percentCard(lang === 'th' ? 'Margin เฉลี่ย' : 'Avg Margin', props.avgMargin, prev?.avgMargin),
        countCard(lang === 'th' ? 'Covers เฉลี่ย/วัน' : 'Avg Covers/day', props.avgCovers, prev?.avgCovers),
        currencyCard(lang === 'th' ? 'Avg Spend' : 'Avg Spend', props.avgSpend, prev?.avgSpend, '฿', lang === 'th' ? '/คน' : '/cover'),
      ]

  const ctaLabel = lang === 'th' ? 'ดูรายละเอียดใน Dashboard' : 'Open dashboard'
  const footerLabel = lang === 'th' ? 'Aurasea OS · ยกเลิกการแจ้งเตือน' : 'Aurasea OS · Unsubscribe'
  const subtitle = lang === 'th' ? `รายงานรายสัปดาห์ · ${weekRange}` : `Weekly report · ${weekRange}`
  const compareNote = prev
    ? (lang === 'th' ? 'เทียบกับสัปดาห์ก่อนหน้า' : 'vs previous week')
    : (lang === 'th' ? 'ยังไม่มีข้อมูลสัปดาห์ก่อนเพื่อเปรียบเทียบ' : 'No prior-week data to compare yet')

  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: COLORS.bg, fontFamily: FONT_STACK, margin: 0, padding: 0, color: COLORS.text }}>
        <Container style={{ maxWidth: 600, margin: '0 auto', padding: '32px 24px' }}>
          {/* Logo */}
          <Text style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, letterSpacing: '-0.01em', margin: '0 0 28px' }}>aurasea</Text>

          {/* Branch + subtitle */}
          <Text style={{ fontSize: 26, fontWeight: 700, color: COLORS.text, letterSpacing: '-0.02em', lineHeight: 1.2, margin: '0 0 4px' }}>{branchName}</Text>
          <Text style={{ fontSize: 14, color: COLORS.muted, margin: '0 0 4px' }}>{subtitle}</Text>
          <Text style={{ fontSize: 11, color: COLORS.muted, margin: '0 0 24px' }}>{compareNote}</Text>

          {/* Metric grid (2 × 2) */}
          <Row style={{ marginBottom: 8 }}>
            <Column style={{ width: '50%', paddingRight: 4, verticalAlign: 'top' as const }}>
              <MetricCard data={cards[0]} />
            </Column>
            <Column style={{ width: '50%', paddingLeft: 4, verticalAlign: 'top' as const }}>
              <MetricCard data={cards[1]} />
            </Column>
          </Row>
          <Row style={{ marginBottom: 28 }}>
            <Column style={{ width: '50%', paddingRight: 4, verticalAlign: 'top' as const }}>
              <MetricCard data={cards[2]} />
            </Column>
            <Column style={{ width: '50%', paddingLeft: 4, verticalAlign: 'top' as const }}>
              <MetricCard data={cards[3]} />
            </Column>
          </Row>

          {/* CTA */}
          <Section style={{ textAlign: 'center' as const, marginBottom: 32 }}>
            <Button
              href={dashboardUrl}
              style={{
                backgroundColor: COLORS.accent,
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 600,
                padding: '12px 28px',
                borderRadius: 8,
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              {ctaLabel}
            </Button>
          </Section>

          {/* Footer */}
          <Text style={{ fontSize: 11, color: COLORS.muted, textAlign: 'center' as const, margin: 0 }}>
            {footerLabel}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

interface MetricCardData {
  label: string
  value: string
  compare?: { text: string; isAbove: boolean }
}

function MetricCard({ data }: { data: MetricCardData }) {
  return (
    <div
      style={{
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: '14px 16px',
        backgroundColor: COLORS.cardBg,
        minHeight: 78,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: COLORS.muted,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.06em',
          margin: '0 0 6px',
        }}
      >
        {data.label}
      </Text>
      <Text style={{ fontSize: 22, fontWeight: 700, color: COLORS.text, lineHeight: 1.1, margin: '0 0 2px' }}>
        {data.value}
      </Text>
      {data.compare ? (
        <Text style={{ fontSize: 11, fontWeight: 500, color: data.compare.isAbove ? COLORS.above : COLORS.below, margin: '4px 0 0' }}>
          {data.compare.text}
        </Text>
      ) : (
        <Text style={{ fontSize: 11, color: COLORS.muted, margin: '4px 0 0' }}>{' '}</Text>
      )}
    </div>
  )
}

// --- card builders (compare vs previous-week value) ----------------------

function fmtNumber(value: number): string {
  return Math.round(value).toLocaleString()
}

function currencyCard(label: string, value: number | undefined, prev: number | undefined, prefix: string, suffix = ''): MetricCardData {
  const display = `${prefix}${fmtNumber(value ?? 0)}${suffix}`
  if (prev == null || prev === 0 || value == null) return { label, value: display }
  const gap = value - prev
  if (gap === 0) return { label, value: display }
  const pct = (gap / prev) * 100
  const isAbove = gap > 0
  return {
    label,
    value: display,
    compare: { text: `${isAbove ? '+' : '-'}${Math.abs(pct).toFixed(0)}% vs prev`, isAbove },
  }
}

function percentCard(label: string, value: number | undefined, prev: number | undefined): MetricCardData {
  const display = `${(value ?? 0).toFixed(1)}%`
  if (prev == null || value == null) return { label, value: display }
  const gap = value - prev
  if (gap === 0) return { label, value: display }
  const isAbove = gap > 0
  return {
    label,
    value: display,
    compare: { text: `${isAbove ? '+' : '-'}${Math.abs(gap).toFixed(1)}pp vs prev`, isAbove },
  }
}

function countCard(label: string, value: number | undefined, prev: number | undefined): MetricCardData {
  const display = `${Math.round(value ?? 0)}`
  if (prev == null || prev === 0 || value == null) return { label, value: display }
  const gap = value - prev
  if (gap === 0) return { label, value: display }
  const pct = (gap / prev) * 100
  const isAbove = gap > 0
  return {
    label,
    value: display,
    compare: { text: `${isAbove ? '+' : '-'}${Math.abs(pct).toFixed(0)}% vs prev`, isAbove },
  }
}

function plainCard(label: string, value: string): MetricCardData {
  return { label, value }
}
