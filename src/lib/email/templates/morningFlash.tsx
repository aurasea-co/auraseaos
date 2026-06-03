import { Html, Head, Body, Container, Section, Row, Column, Text, Button, Hr, Link } from '@react-email/components'

/** Per-room rate row in the email rate sheet. Shape mirrors the LINE
 *  brief's PerRoomTypeRate but trimmed to display-only fields — the
 *  email never touches satang. */
export interface EmailPerRoomRate {
  roomType: string
  currentRateThb: number
  suggestedRateThb: number
  direction: 'increase' | 'hold' | 'decrease'
}

/** "What to do today" insight line. Both Th + En provided so the
 *  template can pick by `lang` at render time. */
export interface EmailDailyAction {
  messageTh: string
  messageEn: string
}

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

  // ── New fields for hotel parity with the LINE brief ───────────────
  /** Per-room rate sheet (accommodation only). When omitted/empty the
   *  rate sheet section is skipped — the template falls back to the
   *  legacy single-line recommendation text below the KPIs. */
  perRoomRates?: EmailPerRoomRate[]
  /** Plain-language "today's action" callout. Rendered as a
   *  highlighted box below the rate sheet. */
  dailyAction?: EmailDailyAction
  /** Render the "Auto Push activates once PMS connected" muted line
   *  beneath the rate sheet — same gate logic as the LINE brief. */
  showAwaitingPmsNote?: boolean
  /** Per-branch CTA target. Accommodation branches get a "ดูใน
   *  RateDesk" button linking here; F&B branches keep without an extra
   *  CTA. */
  dashboardUrl?: string
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
   *  more than one branch is present AND canSeeRevenue is true. */
  totalRevenue: number
  /** Optional override for the header label. Defaults to a portfolio
   *  summary string (Thai/English depending on `lang`). Used by other
   *  callers (e.g. closing-summary) to reuse this template with a
   *  different subtitle. */
  headerLabel?: string
  entryUrl: string
  plan?: 'starter' | 'growth' | 'pro'
  /** When false, revenue figures are hidden (portfolio total card +
   *  per-branch revenue card). Other KPIs (Occupancy, ADR, RevPAR,
   *  Margin, Covers) stay visible. Mirrors canSeeRevenue() from
   *  lib/auth/ratedesk-permissions — owner/superadmin → true; manager/
   *  staff → false. Defaults to true for back-compat with callers that
   *  haven't been updated yet. */
  canSeeRevenue?: boolean
}

const COLORS = {
  text: '#1a1a1a',
  muted: '#9b9b9b',
  subtle: '#6b7280',
  border: '#e5e5e5',
  divider: '#ececec',
  cardBg: '#ffffff',
  rowBg: '#f7f7f5',
  accent: '#534AB7',
  accentLight: '#F8F7FF',
  accentBorder: '#E8E5F7',
  above: '#1D9E75',
  below: '#A32D2D',
  hold: '#6B7280',
  bg: '#ffffff',
  // Header band — matches the LINE bubble's dark inkblot header so the
  // two channels read as one product.
  headerBg: '#1a1a2e',
  headerInk: '#ffffff',
  headerSubtle: '#9CA3AF',
} as const

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "IBM Plex Sans Thai", sans-serif'

export default function MorningFlash(props: MorningFlashProps) {
  const { date, lang, totalRevenue, entryUrl } = props
  // Default true preserves back-compat for callers (tests, other
  // notification jobs) that pre-date the satang/per-room work.
  const canSeeRevenue = props.canSeeRevenue ?? true

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
        <Container style={{ maxWidth: 600, margin: '0 auto', padding: 0 }}>

          {/* Branded header band — mirrors the LINE bubble's dark ink
              header so email + LINE feel like one product. */}
          <Section
            style={{
              backgroundColor: COLORS.headerBg,
              padding: '24px 24px 22px',
              borderRadius: '0 0 8px 8px',
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: 600, color: COLORS.headerSubtle, letterSpacing: '0.08em', textTransform: 'uppercase' as const, margin: '0 0 8px' }}>
              ☀️ aurasea · RateDesk
            </Text>
            <Text style={{ fontSize: 22, fontWeight: 700, color: COLORS.headerInk, letterSpacing: '-0.01em', lineHeight: 1.2, margin: '0 0 4px' }}>
              {headerLabel}
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.headerSubtle, margin: 0 }}>
              {date}
            </Text>
          </Section>

          <Container style={{ padding: '24px 24px 32px' }}>
            {/* Portfolio total revenue — only when canSeeRevenue + multi-branch. */}
            {canSeeRevenue && sorted.length > 1 && (
              <Section style={{ backgroundColor: COLORS.rowBg, padding: '14px 16px', borderRadius: 8, marginBottom: 24 }}>
                <Row>
                  <Column style={{ verticalAlign: 'middle' as const }}>
                    <Text style={{ fontSize: 11, fontWeight: 500, color: COLORS.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', margin: 0 }}>
                      {totalRevenueLabel}
                    </Text>
                  </Column>
                  <Column style={{ textAlign: 'right' as const, verticalAlign: 'middle' as const }}>
                    <Text style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, margin: 0 }}>
                      {`฿${Math.round(totalRevenue).toLocaleString()}`}
                    </Text>
                  </Column>
                </Row>
              </Section>
            )}

            {/* Branch sections */}
            {sorted.map((branch, idx) => (
              <Section key={`${branch.branchName}-${idx}`} style={{ marginBottom: idx === sorted.length - 1 ? 24 : 20 }}>
                {idx > 0 && <Hr style={{ borderTop: `1px solid ${COLORS.divider}`, margin: '0 0 20px' }} />}
                <BranchBlock branch={branch} lang={lang} canSeeRevenue={canSeeRevenue} />
              </Section>
            ))}

            {/* Portfolio CTA — the "enter today's data" prompt that
                originally was the email's primary button. Kept as a
                portfolio-level action; per-accommodation-branch RateDesk
                CTAs are inside each branch block. */}
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

            {/* Footer */}
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
        </Container>
      </Body>
    </Html>
  )
}

function BranchBlock({ branch, lang, canSeeRevenue }: { branch: MorningFlashBranchData; lang: 'th' | 'en'; canSeeRevenue: boolean }) {
  const isHotel = branch.branchType === 'accommodation'

  // Hotel KPI cards — Occupancy / ADR / RevPAR matches the LINE bubble.
  // Revenue moves OUT of the KPI strip (it was the 3rd card in the
  // legacy 4-card grid) — RevPAR takes that slot. Revenue gating is now
  // a non-issue at the KPI level because revenue isn't a KPI card here.
  // We DO still surface per-branch revenue elsewhere when canSeeRevenue
  // is true (legacy fallback for F&B + a portfolio summary above).
  let hotelKpis: MetricCardData[] = []
  if (isHotel) {
    const occPct = branch.occupancy ?? 0
    const adrThb = branch.adr ?? 0
    const revparThb = Math.round(occPct / 100 * adrThb)
    hotelKpis = [
      percentCardThai(lang === 'th' ? 'Occupancy' : 'Occupancy', occPct, branch.occupancyTarget, 0),
      currencyCardThai('ADR', branch.adr, branch.adrTarget, '฿'),
      plainCard('RevPAR', `฿${fmtNumber(revparThb)}`, ''),
    ]
  }

  // F&B KPI cards — unchanged shape (Margin / Covers / Sales / Avg
  // Spend) but with a revenue gate on the "Sales" card so managers
  // don't see ฿ totals.
  const fnbKpis: MetricCardData[] = [
    fnbMarginCard(branch.marginAvg, branch.margin, branch.marginTarget),
    countCard('Covers', branch.covers, branch.coversTarget, lang === 'th' ? 'คน' : ''),
    ...(canSeeRevenue
      ? [currencyCard(lang === 'th' ? 'ยอดขาย' : 'Sales', branch.sales, undefined, '฿')]
      : []),
    currencyCard('Avg Spend', branch.avgSpend, undefined, '฿', lang === 'th' ? '/คน' : '/cover'),
  ]

  return (
    <>
      {/* Branch header */}
      <Text style={{ fontSize: 18, fontWeight: 700, color: COLORS.text, letterSpacing: '-0.01em', margin: '0 0 2px' }}>
        {branch.branchName}
      </Text>
      <Text style={{ fontSize: 12, color: COLORS.muted, margin: '0 0 14px' }}>{branch.businessDate}</Text>

      {/* KPI cards */}
      {isHotel ? (
        <HotelKpiRow cards={hotelKpis} />
      ) : (
        <FnbKpiRows cards={fnbKpis} />
      )}

      {/* Rate sheet (accommodation only) — drop-in twin of the LINE
          brief's "แนะนำราคาวันนี้" block. */}
      {isHotel && branch.perRoomRates && branch.perRoomRates.length > 0 && (
        <RateSheetSection rates={branch.perRoomRates} lang={lang} />
      )}

      {/* Today's action callout — bilingual title, body in the user's
          chosen language. */}
      {isHotel && branch.dailyAction && (
        <DailyActionCallout action={branch.dailyAction} lang={lang} />
      )}

      {/* Auto-Push pending hint */}
      {isHotel && branch.showAwaitingPmsNote && (
        <Text style={{ fontSize: 11, color: COLORS.muted, fontStyle: 'italic' as const, margin: '8px 0 0' }}>
          {lang === 'th'
            ? 'Auto Push จะเริ่มทำงานเมื่อเชื่อมต่อ PMS ที่รองรับ'
            : 'Auto Push will activate once a supported PMS is connected'}
        </Text>
      )}

      {/* Per-branch RateDesk CTA (accommodation only). F&B branches
          keep without a per-branch CTA — they have the portfolio-level
          "Enter today's data" prompt below. */}
      {isHotel && branch.dashboardUrl && (
        <Section style={{ textAlign: 'left' as const, marginTop: 14 }}>
          <Button
            href={branch.dashboardUrl}
            style={{
              backgroundColor: '#ffffff',
              color: COLORS.accent,
              fontSize: 13,
              fontWeight: 600,
              padding: '10px 18px',
              border: `1px solid ${COLORS.accentBorder}`,
              borderRadius: 6,
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            {lang === 'th' ? 'ดูใน RateDesk →' : 'Open RateDesk →'}
          </Button>
        </Section>
      )}

      {/* Legacy recommendation strip — kept as a fallback for:
          (a) hotel branches with no perRoomRates (single-room legacy)
          (b) F&B branches, which never had a rate sheet to begin with */}
      {!(isHotel && branch.perRoomRates && branch.perRoomRates.length > 0) && (
        <Section
          style={{
            borderLeft: `3px solid ${COLORS.accent}`,
            backgroundColor: COLORS.rowBg,
            padding: '12px 14px',
            borderRadius: '0 6px 6px 0',
            marginTop: 14,
          }}
        >
          <Text style={{ fontSize: 13, lineHeight: 1.55, color: COLORS.text, fontStyle: 'italic', margin: 0 }}>
            {branch.recommendationText}
          </Text>
        </Section>
      )}
    </>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────

function HotelKpiRow({ cards }: { cards: MetricCardData[] }) {
  // 3-up grid matching the LINE bubble (Occupancy / ADR / RevPAR).
  // Table-based for email-client compat (Gmail mobile collapses
  // flexbox in some accounts).
  return (
    <Row style={{ marginBottom: 16 }}>
      {cards.map((card, i) => (
        <Column
          key={i}
          style={{
            width: `${100 / cards.length}%`,
            paddingRight: i < cards.length - 1 ? 4 : 0,
            paddingLeft: i > 0 ? 4 : 0,
            verticalAlign: 'top' as const,
          }}
        >
          <MetricCard data={card} />
        </Column>
      ))}
    </Row>
  )
}

function FnbKpiRows({ cards }: { cards: MetricCardData[] }) {
  // F&B keeps a 2x2 grid for back-compat — there are up to 4 cards.
  const rows: MetricCardData[][] = []
  for (let i = 0; i < cards.length; i += 2) {
    rows.push(cards.slice(i, i + 2))
  }
  return (
    <>
      {rows.map((row, rIdx) => (
        <Row key={rIdx} style={{ marginBottom: rIdx === rows.length - 1 ? 16 : 8 }}>
          {row.map((card, cIdx) => (
            <Column
              key={cIdx}
              style={{
                width: '50%',
                paddingRight: cIdx === 0 ? 4 : 0,
                paddingLeft: cIdx === 1 ? 4 : 0,
                verticalAlign: 'top' as const,
              }}
            >
              <MetricCard data={card} />
            </Column>
          ))}
          {row.length === 1 && <Column style={{ width: '50%' }} />}
        </Row>
      ))}
    </>
  )
}

function RateSheetSection({ rates, lang }: { rates: EmailPerRoomRate[]; lang: 'th' | 'en' }) {
  return (
    <Section
      style={{
        backgroundColor: COLORS.accentLight,
        border: `1px solid ${COLORS.accentBorder}`,
        borderRadius: 8,
        padding: '14px 16px',
        marginTop: 16,
        marginBottom: 4,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: 700, color: COLORS.accent, textTransform: 'uppercase' as const, letterSpacing: '0.06em', margin: '0 0 10px' }}>
        {lang === 'th' ? 'ราคาแนะนำวันนี้ · Today\'s recommended rates' : 'Today\'s recommended rates'}
      </Text>
      {rates.map((r, i) => (
        <RateRow key={`${r.roomType}-${i}`} rate={r} lang={lang} isLast={i === rates.length - 1} />
      ))}
    </Section>
  )
}

function RateRow({ rate, lang, isLast }: { rate: EmailPerRoomRate; lang: 'th' | 'en'; isLast: boolean }) {
  const currentStr = `฿${fmtNumber(rate.currentRateThb)}`
  const suggestedStr = `฿${fmtNumber(rate.suggestedRateThb)}`
  let rightText: string
  let rightColor: string
  let arrow = ''
  if (rate.direction === 'hold') {
    rightText = `${currentStr} · ${lang === 'th' ? 'คงเดิม' : 'hold'}`
    rightColor = COLORS.hold
  } else if (rate.direction === 'increase') {
    arrow = '↑'
    rightText = `${currentStr} → ${suggestedStr}`
    rightColor = COLORS.above
  } else {
    arrow = '↓'
    rightText = `${currentStr} → ${suggestedStr}`
    rightColor = COLORS.below
  }
  return (
    <Row style={{ marginBottom: isLast ? 0 : 6 }}>
      <Column style={{ verticalAlign: 'middle' as const, paddingRight: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, margin: 0 }}>
          {rate.roomType}
        </Text>
      </Column>
      <Column style={{ verticalAlign: 'middle' as const, textAlign: 'right' as const }}>
        <Text style={{ fontSize: 13, fontWeight: 600, color: rightColor, margin: 0 }}>
          {arrow && <span style={{ marginRight: 4 }}>{arrow}</span>}
          {rightText}
        </Text>
      </Column>
    </Row>
  )
}

function DailyActionCallout({ action, lang }: { action: EmailDailyAction; lang: 'th' | 'en' }) {
  return (
    <Section
      style={{
        backgroundColor: COLORS.accentLight,
        borderLeft: `3px solid ${COLORS.accent}`,
        borderRadius: '0 6px 6px 0',
        padding: '12px 14px',
        marginTop: 10,
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: 700, color: COLORS.accent, textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 4px' }}>
        {lang === 'th' ? 'วันนี้ควรทำอะไร · Today\'s action' : 'Today\'s action'}
      </Text>
      <Text style={{ fontSize: 13, lineHeight: 1.55, color: COLORS.text, margin: 0 }}>
        {lang === 'th' ? action.messageTh : action.messageEn}
      </Text>
    </Section>
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
        padding: '12px 14px',
        backgroundColor: COLORS.cardBg,
        minHeight: 76,
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: COLORS.muted,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.06em',
          margin: '0 0 6px',
        }}
      >
        {data.label}
      </Text>
      <Text style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, lineHeight: 1.1, margin: '0 0 2px' }}>
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

function countCard(label: string, value: number | undefined, target: number | undefined, unit = ''): MetricCardData {
  const display = unit
    ? `${(value ?? 0).toLocaleString()} ${unit}`
    : `${value ?? 0}`
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

  const subtext =
    marginAvg != null && latest != null && Math.round(latest) !== Math.round(marginAvg)
      ? `วันล่าสุด ${Math.round(latest)}%`
      : undefined

  return { label: 'Margin (ไม่รวมเงินเดือน)', value, compare, subtext }
}
