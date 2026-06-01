import { describe, it, expect } from 'vitest'
import { MockPosProvider } from './mock-provider'

describe('MockPosProvider', () => {
  it('always returns no_data status', async () => {
    const result = await new MockPosProvider().fetchSales()
    expect(result.status).toBe('no_data')
  })

  it('returns the default reason when no override is supplied', async () => {
    const result = await new MockPosProvider().fetchSales()
    expect(result.error).toBe('POS integration is not yet configured for this branch.')
  })

  it('returns a custom reason when supplied', async () => {
    const result = await new MockPosProvider('Loyverse credentials missing.').fetchSales()
    expect(result.error).toBe('Loyverse credentials missing.')
  })

  it('returns empty rows array (no data to upsert)', async () => {
    const result = await new MockPosProvider().fetchSales()
    expect(result.rows).toEqual([])
  })

  it('has name "mock"', () => {
    expect(new MockPosProvider().name).toBe('mock')
  })
})
