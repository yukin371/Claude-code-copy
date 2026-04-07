import {
  getTaskRouteTransportMode,
  type TaskRouteProviderName,
  type TaskRouteTransportConfig,
} from './taskRouting.js'
import {
  getProviderLoadBalanceStrategy,
  getOpenAICompatibleProviderOrder,
  getProviderDefaultBaseUrls,
  getProviderKeyEnvNames,
  getProviderLoadBalanceWeight,
} from './providerMetadata.js'

export type ProviderEndpointCandidate = {
  provider: TaskRouteProviderName
  baseUrl: string
  apiKey?: string
  baseUrlIndex: number
  apiKeyIndex: number
  providerWeight: number
  endpointId: string
}

type ProviderEndpointHealth = {
  failures: number
  lastFailureAt?: number
  lastFailureReason?: string
  lastSuccessAt?: number
  cooldownUntil?: number
}

const providerSequenceCursor = new Map<TaskRouteProviderName, number>()
const providerEndpointCursor = new Map<TaskRouteProviderName, number>()
const endpointHealth = new Map<string, ProviderEndpointHealth>()
const BASE_COOLDOWN_MS = 1_000
const MAX_COOLDOWN_MS = 60_000

export function buildProviderEndpointCandidates(
  transport: TaskRouteTransportConfig,
): ProviderEndpointCandidate[] {
  const providers = getProviderOrder(transport)
  const candidates: ProviderEndpointCandidate[] = []

  for (const provider of providers) {
    const providerTransport = buildProviderTransport(transport, provider)
    const baseUrls = resolveBaseUrls(providerTransport, provider === transport.provider)
    const apiKeys = resolveApiKeys(providerTransport, provider === transport.provider)

    if (baseUrls.length === 0) continue

    const keyOptions = apiKeys.length > 0 ? apiKeys : [undefined]
    const providerWeight = getProviderLoadBalanceWeight(provider)

    for (let baseUrlIndex = 0; baseUrlIndex < baseUrls.length; baseUrlIndex++) {
      const baseUrl = baseUrls[baseUrlIndex]
      for (let apiKeyIndex = 0; apiKeyIndex < keyOptions.length; apiKeyIndex++) {
        const apiKey = keyOptions[apiKeyIndex]
        candidates.push({
          provider,
          baseUrl,
          apiKey,
          baseUrlIndex,
          apiKeyIndex,
          providerWeight,
          endpointId: makeEndpointId(provider, baseUrl, apiKey),
        })
      }
    }
  }

  return candidates
}

export function selectProviderEndpointCandidates(
  transport: TaskRouteTransportConfig,
  candidates: readonly ProviderEndpointCandidate[],
): ProviderEndpointCandidate[] {
  if (candidates.length === 0) return []

  const healthy = candidates.filter(candidate => !isCoolingDown(candidate.endpointId))
  const available = healthy.length > 0 ? healthy : [...candidates]
  if (available.length === 0) return []

  const providerOrder = getOrderedProviders(transport, available)
  if (providerOrder.length === 0) return available

  const orderedCandidates: ProviderEndpointCandidate[] = []

  for (const provider of providerOrder) {
    const providerCandidates = available.filter(
      candidate => candidate.provider === provider,
    )
    if (providerCandidates.length === 0) continue

    const endpointCursor = providerEndpointCursor.get(provider) ?? 0
    providerEndpointCursor.set(provider, endpointCursor + 1)
    orderedCandidates.push(...rotateArray(providerCandidates, endpointCursor))
  }

  return orderedCandidates.length > 0 ? orderedCandidates : available
}

export function markProviderEndpointSuccess(candidate: ProviderEndpointCandidate): void {
  endpointHealth.set(candidate.endpointId, {
    failures: 0,
    lastSuccessAt: Date.now(),
    cooldownUntil: 0,
  })
}

export function markProviderEndpointFailure(
  candidate: ProviderEndpointCandidate,
  reason: string,
): void {
  const current = endpointHealth.get(candidate.endpointId)
  const failures = (current?.failures ?? 0) + 1
  const cooldownUntil = Date.now() + getCooldownMs(failures)
  endpointHealth.set(candidate.endpointId, {
    failures,
    lastFailureAt: Date.now(),
    lastFailureReason: reason,
    lastSuccessAt: current?.lastSuccessAt,
    cooldownUntil,
  })
}

export function getProviderEndpointHealthSnapshot(
  provider?: TaskRouteProviderName,
): Array<{ endpointId: string } & ProviderEndpointHealth> {
  const entries = Array.from(endpointHealth.entries()).map(([endpointId, state]) => ({
    endpointId,
    ...state,
  }))
  if (!provider) return entries
  return entries.filter(entry => entry.endpointId.startsWith(`${provider}|`))
}

export function resetProviderBalancerForTests(): void {
  providerSequenceCursor.clear()
  providerEndpointCursor.clear()
  endpointHealth.clear()
}

function getProviderOrder(transport: TaskRouteTransportConfig): TaskRouteProviderName[] {
  const preferred = transport.provider
  if (getTaskRouteTransportMode(transport) === 'single-upstream') {
    return [preferred]
  }

  const order = getOpenAICompatibleProviderOrder(preferred)
  if (order.length === 0) return [preferred]
  return order
}

function getOrderedProviders(
  transport: TaskRouteTransportConfig,
  candidates: readonly ProviderEndpointCandidate[],
): TaskRouteProviderName[] {
  const providerOrder = getProviderOrder(transport)
  const candidateProviders = new Set(candidates.map(candidate => candidate.provider))
  const availableProviders = providerOrder.filter(provider =>
    candidateProviders.has(provider),
  )
  if (availableProviders.length <= 1) {
    return availableProviders
  }

  const strategy = getProviderLoadBalanceStrategy()
  switch (strategy) {
    case 'round-robin':
      return rotateProvidersByCursor(transport.provider, availableProviders)
    case 'weighted':
      return getWeightedProviderOrder(transport.provider, candidates, availableProviders)
    case 'fallback':
    default:
      return availableProviders
  }
}

function buildProviderTransport(
  transport: TaskRouteTransportConfig,
  provider: TaskRouteProviderName,
): TaskRouteTransportConfig {
  if (provider === transport.provider) return transport
  return { ...transport, provider, apiStyle: 'openai-compatible' }
}

function resolveBaseUrls(
  transport: TaskRouteTransportConfig,
  isPreferredProvider: boolean,
): string[] {
  const explicit =
    isPreferredProvider &&
    getTaskRouteTransportMode(transport) === 'single-upstream'
    ? resolveExplicitTransportValue(transport.baseUrl, 'baseUrl')
    : []
  if (explicit.length > 0) return explicit
  const fallback = getProviderDefaultBaseUrls(transport.provider)
  return fallback.length > 0 ? [...fallback] : []
}

function resolveApiKeys(
  transport: TaskRouteTransportConfig,
  isPreferredProvider: boolean,
): string[] {
  const explicit =
    isPreferredProvider &&
    getTaskRouteTransportMode(transport) === 'single-upstream'
    ? resolveExplicitTransportValue(transport.apiKey, 'apiKey')
    : []
  if (explicit.length > 0) return explicit
  const envNames = getProviderKeyEnvNames(transport.provider)
  const keys: string[] = []
  for (const envName of envNames) {
    const value = process.env[envName]?.trim()
    if (value) {
      keys.push(...splitList(value))
      if (keys.length > 0) break
    }
  }
  return keys
}

function isCoolingDown(endpointId: string): boolean {
  const state = endpointHealth.get(endpointId)
  return !!state?.cooldownUntil && state.cooldownUntil > Date.now()
}

function getCooldownMs(failures: number): number {
  const scaled = BASE_COOLDOWN_MS * 2 ** Math.max(0, failures - 1)
  return Math.min(MAX_COOLDOWN_MS, scaled)
}

function makeEndpointId(
  provider: TaskRouteProviderName,
  baseUrl: string,
  apiKey?: string,
): string {
  return `${provider}|${baseUrl}|${apiKey ?? ''}`
}

function rotateArray<T>(items: readonly T[], cursor: number): T[] {
  if (items.length === 0) return []
  const start = cursor % items.length
  return [...items.slice(start), ...items.slice(0, start)]
}

function rotateProvidersByCursor(
  preferredProvider: TaskRouteProviderName,
  providers: readonly TaskRouteProviderName[],
): TaskRouteProviderName[] {
  const sequenceCursor = providerSequenceCursor.get(preferredProvider) ?? 0
  providerSequenceCursor.set(preferredProvider, sequenceCursor + 1)
  return rotateArray(providers, sequenceCursor)
}

function getWeightedProviderOrder(
  preferredProvider: TaskRouteProviderName,
  candidates: readonly ProviderEndpointCandidate[],
  providers: readonly TaskRouteProviderName[],
): TaskRouteProviderName[] {
  const weightedProviders = providers.flatMap(provider => {
    const providerCandidates = candidates.filter(candidate => candidate.provider === provider)
    const providerWeight = Math.max(
      1,
      ...providerCandidates.map(candidate => candidate.providerWeight),
    )
    return Array.from({ length: providerWeight }, () => provider)
  })
  if (weightedProviders.length === 0) {
    return [...providers]
  }

  const rotated = rotateProvidersByCursor(preferredProvider, weightedProviders)
  const orderedProviders: TaskRouteProviderName[] = []
  for (const provider of rotated) {
    if (!orderedProviders.includes(provider)) {
      orderedProviders.push(provider)
    }
  }
  for (const provider of providers) {
    if (!orderedProviders.includes(provider)) {
      orderedProviders.push(provider)
    }
  }
  return orderedProviders
}

function splitList(value?: string): string[] {
  if (!value) return []
  return value
    .split(/[\n,;|]/)
    .map(part => part.trim())
    .filter(Boolean)
}

function resolveExplicitTransportValue(
  value: string | undefined,
  fieldName: 'baseUrl' | 'apiKey',
): string[] {
  const values = splitList(value)
  if (values.length <= 1) return values

  throw new Error(
    `Explicit task-route ${fieldName} pools are not supported. Point the route at a single upstream or external gateway instead.`,
  )
}
