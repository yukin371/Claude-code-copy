import { describe, expect, test } from 'bun:test'

import {
  checkGate_CACHED_OR_BLOCKING,
  clearGrowthBookConfigOverrides,
  getFeatureValue_CACHED_MAY_BE_STALE,
  initializeGrowthBook,
  onGrowthBookRefresh,
  setGrowthBookConfigOverride,
} from './growthbook.js'

describe('growthbook telemetry shim', () => {
  test('returns caller defaults when no override exists', async () => {
    clearGrowthBookConfigOverrides()

    expect(getFeatureValue_CACHED_MAY_BE_STALE('missing-flag', true)).toBe(true)
    expect(await checkGate_CACHED_OR_BLOCKING('missing-gate')).toBe(false)
    await expect(initializeGrowthBook()).resolves.toBeUndefined()
  })

  test('supports local overrides and refresh notifications without remote init', () => {
    clearGrowthBookConfigOverrides()

    let refreshCount = 0
    const unsubscribe = onGrowthBookRefresh(() => {
      refreshCount += 1
    })

    setGrowthBookConfigOverride('example-flag', 'enabled')
    expect(getFeatureValue_CACHED_MAY_BE_STALE('example-flag', 'disabled')).toBe(
      'enabled',
    )

    clearGrowthBookConfigOverrides()
    unsubscribe()

    expect(refreshCount).toBe(2)
    expect(getFeatureValue_CACHED_MAY_BE_STALE('example-flag', 'disabled')).toBe(
      'disabled',
    )
  })
})
