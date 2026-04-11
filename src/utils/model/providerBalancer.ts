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
  keyId?: string
  keyPriority?: number
  baseUrlIndex: number
  apiKeyIndex: number
  providerWeight: number
  endpointId: string
}

type ProviderEndpointHealth = {
  provider: TaskRouteProviderName
  baseUrl: string
  keyId?: string
  keyPriority?: number
  failures: number
  lastFailureAt?: number
  lastFailureReason?: string
  lastSuccessAt?: number
  lastAttemptAt?: number
  lastOutcome?: 'success' | 'failure'
  cooldownUntil?: number
}

const providerSequenceCursor = new Map<TaskRouteProviderName, number>()
const providerEndpointCursor = new Map<TaskRouteProviderName, number>()
const endpointHealth = new Map<string, ProviderEndpointHealth>()
const lastSuccessfulSourceEndpoint = new Map<
  string,
  { endpointId: string; keyId?: string; selectedAt: number }
>()
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
    const providerWeight = getProviderLoadBalanceWeight(provider)
    const keyedCandidates = resolveProviderKeyCandidates(
      providerTransport,
      provider === transport.provider,
    )

    if (keyedCandidates.length > 0) {
      for (let apiKeyIndex = 0; apiKeyIndex < keyedCandidates.length; apiKeyIndex++) {
        const keyCandidate = keyedCandidates[apiKeyIndex]
        const candidateBaseUrls =
          keyCandidate.baseUrl !== undefined ? [keyCandidate.baseUrl] : baseUrls
        if (candidateBaseUrls.length === 0) continue

        for (let baseUrlIndex = 0; baseUrlIndex < candidateBaseUrls.length; baseUrlIndex++) {
          const baseUrl = candidateBaseUrls[baseUrlIndex]
          candidates.push({
            provider,
            baseUrl,
            apiKey: keyCandidate.apiKey,
            keyId: keyCandidate.keyId,
            keyPriority: keyCandidate.priority,
            baseUrlIndex,
            apiKeyIndex,
            providerWeight,
            endpointId: makeEndpointId(
              provider,
              baseUrl,
              keyCandidate.apiKey,
              keyCandidate.keyId,
            ),
          })
        }
      }
      continue
    }

    const apiKeys = resolveApiKeys(providerTransport, provider === transport.provider)
    if (baseUrls.length === 0) continue
    const keyOptions = apiKeys.length > 0 ? apiKeys : [undefined]

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
    orderedCandidates.push(
      ...orderProviderCandidates(providerCandidates, endpointCursor),
    )
  }

  return orderedCandidates.length > 0 ? orderedCandidates : available
}

export function markProviderEndpointSuccess(
  candidate: ProviderEndpointCandidate,
  source?: string,
): void {
  const now = Date.now()
  endpointHealth.set(candidate.endpointId, {
    provider: candidate.provider,
    baseUrl: candidate.baseUrl,
    keyId: candidate.keyId,
    keyPriority: candidate.keyPriority,
    failures: 0,
    lastSuccessAt: now,
    lastAttemptAt: now,
    lastOutcome: 'success',
    cooldownUntil: 0,
  })
  const normalizedSource = source?.trim()
  if (normalizedSource) {
    lastSuccessfulSourceEndpoint.set(normalizedSource, {
      endpointId: candidate.endpointId,
      keyId: candidate.keyId,
      selectedAt: now,
    })
  }
}

export function markProviderEndpointFailure(
  candidate: ProviderEndpointCandidate,
  reason: string,
): void {
  const current = endpointHealth.get(candidate.endpointId)
  const failures = (current?.failures ?? 0) + 1
  const now = Date.now()
  const cooldownUntil = now + getCooldownMs(failures)
  endpointHealth.set(candidate.endpointId, {
    provider: candidate.provider,
    baseUrl: candidate.baseUrl,
    keyId: candidate.keyId,
    keyPriority: candidate.keyPriority,
    failures,
    lastFailureAt: now,
    lastFailureReason: reason,
    lastSuccessAt: current?.lastSuccessAt,
    lastAttemptAt: now,
    lastOutcome: 'failure',
    cooldownUntil,
  })
}

export function getProviderEndpointHealthSnapshot(
  provider?: TaskRouteProviderName,
): Array<
  {
    endpointId: string
    coolingDown: boolean
    cooldownRemainingMs: number
  } & ProviderEndpointHealth
> {
  const now = Date.now()
  const entries = Array.from(endpointHealth.entries()).map(([endpointId, state]) => ({
    endpointId,
    ...state,
    coolingDown: !!state.cooldownUntil && state.cooldownUntil > now,
    cooldownRemainingMs: Math.max(0, (state.cooldownUntil ?? 0) - now),
  }))
  if (!provider) return entries
  return entries.filter(entry => entry.provider === provider)
}

export function getLastSuccessfulProviderKeyIdForSource(
  source?: string,
): string | undefined {
  const normalized = source?.trim()
  if (!normalized) return undefined
  return lastSuccessfulSourceEndpoint.get(normalized)?.keyId
}

export function resetProviderBalancerForTests(): void {
  providerSequenceCursor.clear()
  providerEndpointCursor.clear()
  endpointHealth.clear()
  lastSuccessfulSourceEndpoint.clear()
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

function resolveProviderKeyCandidates(
  transport: TaskRouteTransportConfig,
  isPreferredProvider: boolean,
): NonNullable<TaskRouteTransportConfig['apiKeyCandidates']> {
  if (
    !isPreferredProvider ||
    getTaskRouteTransportMode(transport) !== 'single-upstream'
  ) {
    return []
  }
  return transport.apiKeyCandidates ?? []
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
  keyId?: string,
): string {
  return `${provider}|${baseUrl}|${keyId ?? apiKey ?? ''}`
}

function orderProviderCandidates(
  candidates: readonly ProviderEndpointCandidate[],
  cursor: number,
): ProviderEndpointCandidate[] {
  if (candidates.length <= 1) return [...candidates]

  const groups = new Map<number, ProviderEndpointCandidate[]>()
  for (const candidate of candidates) {
    const priority = candidate.keyPriority ?? Number.MAX_SAFE_INTEGER
    const group = groups.get(priority) ?? []
    group.push(candidate)
    groups.set(priority, group)
  }

  const ordered: ProviderEndpointCandidate[] = []
  const priorities = Array.from(groups.keys()).sort((a, b) => a - b)
  for (const priority of priorities) {
    const group = (groups.get(priority) ?? []).sort((a, b) => {
      if (a.baseUrlIndex !== b.baseUrlIndex) return a.baseUrlIndex - b.baseUrlIndex
      if (a.apiKeyIndex !== b.apiKeyIndex) return a.apiKeyIndex - b.apiKeyIndex
      return a.endpointId.localeCompare(b.endpointId)
    })
    ordered.push(...rotateArray(group, cursor))
  }

  return ordered
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
