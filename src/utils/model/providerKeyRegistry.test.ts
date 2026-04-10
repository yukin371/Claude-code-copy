import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { setFlagSettingsInline } from '../../bootstrap/state.js'
import { resetSettingsCache } from '../settings/settingsCache.js'
import { resolveProviderKeyRef } from './providerKeyRegistry.js'

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

describe('providerKeyRegistry', () => {
  const ENV_KEYS = ['TEST_KEY_ENV', 'NODE_ENV'] as const
  let envSnapshot: EnvSnapshot

  beforeEach(() => {
    envSnapshot = snapshotEnv(ENV_KEYS)
    process.env.NODE_ENV = 'test'
    setFlagSettingsInline(null)
    resetSettingsCache()
  })

  afterEach(() => {
    restoreEnv(envSnapshot)
    setFlagSettingsInline(null)
    resetSettingsCache()
  })

  test('resolves keyRef from secretEnv when provider/model constraints are satisfied', async () => {
    process.env.TEST_KEY_ENV = 'secret'
    setFlagSettingsInline({
      providerKeys: [
        {
          id: 'k1',
          provider: 'gemini',
          secretEnv: 'TEST_KEY_ENV',
          models: ['gemini-2.5-pro'],
        },
      ],
    })
    resetSettingsCache()

    const result = resolveProviderKeyRef({
      keyRef: 'k1',
      expectedProvider: 'gemini',
      model: 'gemini-2.5-pro',
    })
    expect(result.status).toBe('ok')
    expect(result.apiKey).toBe('secret')
    expect(result.secretSource).toBe('env')
  })

  test('rejects provider mismatch', async () => {
    process.env.TEST_KEY_ENV = 'secret'
    setFlagSettingsInline({
      providerKeys: [{ id: 'k1', provider: 'glm', secretEnv: 'TEST_KEY_ENV' }],
    })
    resetSettingsCache()

    const result = resolveProviderKeyRef({
      keyRef: 'k1',
      expectedProvider: 'gemini',
      model: 'gemini-2.5-pro',
    })
    expect(result.status).toBe('provider_mismatch')
  })

  test('rejects expired keys when expiresAt is parseable', async () => {
    process.env.TEST_KEY_ENV = 'secret'
    setFlagSettingsInline({
      providerKeys: [
        {
          id: 'k1',
          provider: 'gemini',
          secretEnv: 'TEST_KEY_ENV',
          expiresAt: '2000-01-01T00:00:00Z',
        },
      ],
    })
    resetSettingsCache()

    const result = resolveProviderKeyRef({
      keyRef: 'k1',
      expectedProvider: 'gemini',
      model: 'gemini-2.5-pro',
    })
    expect(result.status).toBe('expired')
  })

  test('rejects model not in allowlist', async () => {
    process.env.TEST_KEY_ENV = 'secret'
    setFlagSettingsInline({
      providerKeys: [
        {
          id: 'k1',
          provider: 'gemini',
          secretEnv: 'TEST_KEY_ENV',
          models: ['gemini-2.5-pro'],
        },
      ],
    })
    resetSettingsCache()

    const result = resolveProviderKeyRef({
      keyRef: 'k1',
      expectedProvider: 'gemini',
      model: 'gemini-2.5-flash',
    })
    expect(result.status).toBe('model_denied')
  })

  test('reports secret_missing when secretEnv is set but unset in env', async () => {
    delete process.env.TEST_KEY_ENV
    setFlagSettingsInline({
      providerKeys: [
        {
          id: 'k1',
          provider: 'gemini',
          secretEnv: 'TEST_KEY_ENV',
          models: ['gemini-2.5-pro'],
        },
      ],
    })
    resetSettingsCache()

    const result = resolveProviderKeyRef({
      keyRef: 'k1',
      expectedProvider: 'gemini',
      model: 'gemini-2.5-pro',
    })
    expect(result.status).toBe('secret_missing')
  })
})

