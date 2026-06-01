import { describe, it, expect } from 'vitest'
import { parseMenuItemsCsv, buildMenuItemsCsvTemplate } from './csv-menu-items'

describe('parseMenuItemsCsv — happy paths', () => {
  it('parses a minimal valid CSV', () => {
    const csv = [
      'name,category,price_baht,cost_baht',
      'Pad Krapow,Main,120,45',
      'Iced Coffee,Drinks,70,18',
    ].join('\n')
    const out = parseMenuItemsCsv(csv)
    expect(out.rows).toHaveLength(2)
    expect(out.warnings).toHaveLength(0)
    expect(out.rows[0]).toEqual({
      name: 'Pad Krapow',
      category: 'Main',
      priceThb: 120,
      costThb: 45,
    })
  })

  it('accepts the price_thb alias for price_baht', () => {
    const csv = [
      'name,price_thb',
      'Pad Krapow,120',
    ].join('\n')
    expect(parseMenuItemsCsv(csv).rows).toHaveLength(1)
  })

  it('treats blank cost as null', () => {
    const csv = [
      'name,category,price_baht,cost_baht',
      'Pad Krapow,Main,120,',
    ].join('\n')
    expect(parseMenuItemsCsv(csv).rows[0].costThb).toBeNull()
  })

  it('treats blank category as null', () => {
    const csv = [
      'name,category,price_baht,cost_baht',
      'Pad Krapow,,120,45',
    ].join('\n')
    expect(parseMenuItemsCsv(csv).rows[0].category).toBeNull()
  })

  it('rounds decimal prices and costs', () => {
    const csv = [
      'name,price_baht,cost_baht',
      'Pad Krapow,119.6,44.4',
    ].join('\n')
    expect(parseMenuItemsCsv(csv).rows[0].priceThb).toBe(120)
    expect(parseMenuItemsCsv(csv).rows[0].costThb).toBe(44)
  })

  it('handles quoted names containing commas', () => {
    const csv = [
      'name,price_baht',
      '"Pad Krapow, large",150',
    ].join('\n')
    expect(parseMenuItemsCsv(csv).rows[0].name).toBe('Pad Krapow, large')
  })

  it('parses semicolon-separated CSV (Thai/EU Excel)', () => {
    const csv = [
      'name;category;price_baht;cost_baht',
      'Pad Krapow;Main;120;45',
    ].join('\n')
    const out = parseMenuItemsCsv(csv)
    expect(out.rows).toHaveLength(1)
    expect(out.warnings).toHaveLength(0)
  })

  it('parses tab-separated CSV', () => {
    const csv = ['name\tprice_baht', 'Pad Krapow\t120'].join('\n')
    expect(parseMenuItemsCsv(csv).rows).toHaveLength(1)
  })

  it('strips UTF-8 BOM', () => {
    const csv = '﻿name,price_baht\nPad Krapow,120'
    expect(parseMenuItemsCsv(csv).rows).toHaveLength(1)
  })

  it('accepts price of 0 (legitimate freebie / promo item)', () => {
    const csv = ['name,price_baht', 'Welcome drink,0'].join('\n')
    expect(parseMenuItemsCsv(csv).rows[0].priceThb).toBe(0)
  })

  it('parses cost_thb as an alternate cost column name', () => {
    const csv = ['name,price_baht,cost_thb', 'Pad Krapow,120,45'].join('\n')
    expect(parseMenuItemsCsv(csv).rows[0].costThb).toBe(45)
  })
})

describe('parseMenuItemsCsv — warnings + skips', () => {
  it('warns when name column is missing', () => {
    const csv = ['category,price_baht', 'Main,120'].join('\n')
    const out = parseMenuItemsCsv(csv)
    expect(out.warnings[0].code).toBe('missing_columns')
    expect(out.rows).toHaveLength(0)
  })

  it('warns when both price_baht and price_thb are missing', () => {
    const csv = ['name,category', 'Pad Krapow,Main'].join('\n')
    expect(parseMenuItemsCsv(csv).warnings[0].code).toBe('missing_columns')
  })

  it('missing_columns warning carries diagnostic detail', () => {
    const csv = ['foo,bar,baz', '1,2,3'].join('\n')
    const out = parseMenuItemsCsv(csv)
    expect(out.warnings[0].raw).toContain('Expected columns')
    expect(out.warnings[0].raw).toMatch(/\d+ bytes/)
    expect(out.warnings[0].raw).toMatch(/non-blank line/)
  })

  it('skips a row with missing name', () => {
    const csv = ['name,price_baht', ',120'].join('\n')
    expect(parseMenuItemsCsv(csv).warnings[0].code).toBe('missing_name')
  })

  it('skips a row with name longer than 120 chars', () => {
    const csv = ['name,price_baht', `${'A'.repeat(121)},120`].join('\n')
    expect(parseMenuItemsCsv(csv).warnings[0].code).toBe('name_too_long')
  })

  it('skips a row with negative price', () => {
    const csv = ['name,price_baht', 'Pad Krapow,-50'].join('\n')
    expect(parseMenuItemsCsv(csv).warnings[0].code).toBe('invalid_price')
  })

  it('skips a row with non-numeric price', () => {
    const csv = ['name,price_baht', 'Pad Krapow,many'].join('\n')
    expect(parseMenuItemsCsv(csv).warnings[0].code).toBe('invalid_price')
  })

  it('skips a row with negative cost (but blank cost is allowed)', () => {
    const csv = ['name,price_baht,cost_baht', 'Pad Krapow,120,-1'].join('\n')
    expect(parseMenuItemsCsv(csv).warnings[0].code).toBe('invalid_cost')
  })

  it('processes good rows alongside bad ones — does not abort on first error', () => {
    const csv = [
      'name,price_baht,cost_baht',
      'Pad Krapow,120,45',
      ',150,40',           // missing name → skip
      'Iced Coffee,abc,18', // invalid price → skip
      'Mango Rice,80,',     // good (blank cost)
    ].join('\n')
    const out = parseMenuItemsCsv(csv)
    expect(out.rows).toHaveLength(2)
    expect(out.warnings).toHaveLength(2)
  })
})

describe('buildMenuItemsCsvTemplate', () => {
  it('emits header + at least one example row', () => {
    const csv = buildMenuItemsCsvTemplate()
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('name,category,price_baht,cost_baht')
    expect(lines.length).toBeGreaterThan(1)
  })

  it('round-trips through the parser without warnings', () => {
    const out = parseMenuItemsCsv(buildMenuItemsCsvTemplate())
    expect(out.warnings).toHaveLength(0)
    expect(out.rows.length).toBeGreaterThan(0)
  })

  it('includes a row demonstrating blank cost (most common case)', () => {
    const csv = buildMenuItemsCsvTemplate()
    expect(csv).toContain(',\n')  // trailing comma + newline = blank last cell
  })
})
