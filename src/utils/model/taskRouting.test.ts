import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  resetMainLoopProviderOverrideForTests,
  setMainLoopProviderOverride,
} from './sessionProviderOverride.js'

type EnvSnapshot = Record<string, string | undefined>

const ENV_KEYS = [
  'OPENAI_BASE_URL',
  'OPENAI_API_KEY',
  'NEKO_CODE_OPENAI_COMPATIBLE_BASE_URL',
  'NEKO_CODE_OPENAI_COMPATIBLE_API_KEY',
  'NEKO_CODE_PLAN_BASE_URL',
] as const

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

describe('taskRouting transport compatibility', () => {
  let envSnapshot: EnvSnapshot

  beforeEach(() => {
    envSnapshot = snapshotEnv(ENV_KEYS)
    resetMainLoopProviderOverrideForTests()
  })

  afterEach(() => {
    restoreEnv(envSnapshot)
    resetMainLoopProviderOverrideForTests()
  })

  test('anthropic routes ignore global openai-compatible transport defaults', async () => {
    process.env.OPENAI_BASE_URL = 'https://gateway.example.com/v1'
    process.env.OPENAI_API_KEY = 'shared-openai-key'

    const { getTaskRouteTransportConfig } = await import('./taskRouting.js')
    const route = getTaskRouteTransportConfig('plan')

    expect(route.provider).toBe('anthropic')
    expect(route.apiStyle).toBe('anthropic')
    expect(route.baseUrl).toBeUndefined()
    expect(route.apiKey).toBeUndefined()
  })

  test('openai-compatible routes still inherit global openai-compatible defaults', async () => {
    process.env.NEKO_CODE_OPENAI_COMPATIBLE_BASE_URL =
      'https://gateway.example.com/v1'
    process.env.NEKO_CODE_OPENAI_COMPATIBLE_API_KEY = 'shared-openai-key'

    const { getTaskRouteTransportConfig } = await import('./taskRouting.js')
    const route = getTaskRouteTransportConfig('main')

    expect(route.provider).toBe('glm')
    expect(route.apiStyle).toBe('openai-compatible')
    expect(route.baseUrl).toBe('https://gateway.example.com/v1')
    expect(route.apiKey).toBe('shared-openai-key')
  })

  test('explicit route base url can still switch an anthropic route to openai-compatible', async () => {
    process.env.NEKO_CODE_PLAN_BASE_URL = 'https://custom-gateway.example.com/v1'
    process.env.OPENAI_API_KEY = 'shared-openai-key'

    const { getTaskRouteTransportConfig } = await import('./taskRouting.js')
    const route = getTaskRouteTransportConfig('plan')

    expect(route.provider).toBe('anthropic')
    expect(route.apiStyle).toBe('openai-compatible')
    expect(route.baseUrl).toBe('https://custom-gateway.example.com/v1')
    expect(route.apiKey).toBe('shared-openai-key')
  })

  test('main route prefers session provider override over env provider', async () => {
    process.env.NEKO_CODE_MAIN_PROVIDER = 'anthropic'
    setMainLoopProviderOverride('gemini')

    const { getTaskRouteExecutionTarget } = await import('./taskRouting.js')
    const route = getTaskRouteExecutionTarget('main')
    const baseRoute = getTaskRouteExecutionTarget('main', {
      ignoreSessionOverride: true,
    })

    expect(route.provider).toBe('gemini')
    expect(route.apiStyle).toBe('openai-compatible')
    expect(baseRoute.provider).toBe('anthropic')
    expect(baseRoute.apiStyle).toBe('anthropic')
  })
})
