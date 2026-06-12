import { describe, it, expect } from 'vitest'
import { buildMorningFlashLine } from './messaging'
import { buildFnbBriefFlexMessage } from './menudesk-brief'

// Managers (and staff) must never see THB revenue totals — same rule as
// the in-app dashboard, the email brief, and exports (canSeeRevenue()).
// These cover the two LINE surfaces that previously leaked revenue
// regardless of recipient role: the plain-text brief and the F&B Flex
// bubble. The hotel Flex bubble renders Occ/ADR/RevPAR only, so it has
// no revenue line to gate.
//
// "รายได้" is the Thai label for revenue used by both builders.

describe('buildMorningFlashLine revenue gate', () => {
  const hotel = {
    branchName: 'Pullman Korat',
    branchType: 'accommodation' as const,
    date: '12 มิ.ย. 2569',
    adr: 1800,
    occupancy: 72,
    roomsAvailable: 8,
    revenue: 42_000,
    recommendation: 'ทดสอบ',
  }
  const fnb = {
    branchName: 'Café One',
    branchType: 'fnb' as const,
    date: '12 มิ.ย. 2569',
    margin: 30,
    covers: 120,
    sales: 38_500,
    recommendation: 'ทดสอบ',
  }

  it('hides hotel revenue when canSeeRevenue is false', () => {
    expect(buildMorningFlashLine({ ...hotel, canSeeRevenue: false })).not.toContain('รายได้')
  })

  it('hides F&B revenue when canSeeRevenue is false', () => {
    expect(buildMorningFlashLine({ ...fnb, canSeeRevenue: false })).not.toContain('รายได้')
  })

  it('shows revenue for owners (default + explicit true)', () => {
    expect(buildMorningFlashLine(hotel)).toContain('รายได้')
    expect(buildMorningFlashLine({ ...fnb, canSeeRevenue: true })).toContain('รายได้')
  })

  it('keeps the operational KPIs visible to managers', () => {
    const line = buildMorningFlashLine({ ...hotel, canSeeRevenue: false })
    expect(line).toContain('ADR')
    expect(line).toContain('Occ')
  })
})

describe('buildFnbBriefFlexMessage revenue gate', () => {
  const base = {
    branchName: 'Café One',
    yesterday: {
      date: '2026-06-11',
      revenueThb: 38_500,
      totalCovers: 120,
      avgPerCoverThb: 320,
      foodCostPct: 31.5,
    },
    topRecs: [],
  }

  it('drops the revenue box + altText mention when canSeeRevenue is false', () => {
    const flex = buildFnbBriefFlexMessage({ ...base, canSeeRevenue: false })
    expect(flex.altText).not.toContain('รายได้')
    expect(JSON.stringify(flex.contents)).not.toContain('รายได้')
  })

  it('keeps covers, ฿/คน and food cost visible to managers', () => {
    const json = JSON.stringify(buildFnbBriefFlexMessage({ ...base, canSeeRevenue: false }).contents)
    expect(json).toContain('ลูกค้า')
    expect(json).toContain('฿/คน')
    expect(json).toContain('Food cost')
  })

  it('shows revenue for owners (default + explicit true)', () => {
    expect(JSON.stringify(buildFnbBriefFlexMessage(base).contents)).toContain('รายได้')
    expect(buildFnbBriefFlexMessage({ ...base, canSeeRevenue: true }).altText).toContain('รายได้')
  })
})
