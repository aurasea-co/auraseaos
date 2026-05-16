import { Html, Head, Body, Container, Section, Row, Column, Text, Button, Hr, Link } from '@react-email/components'

export interface MorningFlashBranchData {
  branchName: string
  businessDate: string
  branchType: 'accommodation' | 'fnb'
  adr?: number
  adrTarget?: number
  occupancy?: number
  occupancyTarget?: number
  revenue?: number
  roomsAvailable?: number
  margin?: number
  /** 30-day rolling avg margin (F&B). Preferred over `margin` for display. */
  marginAvg?: number
  marginTarget?: number
  covers?: number
  coversTarget?: number
  sales?: number
  avgSpend?: number
  recommendationText: string
}

const UNSUBSCRIBE_URL = 'https://auraseaos.com/settings/notifications?unsubscribe=morning_flash'

interface MorningFlashProps {
  /** Email-level date (used in the header subtitle and when only one branch
   *  is rendered). Branch-level `businessDate` still shows on each section. */
  date: string
  lang: 'th' | 'en'
  /** Branches in any order; the template sorts accommodation first, F&B second. */
  branches: MorningFlashBranchData[]
  /** Sum of branch revenues. Rendered as a portfolio summary line when
   *  more than one branch is present. */
  totalRevenue: number
  /** Optional override for the header label. Defaults to a portfolio
   *  summary string (Thai/English depending on `lang`). Used by other
   *  callers (e.g. closing-summary) to reuse this template with a
   *  different subtitle. */
  headerLabel?: string
  entryUrl: string
  plan?: 'starter' | 'growth' | 'pro'
}

const COLORS = {
  text: '#1a1a1a',
  muted: '#9b9b9b',
  border: '#e5e5e5',
  divider: '#ececec',
  cardBg: '#ffffff',
  rowBg: '#f7f7f5',
  accent: '#534AB7',
  above: '#1D9E75',
  below: '#A32D2D',
  bg: '#ffffff',
} as const

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "IBM Plex Sans Thai", sans-serif'

export default function MorningFlash(props: MorningFlashProps) {
  const { date, lang, totalRevenue, entryUrl } = props

  const sorted = [
    ...props.branches.filter((b) => b.branchType === 'accommodation'),
    ...props.branches.filter((b) => b.branchType === 'fnb'),
  ]

  const headerLabel =
    props.headerLabel ?? (lang === 'th' ? 'ภาพรวมทุกสาขา' : 'All branches')
  const ctaLabel = lang === 'th' ? 'กรอกข้อมูลวันนี้' : "Enter today's data"
  const unsubscribeLabel = lang === 'th' ? 'ยกเลิกการแจ้งเตือน' : 'Unsubscribe'
  const totalRevenueLabel = lang === 'th' ? 'รายได้รวม' : 'Total revenue'

  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: COLORS.bg, fontFamily: FONT_STACK, margin: 0, padding: 0, color: COLORS.text }}>
        <Container style={{ maxWidth: 600, margin: '0 auto', padding: '32px 24px' }}>
          {/* Logo */}
          <Text style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, letterSpacing: '-0.01em', margin: '0 0 28px' }}>aurasea</Text>

          {/* Header */}
          <Text style={{ fontSize: 26, fontWeight: 700, color: COLORS.text, letterSpacing: '-0.02em', lineHeight: 1.2, margin: '0 0 4px' }}>{headerLabel}</Text>
          <Text style={{ fontSize: 14, color: COLORS.muted, margin: '0 0 16px' }}>{date}</Text>

          {/* Portfolio summary — only when multiple branches */}
          {sorted.length > 1 && (
            <Section style={{ backgroundColor: COLORS.rowBg, padding: '12px 16px', borderRadius: 6, marginBottom: 24 }}>
              <Row>
                <Column style={{ verticalAlign: 'middle' as const }}>
                  <Text style={{ fontSize: 11, fontWeight: 500, color: COLORS.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', margin: 0 }}>
                    {totalRevenueLabel}
                  </Text>
                </Column>
                <Column style={{ textAlign: 'right' as const, verticalAlign: 'middle' as const }}>
                  <Text style={{ fontSize: 18, fontWeight: 700, color: COLORS.text, margin: 0 }}>
                    ฿{Math.round(totalRevenue).toLocaleString()}
                  </Text>
                </Column>
              </Row>
            </Section>
          )}

          {/* Branch sections */}
          {sorted.map((branch, idx) => (
            <Section key={`${branch.branchName}-${idx}`} style={{ marginBottom: idx === sorted.length - 1 ? 24 : 16 }}>
              {idx > 0 && <Hr style={{ borderTop: `1px solid ${COLORS.divider}`, margin: '0 0 20px' }} />}
              <BranchBlock branch={branch} lang={lang} />
            </Section>
          ))}

          {/* CTA */}
          <Section style={{ textAlign: 'center' as const, marginBottom: 32 }}>
            <Button
              href={entryUrl}
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

          {/* Footer — unsubscribe link is the only interactive bit here. */}
          <Text style={{ fontSize: 11, color: COLORS.muted, textAlign: 'center' as const, margin: 0 }}>
            {'Aurasea OS · '}
            <Link
              href={UNSUBSCRIBE_URL}
              style={{ color: '#999999', fontSize: 11, textDecoration: 'underline' }}
            >
              {unsubscribeLabel}
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

function BranchBlock({ branch, lang }: { branch: MorningFlashBranchData; lang: 'th' | 'en' }) {
  const isHotel = branch.branchType === 'accommodation'

  const cards: MetricCardData[] = isHotel
    ? [
        currencyCardThai('ADR', branch.adr, branch.adrTarget, '฿'),
        percentCardThai('Occupancy', branch.occupancy, branch.occupancyTarget, 1),
        currencyCard(lang === 'th' ? 'รายได้' : 'Revenue', branch.revenue, undefined, '฿'),
        plainCard(
          lang === 'th' ? 'ห้องว่าง' : 'Available Rooms',
          `${branch.roomsAvailable ?? 0}`,
          lang === 'th' ? 'ห้อง' : 'rooms',
        ),
      ]
    : [
        // F&B Margin card:
        //   - primary value = 30-day gross margin avg (periodAvgMargin), int %
        //   - target compare uses the same 30-day value vs marginTarget
        //   - subtext shows the latest day's gross margin as muted text
        fnbMarginCard(branch.marginAvg, branch.margin, branch.marginTarget),
        countCard('Covers', branch.covers, branch.coversTarget),
        currencyCard(lang === 'th' ? 'ยอดขาย' : 'Sales', branch.sales, undefined, '฿'),
        currencyCard('Avg Spend', branch.avgSpend, undefined, '฿', lang === 'th' ? '/คน' : '/cover'),
      ]

  return (
    <>
      <Text style={{ fontSize: 18, fontWeight: 700, color: COLORS.text, letterSpacing: '-0.01em', margin: '0 0 2px' }}>
        {branch.branchName}
      </Text>
      <Text style={{ fontSize: 12, color: COLORS.muted, margin: '0 0 16px' }}>{branch.businessDate}</Text>

      <Row style={{ marginBottom: 8 }}>
        <Column style={{ width: '50%', paddingRight: 4, verticalAlign: 'top' as const }}>
          <MetricCard data={cards[0]} />
        </Column>
        <Column style={{ width: '50%', paddingLeft: 4, verticalAlign: 'top' as const }}>
          <MetricCard data={cards[1]} />
        </Column>
      </Row>
      <Row style={{ marginBottom: 16 }}>
        <Column style={{ width: '50%', paddingRight: 4, verticalAlign: 'top' as const }}>
          <MetricCard data={cards[2]} />
        </Column>
        <Column style={{ width: '50%', paddingLeft: 4, verticalAlign: 'top' as const }}>
          <MetricCard data={cards[3]} />
        </Column>
      </Row>

      <Section
        style={{
          borderLeft: `3px solid ${COLORS.accent}`,
          backgroundColor: COLORS.rowBg,
          padding: '12px 14px',
          borderRadius: '0 6px 6px 0',
        }}
      >
        <Text style={{ fontSize: 13, lineHeight: 1.55, color: COLORS.text, fontStyle: 'italic', margin: 0 }}>
          {branch.recommendationText}
        </Text>
      </Section>
    </>
  )
}

interface MetricCardData {
  label: string
  value: string
  compare?: { text: string; isAbove: boolean }
  /** Small muted line shown below the compare line. Used by the F&B Margin
   *  card to surface the latest day's value alongside the 30-day average. */
  subtext?: string
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
      {data.subtext && (
        <Text style={{ fontSize: 11, color: COLORS.muted, margin: '2px 0 0' }}>
          {data.subtext}
        </Text>
      )}
    </div>
  )
}

// --- card builders -------------------------------------------------------

function fmtNumber(value: number): string {
  return Math.round(value).toLocaleString()
}

function currencyCard(label: string, value: number | undefined, target: number | undefined, prefix: string, suffix = ''): MetricCardData {
  const display = `${prefix}${fmtNumber(value ?? 0)}${suffix}`
  if (target == null || target === 0 || value == null) return { label, value: display }
  const gap = value - target
  if (gap === 0) return { label, value: display }
  const isAbove = gap > 0
  return {
    label,
    value: display,
    compare: { text: `${isAbove ? '+' : '-'}${prefix}${fmtNumber(Math.abs(gap))}`, isAbove },
  }
}

/**
 * Hotel-style currency card: comparison line reads "เกินเป้า ฿X" /
 * "ต่ำกว่าเป้า ฿X" rather than "+฿X" / "-฿X", matching the LINE message
 * phrasing. Used for ADR.
 */
function currencyCardThai(label: string, value: number | undefined, target: number | undefined, prefix: string): MetricCardData {
  const display = `${prefix}${fmtNumber(value ?? 0)}`
  if (target == null || target === 0 || value == null) return { label, value: display }
  const gap = value - target
  if (gap === 0) return { label, value: display }
  const isAbove = gap > 0
  const wording = isAbove ? 'เกินเป้า' : 'ต่ำกว่าเป้า'
  return {
    label,
    value: display,
    compare: { text: `${wording} ${prefix}${fmtNumber(Math.abs(gap))}`, isAbove },
  }
}

/**
 * Hotel-style percent card: comparison line reads "เกินเป้า X%" /
 * "ต่ำกว่าเป้า X%". Used for Occupancy.
 */
function percentCardThai(label: string, value: number | undefined, target: number | undefined, decimals = 1): MetricCardData {
  const fmt = (n: number) => (decimals > 0 ? n.toFixed(decimals) : `${Math.round(n)}`)
  const display = `${fmt(value ?? 0)}%`
  if (target == null || target === 0 || value == null) return { label, value: display }
  const gap = value - target
  if (gap === 0) return { label, value: display }
  const isAbove = gap > 0
  const wording = isAbove ? 'เกินเป้า' : 'ต่ำกว่าเป้า'
  return {
    label,
    value: display,
    compare: { text: `${wording} ${fmt(Math.abs(gap))}%`, isAbove },
  }
}

function countCard(label: string, value: number | undefined, target: number | undefined): MetricCardData {
  const display = `${value ?? 0}`
  if (target == null || target === 0 || value == null) return { label, value: display }
  const gap = value - target
  if (gap === 0) return { label, value: display }
  const isAbove = gap > 0
  return {
    label,
    value: display,
    compare: { text: `${isAbove ? '+' : '-'}${Math.abs(gap)}`, isAbove },
  }
}

function plainCard(label: string, value: string, suffix: string): MetricCardData {
  return { label, value: `${value} ${suffix}`.trim() }
}

/**
 * F&B Margin card. Primary value is the 30-day rolling avg gross margin
 * (`marginAvg` — periodAvgMargin from marginAggregates), rendered as an
 * integer percent to match the LINE message and dashboard. vs-target
 * comparison is computed against the same 30-day value. The latest day's
 * margin appears as a muted subtext line ("วันล่าสุด X%") so the reader
 * can spot a one-day swing without losing the rolling-avg headline.
 */
function fnbMarginCard(marginAvg: number | undefined, latest: number | undefined, target: number | undefined): MetricCardData {
  const primary = marginAvg ?? latest
  const value = `${Math.round(primary ?? 0)}%`

  let compare: MetricCardData['compare']
  if (marginAvg != null && target != null && target !== 0) {
    const gap = marginAvg - target
    if (gap !== 0) {
      const isAbove = gap > 0
      compare = { text: `${isAbove ? '+' : '-'}${Math.round(Math.abs(gap))}%`, isAbove }
    }
  }

  // Only show the latest-day subtext when it differs from the rolling avg
  // (otherwise the line is just noise).
  const subtext =
    marginAvg != null && latest != null && Math.round(latest) !== Math.round(marginAvg)
      ? `วันล่าสุด ${Math.round(latest)}%`
      : undefined

  return { label: 'Margin', value, compare, subtext }
}
