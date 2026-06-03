import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import MorningFlash, {
  type MorningFlashBranchData,
  type EmailPerRoomRate,
} from './morningFlash'

// Render the template to HTML and return the string so tests can
// grep for content / structure. React Email's `render` is async in
// newer versions; await both shapes.
async function renderHtml(jsx: React.ReactElement): Promise<string> {
  const result = await render(jsx)
  return typeof result === 'string' ? result : String(result)
}

function makeAccomBranch(partial: Partial<MorningFlashBranchData> = {}): MorningFlashBranchData {
  return {
    branchName: 'Crystal Resort',
    businessDate: '2 มิ.ย. 2569',
    branchType: 'accommodation',
    adr: 813,
    adrTarget: 950,
    occupancy: 27,
    occupancyTarget: 70,
    revenue: 7320,
    roomsAvailable: 11,
    recommendationText: 'Legacy fallback recommendation text',
    ...partial,
  }
}

const CRYSTAL_RATES: EmailPerRoomRate[] = [
  { roomType: 'Deluxe2', currentRateThb: 950,  suggestedRateThb: 893,  direction: 'decrease' },
  { roomType: 'Deluxe5', currentRateThb: 790,  suggestedRateThb: 743,  direction: 'decrease' },
  { roomType: 'Deluxe6', currentRateThb: 850,  suggestedRateThb: 799,  direction: 'decrease' },
  { roomType: 'Suite',   currentRateThb: 1200, suggestedRateThb: 1128, direction: 'decrease' },
]

describe('morningFlash email — branded header + parity with LINE', () => {
  it('renders the dark Aurasea/RateDesk header band', async () => {
    const html = await renderHtml(
      <MorningFlash
        date="2 มิ.ย. 2569"
        lang="th"
        branches={[makeAccomBranch()]}
        totalRevenue={7320}
        entryUrl="https://auraseaos.com/entry"
        canSeeRevenue={true}
      />,
    )
    expect(html).toContain('aurasea')
    expect(html).toContain('RateDesk')
    expect(html).toContain('ภาพรวมทุกสาขา')
  })
})

describe('morningFlash email — rate sheet renders for accommodation', () => {
  it('renders 4 rows for Crystal Resort with current → suggested pattern', async () => {
    const html = await renderHtml(
      <MorningFlash
        date="2 มิ.ย. 2569"
        lang="th"
        branches={[makeAccomBranch({ perRoomRates: CRYSTAL_RATES })]}
        totalRevenue={7320}
        entryUrl="https://auraseaos.com/entry"
        canSeeRevenue={true}
      />,
    )
    expect(html).toContain('ราคาแนะนำวันนี้')
    expect(html).toContain('Today')  // bilingual title contains "Today's recommended rates"
    expect(html).toContain('Deluxe2')
    expect(html).toContain('Deluxe5')
    expect(html).toContain('Deluxe6')
    expect(html).toContain('Suite')
    expect(html).toContain('฿950')
    expect(html).toContain('฿893')
    expect(html).toContain('฿1,200')
    expect(html).toContain('฿1,128')
  })

  it('renders hold rows with the คงเดิม marker (no arrow)', async () => {
    const html = await renderHtml(
      <MorningFlash
        date="2 มิ.ย. 2569"
        lang="th"
        branches={[makeAccomBranch({
          perRoomRates: [
            { roomType: 'Standard', currentRateThb: 800, suggestedRateThb: 800, direction: 'hold' },
          ],
        })]}
        totalRevenue={0}
        entryUrl="https://auraseaos.com/entry"
        canSeeRevenue={true}
      />,
    )
    expect(html).toContain('฿800')
    expect(html).toContain('คงเดิม')
    expect(html).not.toContain('฿800 →')
  })

  it('falls back to the legacy recommendation strip when perRoomRates is empty', async () => {
    const html = await renderHtml(
      <MorningFlash
        date="2 มิ.ย. 2569"
        lang="th"
        branches={[makeAccomBranch({
          perRoomRates: [],
          recommendationText: 'LEGACY RECOMMENDATION TEXT',
        })]}
        totalRevenue={0}
        entryUrl="https://auraseaos.com/entry"
        canSeeRevenue={true}
      />,
    )
    expect(html).not.toContain('ราคาแนะนำวันนี้')
    expect(html).toContain('LEGACY RECOMMENDATION TEXT')
  })

  it('renders the rate sheet AND skips the legacy recommendation when both are present', async () => {
    // Tests we don't double-render. The legacy strip is a fallback ONLY.
    const html = await renderHtml(
      <MorningFlash
        date="2 มิ.ย. 2569"
        lang="th"
        branches={[makeAccomBranch({
          perRoomRates: CRYSTAL_RATES,
          recommendationText: 'LEGACY SHOULD NOT APPEAR',
        })]}
        totalRevenue={0}
        entryUrl="https://auraseaos.com/entry"
        canSeeRevenue={true}
      />,
    )
    expect(html).toContain('ราคาแนะนำวันนี้')
    expect(html).not.toContain('LEGACY SHOULD NOT APPEAR')
  })
})

describe('morningFlash email — daily action callout + awaiting-PMS hint', () => {
  it('renders the action callout when dailyAction is provided', async () => {
    const html = await renderHtml(
      <MorningFlash
        date="2 มิ.ย. 2569"
        lang="th"
        branches={[makeAccomBranch({
          perRoomRates: CRYSTAL_RATES,
          dailyAction: {
            messageTh: 'ทุกห้องมีโอกาสจองต่ำ — เปิดโปรโมชั่น last-minute',
            messageEn: 'All rooms showing soft demand — open a last-minute promo',
          },
        })]}
        totalRevenue={0}
        entryUrl="https://auraseaos.com/entry"
        canSeeRevenue={true}
      />,
    )
    expect(html).toContain('วันนี้ควรทำอะไร')
    expect(html).toContain('ทุกห้องมีโอกาสจองต่ำ')
  })

  it('renders the Auto-Push pending note when showAwaitingPmsNote is true', async () => {
    const html = await renderHtml(
      <MorningFlash
        date="2 มิ.ย. 2569"
        lang="th"
        branches={[makeAccomBranch({
          perRoomRates: CRYSTAL_RATES,
          showAwaitingPmsNote: true,
        })]}
        totalRevenue={0}
        entryUrl="https://auraseaos.com/entry"
        canSeeRevenue={true}
      />,
    )
    expect(html).toContain('Auto Push จะเริ่มทำงานเมื่อเชื่อมต่อ PMS')
  })

  it('omits the pending note when showAwaitingPmsNote is false', async () => {
    const html = await renderHtml(
      <MorningFlash
        date="2 มิ.ย. 2569"
        lang="th"
        branches={[makeAccomBranch({
          perRoomRates: CRYSTAL_RATES,
          showAwaitingPmsNote: false,
        })]}
        totalRevenue={0}
        entryUrl="https://auraseaos.com/entry"
        canSeeRevenue={true}
      />,
    )
    expect(html).not.toContain('Auto Push จะเริ่มทำงานเมื่อเชื่อมต่อ PMS')
  })
})

describe('morningFlash email — per-branch RateDesk CTA', () => {
  it('renders "ดูใน RateDesk" button when dashboardUrl is set', async () => {
    const html = await renderHtml(
      <MorningFlash
        date="2 มิ.ย. 2569"
        lang="th"
        branches={[makeAccomBranch({
          perRoomRates: CRYSTAL_RATES,
          dashboardUrl: 'https://example.test/ratedesk',
        })]}
        totalRevenue={0}
        entryUrl="https://auraseaos.com/entry"
        canSeeRevenue={true}
      />,
    )
    expect(html).toContain('ดูใน RateDesk')
    expect(html).toContain('https://example.test/ratedesk')
  })

  it('omits the per-branch RateDesk CTA when dashboardUrl is absent', async () => {
    const html = await renderHtml(
      <MorningFlash
        date="2 มิ.ย. 2569"
        lang="th"
        branches={[makeAccomBranch({ perRoomRates: CRYSTAL_RATES })]}
        totalRevenue={0}
        entryUrl="https://auraseaos.com/entry"
        canSeeRevenue={true}
      />,
    )
    expect(html).not.toContain('ดูใน RateDesk')
  })
})

describe('morningFlash email — canSeeRevenue gating', () => {
  it('shows the portfolio total revenue card when owner + multi-branch', async () => {
    const html = await renderHtml(
      <MorningFlash
        date="2 มิ.ย. 2569"
        lang="th"
        branches={[
          makeAccomBranch({ branchName: 'Crystal Resort', perRoomRates: CRYSTAL_RATES }),
          { ...makeAccomBranch({ branchName: 'Crystal Cafe', branchType: 'fnb' }), perRoomRates: undefined },
        ]}
        totalRevenue={45000}
        entryUrl="https://auraseaos.com/entry"
        canSeeRevenue={true}
      />,
    )
    expect(html).toContain('รายได้รวม')
    expect(html).toContain('฿45,000')
  })

  it('hides the portfolio total revenue card when manager (canSeeRevenue=false)', async () => {
    const html = await renderHtml(
      <MorningFlash
        date="2 มิ.ย. 2569"
        lang="th"
        branches={[
          makeAccomBranch({ branchName: 'Crystal Resort', perRoomRates: CRYSTAL_RATES }),
          { ...makeAccomBranch({ branchName: 'Crystal Cafe', branchType: 'fnb' }), perRoomRates: undefined },
        ]}
        totalRevenue={45000}
        entryUrl="https://auraseaos.com/entry"
        canSeeRevenue={false}
      />,
    )
    expect(html).not.toContain('รายได้รวม')
    expect(html).not.toContain('฿45,000')
  })

  it('hides the F&B Sales KPI card when manager (canSeeRevenue=false)', async () => {
    const html = await renderHtml(
      <MorningFlash
        date="2 มิ.ย. 2569"
        lang="th"
        branches={[{
          branchName: 'Crystal Cafe',
          businessDate: '2 มิ.ย.',
          branchType: 'fnb',
          margin: 62,
          marginAvg: 60,
          marginTarget: 65,
          covers: 38,
          coversTarget: 45,
          sales: 12500,
          avgSpend: 329,
          recommendationText: 'Some recommendation',
        }]}
        totalRevenue={12500}
        entryUrl="https://auraseaos.com/entry"
        canSeeRevenue={false}
      />,
    )
    expect(html).not.toContain('ยอดขาย')
    expect(html).not.toContain('฿12,500')
    // Non-revenue KPIs still render.
    expect(html).toContain('Margin')
    expect(html).toContain('Covers')
    expect(html).toContain('Avg Spend')
  })

  it('renders 3-up hotel KPI strip (Occupancy / ADR / RevPAR) — Revenue NOT in KPI cards', async () => {
    const html = await renderHtml(
      <MorningFlash
        date="2 มิ.ย. 2569"
        lang="th"
        branches={[makeAccomBranch({ occupancy: 27, adr: 813, perRoomRates: CRYSTAL_RATES })]}
        totalRevenue={0}
        entryUrl="https://auraseaos.com/entry"
        canSeeRevenue={true}
      />,
    )
    expect(html).toContain('Occupancy')
    expect(html).toContain('ADR')
    expect(html).toContain('RevPAR')
    // RevPAR = occupancy% × ADR = 0.27 × 813 ≈ ฿220 (rounded). The
    // template renders the rounded RevPAR value as the third card.
    expect(html).toContain('27%')
    expect(html).toContain('฿813')
  })
})

describe('morningFlash email — Crystal Resort end-to-end (the screenshot case)', () => {
  it('renders the full hotel layout — KPIs + rate sheet + action + awaiting + CTA', async () => {
    const html = await renderHtml(
      <MorningFlash
        date="2 มิ.ย. 2569"
        lang="th"
        branches={[makeAccomBranch({
          perRoomRates: CRYSTAL_RATES,
          dailyAction: {
            messageTh: 'ทุกห้องมีโอกาสจองต่ำ — เปิดโปรโมชั่น last-minute หรือเพิ่มช่องทาง OTA',
            messageEn: 'All rooms showing soft demand — open a last-minute promo or add an OTA channel',
          },
          showAwaitingPmsNote: true,
          dashboardUrl: 'https://example.test/ratedesk',
        })]}
        totalRevenue={7320}
        entryUrl="https://auraseaos.com/entry"
        canSeeRevenue={true}
      />,
    )
    // Every section appears, in order.
    expect(html).toContain('Occupancy')
    expect(html).toContain('ราคาแนะนำวันนี้')
    expect(html).toContain('Deluxe2')
    expect(html).toContain('Suite')
    expect(html).toContain('วันนี้ควรทำอะไร')
    expect(html).toContain('ทุกห้องมีโอกาสจองต่ำ')
    expect(html).toContain('Auto Push จะเริ่มทำงานเมื่อเชื่อมต่อ PMS')
    expect(html).toContain('ดูใน RateDesk')
  })
})
