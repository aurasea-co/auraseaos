import { describe, it, expect } from 'vitest'
import { parseCompetitorCsv, buildCompetitorCsvTemplate } from './csv-competitor'

describe('parseCompetitorCsv — happy paths', () => {
  it('parses a minimal valid CSV', () => {
    const csv = [
      'date,competitor,room_type,channel,rate_thb,source',
      '2026-06-01,Pullman Korat,Suite,ota,4200,Agoda',
      '2026-06-01,B2 Korat,Deluxe2,ota,900,Booking.com',
    ].join('\n')
    const out = parseCompetitorCsv(csv)
    expect(out.rows).toHaveLength(2)
    expect(out.warnings).toHaveLength(0)
    expect(out.rows[0]).toEqual({
      date: '2026-06-01',
      competitor: 'Pullman Korat',
      roomType: 'Suite',
      channel: 'ota',
      rateThb: 4200,
      source: 'Agoda',
    })
  })

  it('defaults channel to ota when the column is blank', () => {
    const csv = [
      'date,competitor,room_type,channel,rate_thb,source',
      '2026-06-01,Pullman,Suite,,4200,Agoda',
    ].join('\n')
    const out = parseCompetitorCsv(csv)
    expect(out.rows[0].channel).toBe('ota')
  })

  it('defaults channel to ota when the column is missing entirely', () => {
    const csv = [
      'date,competitor,room_type,rate_thb,source',
      '2026-06-01,Pullman,Suite,4200,Agoda',
    ].join('\n')
    const out = parseCompetitorCsv(csv)
    expect(out.rows[0].channel).toBe('ota')
  })

  it('accepts walk_in / package / promo as channel values', () => {
    const csv = [
      'date,competitor,room_type,channel,rate_thb',
      '2026-06-01,Pullman,Suite,walk_in,4500',
      '2026-06-01,Pullman,Suite,package,5000',
      '2026-06-01,Pullman,Suite,promo,3800',
    ].join('\n')
    const out = parseCompetitorCsv(csv)
    expect(out.rows.map((r) => r.channel)).toEqual(['walk_in', 'package', 'promo'])
  })

  it('defaults source to "CSV import" when blank', () => {
    const csv = [
      'date,competitor,room_type,channel,rate_thb,source',
      '2026-06-01,Pullman,Suite,ota,4200,',
    ].join('\n')
    expect(parseCompetitorCsv(csv).rows[0].source).toBe('CSV import')
  })

  it('rounds decimal rates to integer THB', () => {
    const csv = [
      'date,competitor,room_type,channel,rate_thb',
      '2026-06-01,Pullman,Suite,ota,4200.50',
      '2026-06-01,Pullman,Suite,ota,4199.49',
    ].join('\n')
    const out = parseCompetitorCsv(csv)
    expect(out.rows[0].rateThb).toBe(4201)
    expect(out.rows[1].rateThb).toBe(4199)
  })

  it('handles quoted competitor names containing commas', () => {
    const csv = [
      'date,competitor,room_type,channel,rate_thb',
      '2026-06-01,"Pullman, Bangkok",Suite,ota,4200',
    ].join('\n')
    expect(parseCompetitorCsv(csv).rows[0].competitor).toBe('Pullman, Bangkok')
  })

  it('strips UTF-8 BOM if Excel added one', () => {
    const csv = '﻿date,competitor,room_type,channel,rate_thb\n2026-06-01,Pullman,Suite,ota,4200'
    const out = parseCompetitorCsv(csv)
    expect(out.rows).toHaveLength(1)
    expect(out.warnings).toHaveLength(0)
  })
})

describe('parseCompetitorCsv — warnings + skips', () => {
  it('warns when required columns are missing in the header', () => {
    const csv = ['date,competitor,channel,rate_thb', '2026-06-01,Pullman,ota,4200'].join('\n')
    const out = parseCompetitorCsv(csv)
    expect(out.rows).toHaveLength(0)
    expect(out.warnings[0].code).toBe('missing_columns')
  })

  it('skips a row with an invalid date', () => {
    const csv = [
      'date,competitor,room_type,channel,rate_thb',
      '06/01/2026,Pullman,Suite,ota,4200',
    ].join('\n')
    const out = parseCompetitorCsv(csv)
    expect(out.rows).toHaveLength(0)
    expect(out.warnings).toHaveLength(1)
    expect(out.warnings[0].code).toBe('invalid_date')
    expect(out.warnings[0].lineNumber).toBe(2)
  })

  it('skips a row missing competitor', () => {
    const csv = [
      'date,competitor,room_type,channel,rate_thb',
      '2026-06-01,,Suite,ota,4200',
    ].join('\n')
    expect(parseCompetitorCsv(csv).warnings[0].code).toBe('missing_competitor')
  })

  it('skips a row missing room_type', () => {
    const csv = [
      'date,competitor,room_type,channel,rate_thb',
      '2026-06-01,Pullman,,ota,4200',
    ].join('\n')
    expect(parseCompetitorCsv(csv).warnings[0].code).toBe('missing_room_type')
  })

  it('skips a row with an unknown channel value', () => {
    const csv = [
      'date,competitor,room_type,channel,rate_thb',
      '2026-06-01,Pullman,Suite,whatsapp,4200',
    ].join('\n')
    expect(parseCompetitorCsv(csv).warnings[0].code).toBe('invalid_channel')
  })

  it('skips a row with zero or non-numeric rate', () => {
    const csv = [
      'date,competitor,room_type,channel,rate_thb',
      '2026-06-01,Pullman,Suite,ota,0',
      '2026-06-01,Pullman,Suite,ota,abc',
      '2026-06-01,Pullman,Suite,ota,-100',
    ].join('\n')
    const out = parseCompetitorCsv(csv)
    expect(out.rows).toHaveLength(0)
    expect(out.warnings.every((w) => w.code === 'invalid_rate')).toBe(true)
    expect(out.warnings).toHaveLength(3)
  })

  it('processes good rows alongside bad ones — does not abort on first error', () => {
    const csv = [
      'date,competitor,room_type,channel,rate_thb',
      '2026-06-01,Pullman,Suite,ota,4200',          // good
      'broken,Pullman,Suite,ota,4200',              // invalid date
      '2026-06-02,Pullman,Suite,ota,4300',          // good
      '2026-06-03,,Suite,ota,4400',                 // missing competitor
      '2026-06-04,Pullman,Suite,ota,4500',          // good
    ].join('\n')
    const out = parseCompetitorCsv(csv)
    expect(out.rows).toHaveLength(3)
    expect(out.warnings).toHaveLength(2)
    expect(out.warnings.map((w) => w.code).sort()).toEqual(['invalid_date', 'missing_competitor'])
  })

  it('counts every non-blank data line in totalDataLines', () => {
    const csv = [
      'date,competitor,room_type,channel,rate_thb',
      '2026-06-01,Pullman,Suite,ota,4200',
      '',                                         // blank — not counted
      '2026-06-02,Pullman,Suite,ota,4300',
      'broken,Pullman,Suite,ota,4200',           // counted (bad)
    ].join('\n')
    const out = parseCompetitorCsv(csv)
    expect(out.totalDataLines).toBe(3)
    expect(out.rows).toHaveLength(2)
    expect(out.warnings).toHaveLength(1)
  })
})

describe('buildCompetitorCsvTemplate', () => {
  it('emits header + one row per (date, competitor, room type)', () => {
    const csv = buildCompetitorCsvTemplate({
      competitors: ['Pullman', 'B2 Korat'],
      roomTypes: ['Suite', 'Deluxe'],
      startDate: '2026-06-01',
      days: 2,
    })
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('date,competitor,room_type,channel,rate_thb,source')
    // 2 days × 2 competitors × 2 room types = 8 data rows + 1 header
    expect(lines).toHaveLength(9)
    expect(lines[1]).toBe('2026-06-01,Pullman,Suite,ota,,Agoda')
  })

  it('quotes competitor names containing commas', () => {
    const csv = buildCompetitorCsvTemplate({
      competitors: ['Pullman, Bangkok'],
      roomTypes: ['Suite'],
      startDate: '2026-06-01',
      days: 1,
    })
    expect(csv).toContain('"Pullman, Bangkok"')
  })

  it('round-trips: a template can be parsed back without warnings (after fill)', () => {
    const template = buildCompetitorCsvTemplate({
      competitors: ['Pullman'],
      roomTypes: ['Suite'],
      startDate: '2026-06-01',
      days: 1,
    })
    // Owner fills the rate_thb column.
    const filled = template.replace('ota,,Agoda', 'ota,4200,Agoda')
    const out = parseCompetitorCsv(filled)
    expect(out.rows).toHaveLength(1)
    expect(out.warnings).toHaveLength(0)
  })

  it('clamps days to 30 max', () => {
    const csv = buildCompetitorCsvTemplate({
      competitors: ['Pullman'],
      roomTypes: ['Suite'],
      startDate: '2026-06-01',
      days: 100,
    })
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(31) // header + 30 days × 1 × 1
  })

  it('uses default 7 days when not specified', () => {
    const csv = buildCompetitorCsvTemplate({
      competitors: ['Pullman'],
      roomTypes: ['Suite'],
      startDate: '2026-06-01',
    })
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(8) // header + 7 days
  })
})
