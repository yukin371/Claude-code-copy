import { describe, expect, test } from 'bun:test'
import { computeProviderKeyQuotaUtilization } from './providerKeyUsageHandoffLogic.js'

describe('providerKeyUsageHandoffLogic', () => {
  test('returns null when no limits are configured', () => {
    const result = computeProviderKeyQuotaUtilization({
      state: {
        requests: 1,
        inputTokens: 10,
        outputTokens: 5,
        costUSD: 0.01,
        windowStartMs: 0,
        windowSeconds: 60,
      },
      limits: {},
    })
    expect(result).toBeNull()
  })

  test('computes utilization by requests', () => {
    const result = computeProviderKeyQuotaUtilization({
      state: {
        requests: 8,
        inputTokens: 0,
        outputTokens: 0,
        costUSD: 0,
        windowStartMs: 0,
        windowSeconds: 60,
      },
      limits: { maxRequests: 10 },
    })
    expect(result).toBeTruthy()
    expect(result?.reason).toBe('requests')
    expect(result?.ratio).toBeCloseTo(0.8)
    expect(result?.usedPercent).toBe(80)
    expect(result?.resetAtMs).toBe(60_000)
    expect(result?.resetsAtIso).toBe(new Date(60_000).toISOString())
  })

  test('chooses the highest ratio across requests/tokens/cost', () => {
    const result = computeProviderKeyQuotaUtilization({
      state: {
        requests: 3,
        inputTokens: 40,
        outputTokens: 55,
        costUSD: 0.5,
        windowStartMs: 0,
        windowSeconds: 60,
      },
      limits: { maxRequests: 10, maxTotalTokens: 100, maxUsd: 2 },
    })
    expect(result).toBeTruthy()
    expect(result?.reason).toBe('tokens')
    expect(result?.usedPercent).toBe(95)
  })

  test('includes estimated tokens when upstream usage is missing', () => {
    const result = computeProviderKeyQuotaUtilization({
      state: {
        requests: 1,
        inputTokens: 0,
        outputTokens: 0,
        estimatedInputTokens: 50,
        estimatedOutputTokens: 50,
        costUSD: 0,
        windowStartMs: 0,
        windowSeconds: 60,
      },
      limits: { maxTotalTokens: 100 },
    })
    expect(result).toBeTruthy()
    expect(result?.reason).toBe('tokens')
    expect(result?.usedPercent).toBe(100)
  })
})

