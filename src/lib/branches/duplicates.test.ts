import { describe, it, expect } from 'vitest'
import { normaliseBranchName, findDuplicateBranchIds } from './duplicates'

// Pins the real-world artefact that motivated the duplicate badge —
// the duplicate branch left behind by the old non-idempotent
// create-org route (fixed in commit 93d56dd). Both spellings of the
// Resort A branch must collapse to the same normalised value so the
// super-admin sees the amber pill on both rows.

describe('normaliseBranchName', () => {
  it('matches em-dash and plain-hyphen variants of the same name', () => {
    expect(normaliseBranchName('Resort A — Bangkok')).toBe(
      normaliseBranchName('Resort A- Bangkok'),
    )
  })

  it('is case-insensitive', () => {
    expect(normaliseBranchName('CAFE B SUKHUMVIT')).toBe(
      normaliseBranchName('cafe b sukhumvit'),
    )
  })

  it('treats different branches as different', () => {
    expect(normaliseBranchName('Resort A Bangkok')).not.toBe(
      normaliseBranchName('Resort A Chiang Mai'),
    )
  })
})

describe('findDuplicateBranchIds', () => {
  it('flags both rows of a same-org duplicate', () => {
    const rows = [
      { branchId: 'b1', branchName: 'Resort A — Bangkok', organizationId: 'org-a' },
      { branchId: 'b2', branchName: 'Resort A- Bangkok', organizationId: 'org-a' },
      { branchId: 'b3', branchName: 'Cafe B Sukhumvit', organizationId: 'org-b' },
    ]
    const dups = findDuplicateBranchIds(rows)
    expect(dups.has('b1')).toBe(true)
    expect(dups.has('b2')).toBe(true)
    expect(dups.has('b3')).toBe(false)
  })

  it('does not flag duplicates across different orgs', () => {
    // Two orgs both have a branch called "Main" — different tenants,
    // legitimately not a duplicate.
    const rows = [
      { branchId: 'b1', branchName: 'Main', organizationId: 'org-a' },
      { branchId: 'b2', branchName: 'Main', organizationId: 'org-b' },
    ]
    const dups = findDuplicateBranchIds(rows)
    expect(dups.size).toBe(0)
  })
})
