import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { setFlagSettingsInline } from '../bootstrap/state.js'
import { resetSettingsCache } from '../utils/settings/settingsCache.js'
import { getCurrentProjectConfig } from '../utils/config.js'
import {
  flushProviderKeyUsageToProjectConfig,
  recordProviderKeyUsageFromAPISuccess,
  resetProviderKeyUsageMonitorForTests,
} from './providerKeyUsageMonitor.js'

type EnvSnapshot = Record<string, string | undefined>

function snapshotEnv(keys: readonly string[]): EnvSnapshot {
  return Object.fromEntries(keys.map(key => [key, process.env[key]]))
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key]
      continue
    }
    process.env[key] = value
  }
}

describe('providerKeyUsageMonitor', () => {
  const ENV_KEYS = ['TEST_GEMINI_KEY', 'NODE_ENV'] as const
  let envSnapshot: EnvSnapshot

  beforeEach(() => {
    envSnapshot = snapshotEnv(ENV_KEYS)
    process.env.NODE_ENV = 'test'
    resetProviderKeyUsageMonitorForTests()
    setFlagSettingsInline(null)
    resetSettingsCache()
  })

  afterEach(() => {
    restoreEnv(envSnapshot)
    resetProviderKeyUsageMonitorForTests()
    setFlagSettingsInline(null)
    resetSettingsCache()
  })

  test('records usage for a keyRef route and persists on flush', async () => {
    process.env.TEST_GEMINI_KEY = 'secret'

    setFlagSettingsInline({
      providerKeys: [
        {
          id: 'gemini-k1',
          provider: 'gemini',
          secretEnv: 'TEST_GEMINI_KEY',
          models: ['gemini-2.5-pro'],
        },
      ],
      taskRoutes: {
        main: {
          provider: 'gemini',
          apiStyle: 'openai-compatible',
          model: 'gemini-2.5-pro',
          keyRef: 'gemini-k1',
        },
      },
    })
    resetSettingsCache()

    recordProviderKeyUsageFromAPISuccess({
      querySource: 'repl_main_thread',
      model: 'gemini-2.5-pro',
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 2,
        cache_creation_input_tokens: 3,
        server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
      } as any,
      costUSD: 0.01,
    })

    flushProviderKeyUsageToProjectConfig()

    const usage = getCurrentProjectConfig().providerKeyUsage?.['gemini-k1']
    expect(usage).toBeTruthy()
    expect(usage?.provider).toBe('gemini')
    expect(usage?.requests).toBe(1)
    expect(usage?.inputTokens).toBe(10)
    expect(usage?.outputTokens).toBe(5)
    expect(usage?.cacheReadInputTokens).toBe(2)
    expect(usage?.cacheCreationInputTokens).toBe(3)
    expect(usage?.costUSD).toBeCloseTo(0.01)
    expect(usage?.estimatedInputTokens ?? 0).toBe(0)
    expect(usage?.estimatedOutputTokens ?? 0).toBe(0)
  })

  test('uses estimates when upstream usage is missing', async () => {
    process.env.TEST_GEMINI_KEY = 'secret'

    setFlagSettingsInline({
      providerKeys: [
        {
          id: 'gemini-k1',
          provider: 'gemini',
          secretEnv: 'TEST_GEMINI_KEY',
          models: ['gemini-2.5-pro'],
        },
      ],
      taskRoutes: {
        main: {
          provider: 'gemini',
          apiStyle: 'openai-compatible',
          model: 'gemini-2.5-pro',
          keyRef: 'gemini-k1',
        },
      },
    })
    resetSettingsCache()

    recordProviderKeyUsageFromAPISuccess({
      querySource: 'repl_main_thread',
      model: 'gemini-2.5-pro',
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
      } as any,
      costUSD: 0,
      estimatedInputTokens: 123,
      estimatedOutputTokens: 45,
    })

    flushProviderKeyUsageToProjectConfig()

    const usage = getCurrentProjectConfig().providerKeyUsage?.['gemini-k1']
    expect(usage).toBeTruthy()
    expect(usage?.requests).toBe(1)
    expect(usage?.inputTokens).toBe(0)
    expect(usage?.outputTokens).toBe(0)
    expect(usage?.estimatedInputTokens).toBe(123)
    expect(usage?.estimatedOutputTokens).toBe(45)
  })
})

