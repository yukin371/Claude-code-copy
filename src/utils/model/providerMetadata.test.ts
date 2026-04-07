import { afterEach, describe, expect, test } from 'bun:test'

import {
  getProviderLoadBalanceConfigSnapshot,
  getProviderLoadBalanceStrategy,
  getProviderLoadBalanceWeight,
} from './providerMetadata.js'

const ENV_KEYS = [
  'NEKO_CODE_OPENAI_PROVIDER_STRATEGY',
  'NEKO_CODE_OPENAI_PROVIDER_WEIGHTS',
] as const

const envSnapshot = Object.fromEntries(
  ENV_KEYS.map(key => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = envSnapshot[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
})

describe('providerMetadata', () => {
  test('returns fallback strategy by default and for invalid values', () => {
    delete process.env.NEKO_CODE_OPENAI_PROVIDER_STRATEGY
    expect(getProviderLoadBalanceStrategy()).toBe('fallback')

    process.env.NEKO_CODE_OPENAI_PROVIDER_STRATEGY = 'unknown'
    expect(getProviderLoadBalanceStrategy()).toBe('fallback')
  })

  test('parses load balance strategy case-insensitively', () => {
    process.env.NEKO_CODE_OPENAI_PROVIDER_STRATEGY = '  RoUnD-RoBiN  '
    expect(getProviderLoadBalanceStrategy()).toBe('round-robin')

    process.env.NEKO_CODE_OPENAI_PROVIDER_STRATEGY = ' weighted '
    expect(getProviderLoadBalanceStrategy()).toBe('weighted')
  })

  test('applies provider weight overrides and clamps non-positive values', () => {
    process.env.NEKO_CODE_OPENAI_PROVIDER_WEIGHTS =
      'gemini=3,codex=0,glm=-2,invalid=9,minimax=abc'

    expect(getProviderLoadBalanceWeight('gemini')).toBe(3)
    expect(getProviderLoadBalanceWeight('codex')).toBe(1)
    expect(getProviderLoadBalanceWeight('glm')).toBe(1)
    expect(getProviderLoadBalanceWeight('minimax')).toBe(1)
  })

  test('reads strategy and weight overrides from settings when env is absent', () => {
    delete process.env.NEKO_CODE_OPENAI_PROVIDER_STRATEGY
    delete process.env.NEKO_CODE_OPENAI_PROVIDER_WEIGHTS

    const settings = {
      openAIProviderStrategy: 'round-robin',
      openAIProviderWeights: {
        gemini: 4,
        codex: 2.8,
      },
    } as const

    const snapshot = getProviderLoadBalanceConfigSnapshot(settings)

    expect(snapshot.strategy).toBe('round-robin')
    expect(snapshot.strategySource).toBe('settings')
    expect(snapshot.weightSource).toBe('settings')
    expect(snapshot.weightOverrides).toEqual({
      codex: 2,
      gemini: 4,
    })
    expect(getProviderLoadBalanceStrategy(settings)).toBe('round-robin')
    expect(getProviderLoadBalanceWeight('gemini', settings)).toBe(4)
    expect(getProviderLoadBalanceWeight('codex', settings)).toBe(2)
  })

  test('env overrides settings snapshot for strategy and weights', () => {
    process.env.NEKO_CODE_OPENAI_PROVIDER_STRATEGY = 'weighted'
    process.env.NEKO_CODE_OPENAI_PROVIDER_WEIGHTS = 'gemini=5'

    const snapshot = getProviderLoadBalanceConfigSnapshot({
      openAIProviderStrategy: 'round-robin',
      openAIProviderWeights: {
        gemini: 2,
        codex: 3,
      },
    })

    expect(snapshot.strategy).toBe('weighted')
    expect(snapshot.strategySource).toBe('env')
    expect(snapshot.weightOverrides).toEqual({
      gemini: 5,
    })
    expect(snapshot.weightSource).toBe('env')
  })

  test('getProviderLoadBalanceStrategy prioritizes env values over provided settings', () => {
    process.env.NEKO_CODE_OPENAI_PROVIDER_STRATEGY = 'round-robin'
    const strategyFromSettings = getProviderLoadBalanceStrategy({
      openAIProviderStrategy: 'fallback',
    })
    expect(strategyFromSettings).toBe('round-robin')
  })

  test('getProviderLoadBalanceWeight reads env overrides and clamps non-positive values', () => {
    process.env.NEKO_CODE_OPENAI_PROVIDER_WEIGHTS = 'codex=0,glm=3'
    expect(getProviderLoadBalanceWeight('codex')).toBe(1)
    expect(getProviderLoadBalanceWeight('glm')).toBe(3)
  })
})
