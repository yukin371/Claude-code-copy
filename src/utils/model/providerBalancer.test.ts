import { beforeEach, describe, expect, test } from 'bun:test'

import type { TaskRouteTransportConfig } from './taskRouting.js'
import {
  buildProviderEndpointCandidates,
  getProviderEndpointHealthSnapshot,
  markProviderEndpointFailure,
  markProviderEndpointSuccess,
  type ProviderEndpointCandidate,
  resetProviderBalancerForTests,
  selectProviderEndpointCandidates,
} from './providerBalancer.js'

describe('providerBalancer', () => {
  const envSnapshot = {
    strategy: process.env.NEKO_CODE_OPENAI_PROVIDER_STRATEGY,
    weights: process.env.NEKO_CODE_OPENAI_PROVIDER_WEIGHTS,
  }

  beforeEach(() => {
    resetProviderBalancerForTests()
    if (envSnapshot.strategy === undefined) {
      delete process.env.NEKO_CODE_OPENAI_PROVIDER_STRATEGY
    } else {
      process.env.NEKO_CODE_OPENAI_PROVIDER_STRATEGY = envSnapshot.strategy
    }
    if (envSnapshot.weights === undefined) {
      delete process.env.NEKO_CODE_OPENAI_PROVIDER_WEIGHTS
    } else {
      process.env.NEKO_CODE_OPENAI_PROVIDER_WEIGHTS = envSnapshot.weights
    }
  })

  test('buildProviderEndpointCandidates rejects explicit transport pools', () => {
    const transport: TaskRouteTransportConfig = {
      provider: 'gemini',
      apiStyle: 'openai-compatible',
      baseUrl: 'https://a.example.com/v1, https://b.example.com/v1',
      apiKey: 'key-1,key-2',
    }

    expect(() => buildProviderEndpointCandidates(transport)).toThrow(
      'Explicit task-route baseUrl pools are not supported.',
    )
  })

  test('buildProviderEndpointCandidates keeps a single explicit upstream', () => {
    const transport: TaskRouteTransportConfig = {
      provider: 'gemini',
      apiStyle: 'openai-compatible',
      baseUrl: 'https://gateway.example.com/v1',
      apiKey: 'gateway-key',
    }

    const candidates = buildProviderEndpointCandidates(transport)

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      provider: 'gemini',
      baseUrl: 'https://gateway.example.com/v1',
      apiKey: 'gateway-key',
      baseUrlIndex: 0,
      apiKeyIndex: 0,
    })
  })

  test('buildProviderEndpointCandidates rejects explicit apiKey pools', () => {
    const transport: TaskRouteTransportConfig = {
      provider: 'gemini',
      apiStyle: 'openai-compatible',
      baseUrl: 'https://gateway.example.com/v1',
      apiKey: 'key-1,key-2',
    }

    expect(() => buildProviderEndpointCandidates(transport)).toThrow(
      'Explicit task-route apiKey pools are not supported.',
    )
  })

  test('buildProviderEndpointCandidates applies provider weight overrides from env', () => {
    process.env.NEKO_CODE_OPENAI_PROVIDER_WEIGHTS = 'gemini=3'
    const transport: TaskRouteTransportConfig = {
      provider: 'gemini',
      apiStyle: 'openai-compatible',
      baseUrl: 'https://a.example.com/v1',
      apiKey: 'key-1',
    }

    const candidates = buildProviderEndpointCandidates(transport)

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.providerWeight).toBe(3)
  })

  test('selectProviderEndpointCandidates skips endpoints in cooldown when alternatives exist', () => {
    const transport: TaskRouteTransportConfig = {
      provider: 'gemini',
      apiStyle: 'openai-compatible',
    }

    const candidates = [
      createCandidate('gemini', 1, 0),
      createCandidate('gemini', 1, 1),
    ]
    markProviderEndpointFailure(candidates[0]!, 'upstream overloaded')

    const ordered = selectProviderEndpointCandidates(transport, candidates)

    expect(ordered).toHaveLength(1)
    expect(ordered[0]?.endpointId).toBe(candidates[1]?.endpointId)
    expect(ordered[0]?.baseUrl).toBe('https://gemini-1.example.com/v1')
  })

  test('fallback strategy preserves preferred provider before compatible fallbacks', () => {
    process.env.NEKO_CODE_OPENAI_PROVIDER_STRATEGY = 'fallback'
    const transport: TaskRouteTransportConfig = {
      provider: 'gemini',
      apiStyle: 'openai-compatible',
    }
    const candidates = createCandidates([
      'gemini',
      'codex',
      'glm',
    ])

    const ordered = selectProviderEndpointCandidates(transport, candidates)

    expect(ordered.map(candidate => candidate.provider)).toEqual([
      'gemini',
      'codex',
      'glm',
    ])
  })

  test('round-robin strategy rotates provider order across calls', () => {
    process.env.NEKO_CODE_OPENAI_PROVIDER_STRATEGY = 'round-robin'
    const transport: TaskRouteTransportConfig = {
      provider: 'gemini',
      apiStyle: 'openai-compatible',
    }
    const candidates = createCandidates([
      'gemini',
      'codex',
      'glm',
    ])

    const first = selectProviderEndpointCandidates(transport, candidates)
    const second = selectProviderEndpointCandidates(transport, candidates)
    const third = selectProviderEndpointCandidates(transport, candidates)

    expect(first.map(candidate => candidate.provider)).toEqual([
      'gemini',
      'codex',
      'glm',
    ])
    expect(second.map(candidate => candidate.provider)).toEqual([
      'codex',
      'glm',
      'gemini',
    ])
    expect(third.map(candidate => candidate.provider)).toEqual([
      'glm',
      'gemini',
      'codex',
    ])
  })

  test('weighted strategy rotates providers according to candidate weights', () => {
    process.env.NEKO_CODE_OPENAI_PROVIDER_STRATEGY = 'weighted'
    const transport: TaskRouteTransportConfig = {
      provider: 'gemini',
      apiStyle: 'openai-compatible',
    }
    const candidates = [
      createCandidate('gemini', 2),
      createCandidate('codex', 1),
      createCandidate('glm', 1),
    ]

    const first = selectProviderEndpointCandidates(transport, candidates)
    const second = selectProviderEndpointCandidates(transport, candidates)
    const third = selectProviderEndpointCandidates(transport, candidates)
    const fourth = selectProviderEndpointCandidates(transport, candidates)

    expect(first.map(candidate => candidate.provider)).toEqual([
      'gemini',
      'codex',
      'glm',
    ])
    expect(second.map(candidate => candidate.provider)).toEqual([
      'gemini',
      'codex',
      'glm',
    ])
    expect(third.map(candidate => candidate.provider)).toEqual([
      'codex',
      'glm',
      'gemini',
    ])
    expect(fourth.map(candidate => candidate.provider)).toEqual([
      'glm',
      'gemini',
      'codex',
    ])
  })

  test('returns all candidates when every endpoint is cooling down', () => {
    process.env.NEKO_CODE_OPENAI_PROVIDER_STRATEGY = 'fallback'
    const transport: TaskRouteTransportConfig = {
      provider: 'gemini',
      apiStyle: 'openai-compatible',
    }
    const candidates = createCandidates([
      'gemini',
      'codex',
    ])
    for (const candidate of candidates) {
      markProviderEndpointFailure(candidate, 'all failed')
    }

    const ordered = selectProviderEndpointCandidates(transport, candidates)

    expect(ordered).toHaveLength(2)
    expect(ordered.map(candidate => candidate.provider)).toEqual([
      'gemini',
      'codex',
    ])
  })

  test('provider health snapshot records failures and resets after success', () => {
    const [candidate] = createCandidates(['gemini'])
    const beforeFailure = Date.now()
    markProviderEndpointFailure(candidate, 'timeout')

    const failureSnapshot = getProviderEndpointHealthSnapshot('gemini')[0]
    expect(failureSnapshot).toBeDefined()
    expect(failureSnapshot!.failures).toBe(1)
    expect(failureSnapshot!.lastFailureReason).toBe('timeout')
    expect(failureSnapshot!.cooldownUntil).toBeGreaterThan(beforeFailure)

    markProviderEndpointSuccess(candidate)
    const successSnapshot = getProviderEndpointHealthSnapshot('gemini')[0]
    expect(successSnapshot).toBeDefined()
    expect(successSnapshot!.failures).toBe(0)
    expect(successSnapshot!.cooldownUntil).toBe(0)
    expect(successSnapshot!.lastSuccessAt).toBeDefined()
  })

  test('fallback strategy skips cooled providers and preserves order otherwise', () => {
    process.env.NEKO_CODE_OPENAI_PROVIDER_STRATEGY = 'fallback'
    const transport: TaskRouteTransportConfig = {
      provider: 'glm',
      apiStyle: 'openai-compatible',
    }
    const candidates = createCandidates(['glm', 'codex', 'gemini'])
    markProviderEndpointFailure(candidates[0], 'preferred down')

    const ordered = selectProviderEndpointCandidates(transport, candidates)

    expect(ordered.map(candidate => candidate.provider)).toEqual([
      'codex',
      'gemini',
    ])
  })

  test('round-robin rotates only healthy providers when others cool down', () => {
    process.env.NEKO_CODE_OPENAI_PROVIDER_STRATEGY = 'round-robin'
    const transport: TaskRouteTransportConfig = {
      provider: 'glm',
      apiStyle: 'openai-compatible',
    }
    const candidates = createCandidates(['glm', 'gemini', 'codex'])
    markProviderEndpointFailure(candidates[1], 'cooling down')

    const first = selectProviderEndpointCandidates(transport, candidates)
    const second = selectProviderEndpointCandidates(transport, candidates)

    expect(first.map(candidate => candidate.provider)).toEqual([
      'glm',
      'codex',
    ])
    expect(second.map(candidate => candidate.provider)).toEqual([
      'codex',
      'glm',
    ])
  })

  test('weighted strategy rotates remaining providers while hot provider cools down', () => {
    process.env.NEKO_CODE_OPENAI_PROVIDER_STRATEGY = 'weighted'
    const transport: TaskRouteTransportConfig = {
      provider: 'gemini',
      apiStyle: 'openai-compatible',
    }
    const candidates = [
      createCandidate('gemini', 2),
      createCandidate('codex', 1),
      createCandidate('glm', 1),
    ]
    markProviderEndpointFailure(candidates[0], 'timeout')

    const first = selectProviderEndpointCandidates(transport, candidates)
    const second = selectProviderEndpointCandidates(transport, candidates)
    markProviderEndpointSuccess(candidates[0])
    const third = selectProviderEndpointCandidates(transport, candidates)

    expect(first.map(candidate => candidate.provider)).toEqual([
      'codex',
      'glm',
    ])
    expect(second.map(candidate => candidate.provider)).toEqual([
      'glm',
      'codex',
    ])
    expect(third.map(candidate => candidate.provider)).toEqual([
      'codex',
      'glm',
      'gemini',
    ])
  })
})

function createCandidates(
  providers: Array<'gemini' | 'codex' | 'glm'>,
): ProviderEndpointCandidate[] {
  return providers.map((provider, index) => createCandidate(provider, 1, index))
}

function createCandidate(
  provider: 'gemini' | 'codex' | 'glm',
  providerWeight: number,
  baseUrlIndex = 0,
): ProviderEndpointCandidate {
  const baseUrl = `https://${provider}-${baseUrlIndex}.example.com/v1`
  const apiKey = `${provider}-key-${baseUrlIndex}`
  return {
    provider,
    baseUrl,
    apiKey,
    baseUrlIndex,
    apiKeyIndex: 0,
    providerWeight,
    endpointId: `${provider}|${baseUrl}|${apiKey}`,
  }
}
