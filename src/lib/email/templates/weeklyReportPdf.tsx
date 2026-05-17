/**
 * PDF version of the weekly report (attached to the email).
 *
 * Thai font: Sarabun is registered from Google's CDN once at module load
 * so the PDF can render Thai text correctly. If the remote fetch fails
 * at render time, the renderToBuffer call in the route is wrapped in a
 * try/catch — the email still ships without the attachment.
 */
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import type { BranchReport, PortfolioSummary } from '@/lib/notifications/weeklyReportData'

// Register Sarabun (Thai-capable sans-serif). URLs point at Google's
// gstatic CDN — stable enough for weekly batch use. Pinned weight files
// avoid the CSS subset negotiation @react-pdf doesn't perform.
Font.register({
  family: 'Sarabun',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/sarabun/v15/DtVjJx26TKEr37c9YN5jugmJaP5acQ.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/sarabun/v15/DtVnJx26TKEr37c9aBBxnu0iWBgVbe5dKQM.ttf', fontWeight: 700 },
  ],
})

const COLORS = {
  text: '#1a1a1a',
  muted: '#9b9b9b',
  border: '#e5e5e5',
  rowBg: '#f7f7f5',
  accent: '#534AB7',
  above: '#1D9E75',
  below: '#A32D2D',
  amber: '#BA7517',
  rowGreen: '#f0faf5',
  rowRed: '#fdf3f3',
} as const

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: COLORS.text, fontFamily: 'Sarabun' },
  brand: { fontSize: 11, fontWeight: 700, marginBottom: 4 },
  brandSub: { fontSize: 9, color: COLORS.muted, marginBottom: 16 },
  branchHeader: { marginBottom: 12 },
  branchName: { fontSize: 18, fontWeight: 700, marginBottom: 2 },
  weekRange: { fontSize: 10, color: COLORS.muted },
  scoreChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, fontSize: 9, fontWeight: 700 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6, marginTop: 14 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  metricCard: { width: '48%', borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, padding: 8, marginBottom: 6 },
  metricLabel: { fontSize: 8, color: COLORS.muted, marginBottom: 3 },
  metricValue: { fontSize: 14, fontWeight: 700, marginBottom: 2 },
  metricCompare: { fontSize: 8 },
  table: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, marginBottom: 8 },
  th: { fontSize: 8, fontWeight: 700, color: COLORS.muted },
  td: { fontSize: 9 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: 5, paddingHorizontal: 8 },
  trFooter: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, backgroundColor: COLORS.rowBg },
  cellDate: { flex: 1.4 },
  cellNum: { flex: 1, textAlign: 'right' as const },
  cellStatus: { flex: 0.6, textAlign: 'right' as const },
  recommendation: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    backgroundColor: COLORS.rowBg,
    padding: 10,
    marginTop: 8,
    fontSize: 10,
    fontStyle: 'italic',
  },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 18 },
  portfolioCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 12,
    marginBottom: 16,
    backgroundColor: COLORS.rowBg,
  },
  portfolioTitle: { fontSize: 10, fontWeight: 700, color: COLORS.muted, marginBottom: 6 },
  portfolioLine: { fontSize: 11, marginBottom: 3 },
  footer: { position: 'absolute', bottom: 24, left: 36, right: 36, fontSize: 8, color: COLORS.muted, textAlign: 'center' as const },
})

function fmtCurrency(n: number | undefined): string {
  if (n == null) return '—'
  return `฿${Math.round(n).toLocaleString()}`
}
function fmtPct(n: number | undefined, dp = 1): string {
  if (n == null) return '—'
  return `${n.toFixed(dp)}%`
}
function fmtCount(n: number | undefined): string {
  if (n == null) return '—'
  return Math.round(n).toLocaleString()
}

function scoreLabel(s: BranchReport['weekScore']): { label: string; color: string } {
  switch (s) {
    case 'on-track': return { label: 'ตามเป้า', color: COLORS.above }
    case 'needs-attention': return { label: 'ต้องดูแล', color: COLORS.amber }
    case 'critical': return { label: 'วิกฤต', color: COLORS.below }
  }
}

function MetricCard({ label, value, compare, isAbove }: { label: string; value: string; compare?: string; isAbove?: boolean }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {compare ? (
        <Text style={[styles.metricCompare, { color: isAbove ? COLORS.above : COLORS.below }]}>{compare}</Text>
      ) : (
        <Text style={[styles.metricCompare, { color: COLORS.muted }]}> </Text>
      )}
    </View>
  )
}

function compareVsTarget(value: number | undefined, target: number | undefined, isPct: boolean): { text: string; isAbove: boolean } | undefined {
  if (value == null || target == null || target === 0) return undefined
  const gap = value - target
  if (gap === 0) return undefined
  const isAbove = gap > 0
  if (isPct) {
    return { text: `${isAbove ? '+' : '-'}${Math.abs(gap).toFixed(1)}% vs เป้าหมาย`, isAbove }
  }
  return { text: `${isAbove ? '+' : '-'}฿${Math.round(Math.abs(gap)).toLocaleString()} vs เป้าหมาย`, isAbove }
}

function compareVsPrev(value: number | undefined, prev: number | undefined): { text: string; isAbove: boolean } | undefined {
  if (value == null || prev == null || prev === 0) return undefined
  const gap = value - prev
  if (gap === 0) return undefined
  const pct = (gap / prev) * 100
  const isAbove = gap > 0
  return { text: `${isAbove ? '+' : '-'}${Math.abs(pct).toFixed(0)}% vs สัปดาห์ก่อน`, isAbove }
}

function BranchSection({ report }: { report: BranchReport }) {
  const score = scoreLabel(report.weekScore)
  const isHotel = report.branchType === 'accommodation'

  // Hotel: ADR | Occupancy | Revenue | RevPAR
  // F&B:   Margin | Covers | Revenue | Avg Spend
  type CardSpec = { label: string; value: string; compare?: { text: string; isAbove: boolean } }
  const cards: CardSpec[] = isHotel
    ? [
        {
          label: 'ADR เฉลี่ย',
          value: fmtCurrency(report.current.avgAdr),
          compare: compareVsTarget(report.current.avgAdr, report.targets.adr, false),
        },
        {
          label: 'Occupancy เฉลี่ย',
          value: fmtPct(report.current.avgOccupancy),
          compare: compareVsTarget(report.current.avgOccupancy, report.targets.occupancy, true),
        },
        { label: 'รายได้รวม', value: fmtCurrency(report.current.totalRevenue) },
        { label: 'RevPAR เฉลี่ย', value: fmtCurrency(report.current.avgRevpar) },
      ]
    : [
        {
          label: 'Margin (ไม่รวมเงินเดือน)',
          value: report.current.avgMargin != null ? `${Math.round(report.current.avgMargin)}%` : '—',
          compare: compareVsTarget(report.current.avgMargin, report.targets.margin, true),
        },
        {
          label: 'ลูกค้ารวม',
          value: report.current.totalCovers != null ? `${fmtCount(report.current.totalCovers)} คน` : '—',
        },
        { label: 'รายได้รวม', value: fmtCurrency(report.current.totalRevenue) },
        { label: 'Avg Spend/คน', value: fmtCurrency(report.current.avgSpend) },
      ]

  return (
    <View wrap={false}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <View style={styles.branchHeader}>
          <Text style={styles.branchName}>{report.branchName}</Text>
          <Text style={styles.weekRange}>{`${report.weekStartLabel} – ${report.weekEndLabel}`}</Text>
        </View>
        <Text style={[styles.scoreChip, { color: '#ffffff', backgroundColor: score.color }]}>{score.label}</Text>
      </View>

      <Text style={styles.sectionTitle}>ตัวชี้วัดหลัก</Text>
      <View style={styles.metricGrid}>
        {cards.map((c, i) => (
          <MetricCard key={i} label={c.label} value={c.value} compare={c.compare?.text} isAbove={c.compare?.isAbove} />
        ))}
      </View>

      <Text style={styles.sectionTitle}>รายละเอียดรายวัน</Text>
      <View style={styles.table}>
        <View style={[styles.tr, { backgroundColor: COLORS.rowBg }]}>
          <Text style={[styles.th, styles.cellDate]}>วันที่</Text>
          <Text style={[styles.th, styles.cellNum]}>รายได้</Text>
          <Text style={[styles.th, styles.cellNum]}>{isHotel ? 'ADR' : 'Margin'}</Text>
          <Text style={[styles.th, styles.cellNum]}>{isHotel ? 'Occ' : 'ลูกค้า'}</Text>
          <Text style={[styles.th, styles.cellStatus]}>สถานะ</Text>
        </View>
        {report.daily.map((d, i) => (
          <View key={i} style={[styles.tr, { backgroundColor: d.onTarget ? COLORS.rowGreen : COLORS.rowRed }]}>
            <Text style={[styles.td, styles.cellDate]}>{d.date}</Text>
            <Text style={[styles.td, styles.cellNum]}>{d.revenue != null ? Math.round(d.revenue).toLocaleString() : '—'}</Text>
            <Text style={[styles.td, styles.cellNum]}>
              {isHotel
                ? d.adr != null ? Math.round(d.adr).toLocaleString() : '—'
                : d.margin != null ? `${Math.round(d.margin)}%` : '—'}
            </Text>
            <Text style={[styles.td, styles.cellNum]}>
              {isHotel
                ? d.occupancy != null ? `${d.occupancy.toFixed(1)}%` : '—'
                : d.customers != null ? `${d.customers} คน` : '—'}
            </Text>
            <Text style={[styles.td, styles.cellStatus, { color: d.onTarget ? COLORS.above : COLORS.below, fontWeight: 700 }]}>
              {d.onTarget ? '✓' : '✗'}
            </Text>
          </View>
        ))}
        <View style={styles.trFooter}>
          <Text style={[styles.td, styles.cellDate, { fontWeight: 700 }]}>รวม/เฉลี่ย</Text>
          <Text style={[styles.td, styles.cellNum, { fontWeight: 700 }]}>
            {Math.round(report.current.totalRevenue).toLocaleString()}
          </Text>
          <Text style={[styles.td, styles.cellNum, { fontWeight: 700 }]}>
            {isHotel
              ? (report.current.avgAdr != null ? Math.round(report.current.avgAdr).toLocaleString() : '—')
              : (report.current.avgMargin != null ? `${Math.round(report.current.avgMargin)}%` : '—')}
          </Text>
          <Text style={[styles.td, styles.cellNum, { fontWeight: 700 }]}>
            {isHotel
              ? (report.current.avgOccupancy != null ? `${report.current.avgOccupancy.toFixed(1)}%` : '—')
              : (report.current.totalCovers != null ? `${report.current.totalCovers.toLocaleString()} คน` : '—')}
          </Text>
          <Text style={[styles.td, styles.cellStatus]}> </Text>
        </View>
      </View>

      {report.previous && (
        <>
          <Text style={styles.sectionTitle}>เทียบสัปดาห์ก่อน</Text>
          <View style={styles.metricGrid}>
            <MetricCard
              label="รายได้"
              value={fmtCurrency(report.current.totalRevenue)}
              compare={compareVsPrev(report.current.totalRevenue, report.previous.totalRevenue)?.text}
              isAbove={compareVsPrev(report.current.totalRevenue, report.previous.totalRevenue)?.isAbove}
            />
            {isHotel ? (
              <MetricCard
                label="ADR"
                value={fmtCurrency(report.current.avgAdr)}
                compare={compareVsPrev(report.current.avgAdr, report.previous.avgAdr)?.text}
                isAbove={compareVsPrev(report.current.avgAdr, report.previous.avgAdr)?.isAbove}
              />
            ) : (
              <MetricCard
                label="Margin"
                value={report.current.avgMargin != null ? `${Math.round(report.current.avgMargin)}%` : '—'}
                compare={compareVsPrev(report.current.avgMargin, report.previous.avgMargin)?.text}
                isAbove={compareVsPrev(report.current.avgMargin, report.previous.avgMargin)?.isAbove}
              />
            )}
          </View>
        </>
      )}

      <View style={styles.recommendation}>
        <Text>{report.recommendation}</Text>
      </View>
    </View>
  )
}

interface WeeklyReportPdfProps {
  weekRange: string
  reports: BranchReport[]
  portfolio?: PortfolioSummary
}

export default function WeeklyReportPdf({ weekRange, reports, portfolio }: WeeklyReportPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>aurasea — รายงานรายสัปดาห์</Text>
        <Text style={styles.brandSub}>{weekRange}</Text>

        {portfolio && (
          <View style={styles.portfolioCard}>
            <Text style={styles.portfolioTitle}>ภาพรวมพอร์ตโฟลิโอ</Text>
            <Text style={styles.portfolioLine}>
              รายได้รวม: {fmtCurrency(portfolio.totalRevenueCurrent)}
              {portfolio.revenueChangePct != null
                ? `  (${portfolio.revenueChangePct > 0 ? '+' : ''}${portfolio.revenueChangePct.toFixed(0)}% vs สัปดาห์ก่อน)`
                : ''}
            </Text>
            {portfolio.bestBranchName && (
              <Text style={styles.portfolioLine}>
                สาขาที่ทำผลงานดีที่สุด: {portfolio.bestBranchName} — {portfolio.bestBranchReason}
              </Text>
            )}
          </View>
        )}

        {reports.map((r, i) => (
          <View key={r.branchId}>
            {i > 0 && <View style={styles.divider} />}
            <BranchSection report={r} />
          </View>
        ))}

        <Text style={styles.footer} fixed>
          Aurasea OS · สร้างเมื่อ {new Date().toLocaleDateString('th-TH-u-ca-buddhist', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }).replace(/25(\d{2})/, '$1')}
        </Text>
      </Page>
    </Document>
  )
}
