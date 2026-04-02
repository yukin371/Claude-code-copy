import { afterEach, describe, expect, test } from 'bun:test'

import {
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
})
