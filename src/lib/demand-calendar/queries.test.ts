import { describe, it, expect } from 'vitest'
import {
  filterRowsForBranch,
  demandCalendarDatesInRange,
  type DemandCalendarRawRow,
  type DemandCalendarEvent,
} from './queries'

function makeRow(partial: Partial<DemandCalendarRawRow> = {}): DemandCalendarRawRow {
  return {
    id: 'row-1',
    start_date: '2026-04-13',
    end_date: '2026-04-15',
    type: 'public_holiday',
    name_th: 'สงกรานต์',
    name_en: 'Songkran',
    province: null,
    expected_impact_modifier: '0.30',
    source: 'public_holiday_lib',
    confidence: '1.00',
    organization_id: null,
    branch_id: null,
    ...partial,
  }
}

describe('filterRowsForBranch', () => {
  const CRYSTAL_ORG = 'd45b5faa-d44e-4d3d-bc46-9b444ada147c'
  const CRYSTAL_RESORT = 'ef77c100-e27b-4f69-a930-053750b79f22'
  const CRYSTAL_CAFE = '4dca5378-68a7-4eef-94f0-7572852a7744'
  const OTHER_ORG = '5672e611-b98f-4415-ae66-a24dfd216e98'

  it('includes global rows (organization_id null) regardless of branch', () => {
    const rows = [makeRow({ organization_id: null, branch_id: null })]
    const out = filterRowsForBranch(rows, { organizationId: CRYSTAL_ORG, branchId: CRYSTAL_RESORT })
    expect(out).toHaveLength(1)
  })

  it('includes org-wide rows (branch_id null) for any branch in that org', () => {
    const rows = [makeRow({ organization_id: CRYSTAL_ORG, branch_id: null, type: 'owner_event', name_th: 'ปิดบริษัท' })]
    expect(filterRowsForBranch(rows, { organizationId: CRYSTAL_ORG, branchId: CRYSTAL_RESORT })).toHaveLength(1)
    expect(filterRowsForBranch(rows, { organizationId: CRYSTAL_ORG, branchId: CRYSTAL_CAFE })).toHaveLength(1)
  })

  it('includes branch-specific rows only for the matching branch', () => {
    const rows = [makeRow({ organization_id: CRYSTAL_ORG, branch_id: CRYSTAL_RESORT, type: 'local_event' })]
    expect(filterRowsForBranch(rows, { organizationId: CRYSTAL_ORG, branchId: CRYSTAL_RESORT })).toHaveLength(1)
    // Same org, different branch — must NOT leak Crystal Resort's local
    // event onto Crystal Cafe's calendar.
    expect(filterRowsForBranch(rows, { organizationId: CRYSTAL_ORG, branchId: CRYSTAL_CAFE })).toHaveLength(0)
  })

  it('excludes another org entirely, even if RLS somehow let the row through', () => {
    const rows = [makeRow({ organization_id: OTHER_ORG, branch_id: null })]
    expect(filterRowsForBranch(rows, { organizationId: CRYSTAL_ORG, branchId: CRYSTAL_RESORT })).toHaveLength(0)
  })

  it('maps snake_case columns to camelCase and coerces numeric strings', () => {
    const rows = [makeRow({ expected_impact_modifier: '0.30', confidence: '0.80' })]
    const [event] = filterRowsForBranch(rows, { organizationId: CRYSTAL_ORG, branchId: CRYSTAL_RESORT })
    expect(event).toEqual<DemandCalendarEvent>({
      id: 'row-1',
      startDate: '2026-04-13',
      endDate: '2026-04-15',
      type: 'public_holiday',
      nameTh: 'สงกรานต์',
      nameEn: 'Songkran',
      province: null,
      expectedImpactModifier: 0.3,
      source: 'public_holiday_lib',
      confidence: 0.8,
      organizationId: null,
      branchId: null,
    })
  })

  it('leaves expectedImpactModifier null when not yet assessed', () => {
    const rows = [makeRow({ expected_impact_modifier: null })]
    const [event] = filterRowsForBranch(rows, { organizationId: CRYSTAL_ORG, branchId: CRYSTAL_RESORT })
    expect(event.expectedImpactModifier).toBeNull()
  })
})

describe('demandCalendarDatesInRange', () => {
  it('expands a single-day event to exactly one date', () => {
    const events: DemandCalendarEvent[] = [{
      id: '1', startDate: '2026-05-01', endDate: '2026-05-01', type: 'public_holiday',
      nameTh: 'วันแรงงาน', nameEn: 'Labour Day', province: null, expectedImpactModifier: null,
      source: 'public_holiday_lib', confidence: 1, organizationId: null, branchId: null,
    }]
    expect(demandCalendarDatesInRange(events)).toEqual(new Set(['2026-05-01']))
  })

  it('expands a multi-day event (Songkran) to every day in the range', () => {
    const events: DemandCalendarEvent[] = [{
      id: '1', startDate: '2026-04-13', endDate: '2026-04-15', type: 'public_holiday',
      nameTh: 'สงกรานต์', nameEn: 'Songkran', province: null, expectedImpactModifier: 0.3,
      source: 'public_holiday_lib', confidence: 1, organizationId: null, branchId: null,
    }]
    expect(demandCalendarDatesInRange(events)).toEqual(
      new Set(['2026-04-13', '2026-04-14', '2026-04-15']),
    )
  })

  it('unions dates across multiple events without duplicates', () => {
    const events: DemandCalendarEvent[] = [
      { id: '1', startDate: '2026-04-14', endDate: '2026-04-15', type: 'public_holiday', nameTh: 'a', nameEn: 'a', province: null, expectedImpactModifier: null, source: 'curated', confidence: 1, organizationId: null, branchId: null },
      { id: '2', startDate: '2026-04-15', endDate: '2026-04-16', type: 'local_event', nameTh: 'b', nameEn: 'b', province: null, expectedImpactModifier: null, source: 'owner_entered', confidence: 1, organizationId: 'org', branchId: 'branch' },
    ]
    expect(demandCalendarDatesInRange(events)).toEqual(
      new Set(['2026-04-14', '2026-04-15', '2026-04-16']),
    )
  })
})
