import { describe, it, expect } from 'vitest'
import { MockProvider } from './mock-provider'

describe('MockProvider', () => {
  const sampleInput = {
    approvalId: 'a1b2',
    externalPropertyId: 'prop-123',
    date: '2026-05-31',
    roomType: 'Suite',           // per-room flow: actual type, never 'all'
    rateSatang: 185000,          // 1850 THB in satang
  }

  it('always returns skipped status', async () => {
    const provider = new MockProvider()
    const result = await provider.pushRate(sampleInput)
    expect(result.status).toBe('skipped')
  })

  it('returns the default skip reason when none is provided', async () => {
    const provider = new MockProvider()
    const result = await provider.pushRate(sampleInput)
    expect(result.error).toBe('PMS integration is not yet configured for this branch.')
  })

  it('returns a custom skip reason when supplied', async () => {
    const provider = new MockProvider('Cloudbeds credentials missing.')
    const result = await provider.pushRate(sampleInput)
    expect(result.error).toBe('Cloudbeds credentials missing.')
  })

  it('does not set an externalRef on skip (nothing to reconcile)', async () => {
    const provider = new MockProvider()
    const result = await provider.pushRate(sampleInput)
    expect(result.externalRef).toBeUndefined()
  })

  it('has name "mock" for logs + dashboard', () => {
    expect(new MockProvider().name).toBe('mock')
  })
})
