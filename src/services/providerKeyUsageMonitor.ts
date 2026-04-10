import type { BetaUsage as Usage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import {
  getCurrentProjectConfig,
  saveCurrentProjectConfig,
} from '../utils/config.js'
import { resolveTaskRouteClientConfigFromQuerySource } from '../utils/model/taskRouting.js'
import { getProviderKeyRegistryFromSettings } from '../utils/model/providerKeyRegistry.js'
import { logForDebugging } from '../utils/debug.js'

type StoredKeyUsage = NonNullable<
  ReturnType<typeof getCurrentProjectConfig>['providerKeyUsage']
>[string]

type ProviderKeyLimitHints = {
  windowSeconds?: number
  maxRequests?: number
  maxTotalTokens?: number
  maxUsd?: number
}

function parsePositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return undefined
}

function parsePositiveNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value.trim())
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return undefined
}

function getLimitHintsForKeyId(keyId: string): ProviderKeyLimitHints {
  const entry = getProviderKeyRegistryFromSettings().find(k => k.id === keyId)
  const limits = (entry?.limits ?? {}) as Record<string, unknown>
  return {
    windowSeconds: parsePositiveInt(limits.windowSeconds),
    maxRequests: parsePositiveInt(limits.maxRequests),
    maxTotalTokens: parsePositiveInt(limits.maxTotalTokens),
    maxUsd: parsePositiveNumber(limits.maxUsd),
  }
}

function getStoredUsage(): Record<string, StoredKeyUsage> {
  return getCurrentProjectConfig().providerKeyUsage ?? {}
}

export function getStoredProviderKeyUsageSnapshot(): Record<string, StoredKeyUsage> {
  ensureLoaded()
  return Object.fromEntries(usageCache.entries())
}

export function resetProviderKeyUsageMonitorForTests(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  loaded = false
  dirty = false
  exitHookRegistered = false
  usageCache.clear()
  saveCurrentProjectConfig(current => ({
    ...current,
    providerKeyUsage: {},
  }))
}

let loaded = false
let dirty = false
let persistTimer: NodeJS.Timeout | null = null
let exitHookRegistered = false
const usageCache = new Map<string, StoredKeyUsage>()

function ensureLoaded(): void {
  if (loaded) return
  loaded = true
  for (const [keyId, state] of Object.entries(getStoredUsage())) {
    usageCache.set(keyId, state)
  }
}

export function flushProviderKeyUsageToProjectConfig(): void {
  ensureLoaded()
  if (!dirty) return
  dirty = false

  const snapshot = Object.fromEntries(usageCache.entries())
  saveCurrentProjectConfig(current => ({
    ...current,
    providerKeyUsage: snapshot,
  }))
}

function schedulePersist(): void {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    flushProviderKeyUsageToProjectConfig()
  }, 15_000)
}

function resetWindow(now: number, provider: string, windowSeconds: number): StoredKeyUsage {
  return {
    provider,
    windowSeconds,
    windowStartMs: now,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedInputTokens: 0,
    estimatedOutputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    costUSD: 0,
    lastUpdatedAt: now,
  }
}

export function recordProviderKeyUsageFromAPISuccess(params: {
  querySource: string
  model: string
  usage: Usage
  costUSD: number
  estimatedInputTokens?: number
  estimatedOutputTokens?: number
}): void {
  try {
    ensureLoaded()
    const routeConfig = resolveTaskRouteClientConfigFromQuerySource(
      params.querySource,
    )

    const keyId = routeConfig.keyId?.trim()
    if (!keyId) {
      return
    }

    const provider = routeConfig.provider
    const now = Date.now()
    const hints = getLimitHintsForKeyId(keyId)
    const windowSeconds = hints.windowSeconds ?? 5 * 60 * 60

    // Light diagnostic for misconfigured key/model mapping.
    // This does not block the request; enforcement belongs in routing.
    if (hints.maxRequests || hints.maxTotalTokens || hints.maxUsd) {
      void params.model // reserved for future per-model usage breakdown
    }

    const currentState = usageCache.get(keyId)
    const shouldReset =
      !currentState ||
      currentState.provider !== provider ||
      currentState.windowSeconds !== windowSeconds ||
      now >= currentState.windowStartMs + windowSeconds * 1000

    const base = shouldReset
      ? resetWindow(now, provider, windowSeconds)
      : currentState

    const updated: StoredKeyUsage = {
      ...base,
      requests: base.requests + 1,
      inputTokens: base.inputTokens + (params.usage.input_tokens ?? 0),
      outputTokens: base.outputTokens + (params.usage.output_tokens ?? 0),
      estimatedInputTokens:
        (base.estimatedInputTokens ?? 0) +
        (params.usage.input_tokens > 0 ? 0 : (params.estimatedInputTokens ?? 0)),
      estimatedOutputTokens:
        (base.estimatedOutputTokens ?? 0) +
        (params.usage.output_tokens > 0 ? 0 : (params.estimatedOutputTokens ?? 0)),
      cacheReadInputTokens:
        base.cacheReadInputTokens + (params.usage.cache_read_input_tokens ?? 0),
      cacheCreationInputTokens:
        base.cacheCreationInputTokens +
        (params.usage.cache_creation_input_tokens ?? 0),
      costUSD: base.costUSD + (params.costUSD ?? 0),
      lastUpdatedAt: now,
    }

    usageCache.set(keyId, updated)
    dirty = true
    schedulePersist()

    if (!exitHookRegistered) {
      exitHookRegistered = true
      process.on('exit', () => {
        try {
          flushProviderKeyUsageToProjectConfig()
        } catch {
          // ignore
        }
      })
    }
  } catch (error) {
    logForDebugging(
      `[providerKeyUsage] failed to record usage: ${error instanceof Error ? error.message : 'unknown'}`,
    )
  }
}
