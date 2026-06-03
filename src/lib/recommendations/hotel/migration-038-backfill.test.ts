// Migration 038 backfill verification.
//
// The migration adds suggested_rate_satang and backfills every existing
// row with `suggested_rate_thb * 100`. Production DBs run the migration
// at deploy time and we don't keep an explicit Postgres test harness;
// instead this test pins:
//
//   1. The SQL text contains the exact backfill expression we rely on
//      (no drift between what we ship and what we document).
//   2. The math in that expression matches our application-side
//      satang ↔ thb helpers for every reasonable rate value.
//
// If either drifts, this test fails so the writer notices BEFORE the
// migration is applied to a live DB.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { thbToSatang } from '@/lib/money/satang'

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../../supabase/migrations/038_rate_approvals_satang.sql',
)

const SQL = readFileSync(MIGRATION_PATH, 'utf8')

describe('migration 038: backfill expression', () => {
  it('includes the satang column add', () => {
    expect(SQL).toMatch(/add column if not exists suggested_rate_satang bigint/i)
  })

  it('includes the non-negative check constraint', () => {
    expect(SQL).toMatch(/suggested_rate_satang\s*>=\s*0/)
  })

  it('contains the backfill UPDATE with the exact thb*100 expression', () => {
    // Tolerant whitespace match — what matters is the expression and the
    // null-skip clause. The migration's full block reads:
    //   update rate_approvals
    //      set suggested_rate_satang = (suggested_rate_thb::bigint * 100)
    //    where suggested_rate_satang is null
    //      and suggested_rate_thb is not null;
    expect(SQL).toMatch(/update\s+rate_approvals/i)
    expect(SQL).toMatch(/set\s+suggested_rate_satang\s*=\s*\(?\s*suggested_rate_thb::bigint\s*\*\s*100\s*\)?/i)
    expect(SQL).toMatch(/where\s+suggested_rate_satang\s+is\s+null/i)
    expect(SQL).toMatch(/and\s+suggested_rate_thb\s+is\s+not\s+null/i)
  })

  it('does NOT drop suggested_rate_thb in this migration', () => {
    // The spec explicitly says do NOT drop the column. Catch any
    // accidental drop statement that someone might add later.
    expect(SQL).not.toMatch(/drop\s+column\s+suggested_rate_thb/i)
  })

  it('drops the unique constraint on token (multi-row token sharing)', () => {
    expect(SQL).toMatch(/drop\s+constraint/i)
    expect(SQL).toMatch(/drop\s+index\s+if\s+exists\s+rate_approvals_token_idx/i)
  })

  it('adds unique (token, room_type) so a set can\'t double-row the same type', () => {
    expect(SQL).toMatch(/unique\s*\(\s*token\s*,\s*room_type\s*\)/i)
  })
})

describe('migration 038: backfill math vs application helpers', () => {
  it('SQL expression thb*100 = thbToSatang(thb) for every plausible rate', () => {
    // Production rate_approvals.suggested_rate_thb values are always
    // integers (the previous schema had it as `integer`). The SQL
    // backfill multiplies by 100 → satang. Our helper rounds half-up
    // but for integer inputs there's no rounding needed. They must
    // agree exactly.
    const rates = [0, 1, 100, 749, 950, 1200, 9999, 25000, 49999]
    for (const thb of rates) {
      const sqlEquivalent = thb * 100
      expect(thbToSatang(thb)).toBe(sqlEquivalent)
    }
  })
})
