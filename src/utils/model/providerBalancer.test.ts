import { beforeEach, describe, expect, test } from 'bun:test'

import type { TaskRouteTransportConfig } from './taskRouting.js'
import {
  buildProviderEndpointCandidates,
  markProviderEndpointFailure,
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

  test('buildProviderEndpointCandidates expands baseUrls and apiKeys', () => {
    const transport: TaskRouteTransportConfig = {
      provider: 'gemini',
      apiStyle: 'openai-compatible',
      baseUrl: 'https://a.example.com/v1, https://b.example.com/v1',
      apiKey: 'key-1,key-2',
    }

    const candidates = buildProviderEndpointCandidates(transport)

    expect(candidates).toHaveLength(4)
    expect(
      candidates.map(candidate => ({
        provider: candidate.provider,
        baseUrl: candidate.baseUrl,
        apiKey: candidate.apiKey,
        baseUrlIndex: candidate.baseUrlIndex,
        apiKeyIndex: candidate.apiKeyIndex,
      })),
    ).toEqual([
      {
        provider: 'gemini',
        baseUrl: 'https://a.example.com/v1',
        apiKey: 'key-1',
        baseUrlIndex: 0,
        apiKeyIndex: 0,
      },
      {
        provider: 'gemini',
        baseUrl: 'https://a.example.com/v1',
        apiKey: 'key-2',
        baseUrlIndex: 0,
        apiKeyIndex: 1,
      },
      {
        provider: 'gemini',
        baseUrl: 'https://b.example.com/v1',
        apiKey: 'key-1',
        baseUrlIndex: 1,
        apiKeyIndex: 0,
      },
      {
        provider: 'gemini',
        baseUrl: 'https://b.example.com/v1',
        apiKey: 'key-2',
        baseUrlIndex: 1,
        apiKeyIndex: 1,
      },
    ])
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
      baseUrl: 'https://a.example.com/v1,https://b.example.com/v1',
      apiKey: 'key-1',
    }

    const candidates = buildProviderEndpointCandidates(transport)
    markProviderEndpointFailure(candidates[0]!, 'upstream overloaded')

    const ordered = selectProviderEndpointCandidates(transport, candidates)

    expect(ordered).toHaveLength(1)
    expect(ordered[0]?.endpointId).toBe(candidates[1]?.endpointId)
    expect(ordered[0]?.baseUrl).toBe('https://b.example.com/v1')
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
