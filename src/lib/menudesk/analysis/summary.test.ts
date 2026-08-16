// The blurred summary's contract.
//
// Most of these are redaction tests rather than behaviour tests. The blur in
// the UI is decoration; THIS is the thing that keeps the curiosity gap honest,
// and the failure mode it guards against is invisible in the rendered page —
// you only see it in a network tab, which is exactly where a sceptical owner
// would look before deciding whether to trust us.

import { describe, expect, it } from 'vitest'
import type { TrafficLight } from '@/lib/menudesk/engine'
import { concernCount, isTerminal, summarize } from './summary'

const LIGHTS: TrafficLight[] = ['amber', 'red', 'green', 'red', 'amber']

describe('summarize', () => {
  it('counts each traffic light', () => {
    expect(summarize('complete', LIGHTS, 5).counts).toEqual({ red: 2, amber: 2, green: 1 })
  })

  it('orders the rows worst first, so the reveal does not rearrange', () => {
    expect(summarize('complete', LIGHTS, 5).rows).toEqual([
      'red',
      'red',
      'amber',
      'amber',
      'green',
    ])
  })

  it('emits one row per costed dish and nothing else', () => {
    const summary = summarize('complete', LIGHTS, 8)
    expect(summary.rows).toHaveLength(5)
    expect(summary.costedCount).toBe(5)
    expect(summary.uncostedCount).toBe(3)
    expect(summary.dishCount).toBe(8)
  })

  it('reports uncosted dishes as a number, never as a list', () => {
    const summary = summarize('partial', [], 4)
    expect(summary.uncostedCount).toBe(4)
    // There is no field that could hold their names.
    expect(Object.keys(summary).sort()).toEqual([
      'costedCount',
      'counts',
      'dishCount',
      'rows',
      'status',
      'uncostedCount',
    ])
  })

  it('never lets uncosted go negative when analyses outnumber dishes', () => {
    // Defensive: a mismatched read should not render "-2 dishes".
    expect(summarize('complete', LIGHTS, 3).uncostedCount).toBe(0)
  })

  it('serializes to colours and integers only', () => {
    // The real guarantee, asserted the way an attacker would check it: read
    // the whole payload and confirm there is nothing in it but counts.
    const payload = JSON.stringify(summarize('complete', LIGHTS, 7))
    const parsed = JSON.parse(payload) as Record<string, unknown>

    expect(parsed.rows).toEqual(['red', 'red', 'amber', 'amber', 'green'])
    for (const value of Object.values(parsed)) {
      const kind = Array.isArray(value) ? 'array' : typeof value
      expect(['number', 'string', 'object', 'array']).toContain(kind)
    }
    // No free text anywhere except the status and the colour words.
    const strings = payload.match(/"[^"]*"/g) ?? []
    const allowed = new Set([
      '"status"', '"complete"', '"dishCount"', '"costedCount"', '"uncostedCount"',
      '"counts"', '"red"', '"amber"', '"green"', '"rows"',
    ])
    expect(strings.filter((s) => !allowed.has(s))).toEqual([])
  })

  it('carries the status through unchanged', () => {
    expect(summarize('costing', [], 0).status).toBe('costing')
  })
})

describe('concernCount', () => {
  it('counts red and amber as the dishes worth worrying about', () => {
    expect(concernCount({ red: 2, amber: 3, green: 9 })).toBe(5)
  })

  it('is zero for a menu with nothing alarming', () => {
    expect(concernCount({ red: 0, amber: 0, green: 6 })).toBe(0)
  })
})

describe('isTerminal', () => {
  it('treats finished states as terminal', () => {
    expect(isTerminal('complete')).toBe(true)
    expect(isTerminal('partial')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
  })

  it('keeps the poller running while work is in flight', () => {
    expect(isTerminal('uploading')).toBe(false)
    expect(isTerminal('reading')).toBe(false)
    expect(isTerminal('costing')).toBe(false)
  })
})
