import { describe, it, expect } from 'vitest'
import { parseFnbSalesCsv, buildFnbSalesCsvTemplate } from './csv-fnb-sales'

describe('parseFnbSalesCsv — happy paths', () => {
  it('parses a minimal valid CSV', () => {
    const csv = [
      'date,item_name,external_item_id,units_sold',
      '2026-06-01,Pad Krapow,,15',
      '2026-06-01,Iced Coffee,COFFEE-001,32',
    ].join('\n')
    const out = parseFnbSalesCsv(csv)
    expect(out.rows).toHaveLength(2)
    expect(out.warnings).toHaveLength(0)
    expect(out.rows[0]).toEqual({
      date: '2026-06-01',
      itemName: 'Pad Krapow',
      externalItemId: null,
      unitsSold: 15,
    })
    expect(out.rows[1].externalItemId).toBe('COFFEE-001')
  })

  it('accepts rows with only item_name (no external_item_id col)', () => {
    const csv = [
      'date,item_name,units_sold',
      '2026-06-01,Pad Krapow,15',
    ].join('\n')
    const out = parseFnbSalesCsv(csv)
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0].externalItemId).toBeNull()
  })

  it('accepts rows with only external_item_id (no item_name col)', () => {
    const csv = [
      'date,external_item_id,units_sold',
      '2026-06-01,COFFEE-001,32',
    ].join('\n')
    const out = parseFnbSalesCsv(csv)
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0].itemName).toBeNull()
    expect(out.rows[0].externalItemId).toBe('COFFEE-001')
  })

  it('rounds decimal units_sold to integer', () => {
    const csv = [
      'date,item_name,units_sold',
      '2026-06-01,Pad Krapow,15.6',
      '2026-06-02,Pad Krapow,15.4',
    ].join('\n')
    const out = parseFnbSalesCsv(csv)
    expect(out.rows[0].unitsSold).toBe(16)
    expect(out.rows[1].unitsSold).toBe(15)
  })

  it('accepts 0 units_sold (legitimate end-of-day "no sales")', () => {
    const csv = [
      'date,item_name,units_sold',
      '2026-06-01,Pad Krapow,0',
    ].join('\n')
    const out = parseFnbSalesCsv(csv)
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0].unitsSold).toBe(0)
  })

  it('handles quoted item names containing commas', () => {
    const csv = [
      'date,item_name,units_sold',
      '2026-06-01,"Pad Krapow, large",15',
    ].join('\n')
    expect(parseFnbSalesCsv(csv).rows[0].itemName).toBe('Pad Krapow, large')
  })

  it('strips UTF-8 BOM', () => {
    const csv = '﻿date,item_name,units_sold\n2026-06-01,Pad Krapow,15'
    expect(parseFnbSalesCsv(csv).rows).toHaveLength(1)
  })
})

describe('parseFnbSalesCsv — separator auto-detect', () => {
  it('parses a semicolon-separated CSV (Thai/EU Excel default)', () => {
    const csv = [
      'date;item_name;external_item_id;units_sold',
      '2026-06-01;Pad Krapow;;15',
      '2026-06-01;Iced Coffee;COFFEE-001;32',
    ].join('\n')
    const out = parseFnbSalesCsv(csv)
    expect(out.rows).toHaveLength(2)
    expect(out.warnings).toHaveLength(0)
    expect(out.rows[0]).toEqual({
      date: '2026-06-01',
      itemName: 'Pad Krapow',
      externalItemId: null,
      unitsSold: 15,
    })
  })

  it('parses a tab-separated CSV (some POS exports)', () => {
    const csv = [
      'date\titem_name\tunits_sold',
      '2026-06-01\tPad Krapow\t15',
    ].join('\n')
    const out = parseFnbSalesCsv(csv)
    expect(out.rows).toHaveLength(1)
    expect(out.warnings).toHaveLength(0)
    expect(out.rows[0].itemName).toBe('Pad Krapow')
  })

  it('still parses standard comma CSV (default fallback)', () => {
    const csv = [
      'date,item_name,units_sold',
      '2026-06-01,Pad Krapow,15',
    ].join('\n')
    const out = parseFnbSalesCsv(csv)
    expect(out.rows).toHaveLength(1)
  })

  it('missing_columns warning surfaces the expected + found detail', () => {
    // Random header that doesn't match any expected column.
    const csv = ['a,b,c', '1,2,3'].join('\n')
    const out = parseFnbSalesCsv(csv)
    expect(out.warnings).toHaveLength(1)
    expect(out.warnings[0].code).toBe('missing_columns')
    // raw should include the expected list + what we actually saw
    expect(out.warnings[0].raw).toContain('Expected columns')
    expect(out.warnings[0].raw).toContain('Found')
    expect(out.warnings[0].raw).toContain('date')
  })

  it('missing_columns warning shows the separator we picked', () => {
    // Semicolon-delimited with WRONG column names so we hit the
    // missing-columns path. We want the warning to say sep=";".
    const csv = ['foo;bar;baz', '1;2;3'].join('\n')
    const out = parseFnbSalesCsv(csv)
    expect(out.warnings[0].raw).toContain('separator=";"')
  })
})

describe('parseFnbSalesCsv — warnings + skips', () => {
  it('warns when required columns are missing in the header', () => {
    const csv = ['date,units_sold', '2026-06-01,15'].join('\n')
    const out = parseFnbSalesCsv(csv)
    expect(out.warnings[0].code).toBe('missing_columns')
    expect(out.rows).toHaveLength(0)
  })

  it('warns when neither item_name nor external_item_id is in the header', () => {
    const csv = ['date,units_sold', '2026-06-01,15'].join('\n')
    expect(parseFnbSalesCsv(csv).warnings[0].code).toBe('missing_columns')
  })

  it('skips a row with an invalid date', () => {
    const csv = [
      'date,item_name,units_sold',
      '06/01/2026,Pad Krapow,15',
    ].join('\n')
    expect(parseFnbSalesCsv(csv).warnings[0].code).toBe('invalid_date')
  })

  it('skips a row where both item_name AND external_item_id are blank', () => {
    const csv = [
      'date,item_name,external_item_id,units_sold',
      '2026-06-01,,,15',
    ].join('\n')
    expect(parseFnbSalesCsv(csv).warnings[0].code).toBe('missing_item_identifier')
  })

  it('skips a row with negative units_sold', () => {
    const csv = [
      'date,item_name,units_sold',
      '2026-06-01,Pad Krapow,-5',
    ].join('\n')
    expect(parseFnbSalesCsv(csv).warnings[0].code).toBe('invalid_units')
  })

  it('skips a row with non-numeric units_sold', () => {
    const csv = [
      'date,item_name,units_sold',
      '2026-06-01,Pad Krapow,many',
    ].join('\n')
    expect(parseFnbSalesCsv(csv).warnings[0].code).toBe('invalid_units')
  })

  it('processes good rows alongside bad ones', () => {
    const csv = [
      'date,item_name,units_sold',
      '2026-06-01,Pad Krapow,15',         // good
      'broken,Pad Krapow,15',              // invalid date
      '2026-06-02,Pad Krapow,15',         // good
      '2026-06-03,,15',                    // missing identifier
      '2026-06-04,Pad Krapow,abc',        // invalid units
      '2026-06-05,Pad Krapow,20',         // good
    ].join('\n')
    const out = parseFnbSalesCsv(csv)
    expect(out.rows).toHaveLength(3)
    expect(out.warnings).toHaveLength(3)
  })

  it('counts non-blank data lines in totalDataLines', () => {
    const csv = [
      'date,item_name,units_sold',
      '2026-06-01,Pad Krapow,15',
      '',
      '2026-06-02,Pad Krapow,20',
      'broken,Pad Krapow,15',
    ].join('\n')
    const out = parseFnbSalesCsv(csv)
    expect(out.totalDataLines).toBe(3)
  })
})

describe('buildFnbSalesCsvTemplate', () => {
  it('emits header + one row per (date × item)', () => {
    const csv = buildFnbSalesCsvTemplate({
      items: [
        { name: 'Pad Krapow', external_item_id: null },
        { name: 'Iced Coffee', external_item_id: 'COFFEE-001' },
      ],
      startDate: '2026-06-01',
      days: 2,
    })
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('date,item_name,external_item_id,units_sold')
    // 2 days × 2 items = 4 rows + header
    expect(lines).toHaveLength(5)
    expect(lines[1]).toBe('2026-06-01,Pad Krapow,,')
    expect(lines[2]).toBe('2026-06-01,Iced Coffee,COFFEE-001,')
  })

  it('quotes item names containing commas', () => {
    const csv = buildFnbSalesCsvTemplate({
      items: [{ name: 'Pad Krapow, large' }],
      startDate: '2026-06-01',
      days: 1,
    })
    expect(csv).toContain('"Pad Krapow, large"')
  })

  it('round-trips: template fills cleanly through the parser', () => {
    const tpl = buildFnbSalesCsvTemplate({
      items: [{ name: 'Pad Krapow', external_item_id: 'PK-1' }],
      startDate: '2026-06-01',
      days: 1,
    })
    const filled = tpl.replace(',PK-1,', ',PK-1,12')
    const out = parseFnbSalesCsv(filled)
    expect(out.rows).toHaveLength(1)
    expect(out.warnings).toHaveLength(0)
    expect(out.rows[0].unitsSold).toBe(12)
  })

  it('clamps days to 31 max', () => {
    const csv = buildFnbSalesCsvTemplate({
      items: [{ name: 'Pad Krapow' }],
      startDate: '2026-06-01',
      days: 100,
    })
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(32) // header + 31 days × 1 item
  })

  it('defaults to 7 days when not specified', () => {
    const csv = buildFnbSalesCsvTemplate({
      items: [{ name: 'Pad Krapow' }],
      startDate: '2026-06-01',
    })
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(8)
  })
})
