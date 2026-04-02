import { beforeEach, describe, expect, test } from 'bun:test'

import type { TaskRouteTransportConfig } from './taskRouting.js'
import {
  buildProviderEndpointCandidates,
  markProviderEndpointFailure,
  resetProviderBalancerForTests,
  selectProviderEndpointCandidates,
} from './providerBalancer.js'

describe('providerBalancer', () => {
  beforeEach(() => {
    resetProviderBalancerForTests()
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
})
