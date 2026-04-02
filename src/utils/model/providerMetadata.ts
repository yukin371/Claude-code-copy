import type { TaskRouteApiStyle, TaskRouteProviderName } from './taskRouting.js'
import { createRequire } from 'node:module'

export const PROVIDER_NAMES = [
  'anthropic',
  'codex',
  'gemini',
  'glm',
  'minimax',
  'openai-compatible',
] as const

type ProviderTransportMetadata = {
  family: 'anthropic' | 'openai-compatible'
  defaultApiStyle: TaskRouteApiStyle
  defaultBaseUrls: readonly string[]
  keyEnvNames: readonly string[]
  loadBalanceWeight: number
}

export type ProviderLoadBalanceStrategy =
  | 'fallback'
  | 'round-robin'
  | 'weighted'

export type ProviderLoadBalanceConfigSource = 'env' | 'settings' | 'default'

type ProviderLoadBalanceSettings = {
  openAIProviderStrategy?: string
  openAIProviderWeights?: Partial<Record<TaskRouteProviderName, number>>
}

export type ProviderLoadBalanceConfigSnapshot = {
  strategy: ProviderLoadBalanceStrategy
  strategySource: ProviderLoadBalanceConfigSource
  weightOverrides: Partial<Record<TaskRouteProviderName, number>>
  weightSource: ProviderLoadBalanceConfigSource
}

const PROVIDER_METADATA: Record<TaskRouteProviderName, ProviderTransportMetadata> = {
  anthropic: {
    family: 'anthropic',
    defaultApiStyle: 'anthropic',
    defaultBaseUrls: [],
    keyEnvNames: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY'],
    loadBalanceWeight: 0,
  },
  codex: {
    family: 'openai-compatible',
    defaultApiStyle: 'openai-compatible',
    defaultBaseUrls: ['https://api.openai.com/v1'],
    keyEnvNames: ['NEKO_CODE_CODEX_API_KEY', 'OPENAI_API_KEY'],
    loadBalanceWeight: 1,
  },
  gemini: {
    family: 'openai-compatible',
    defaultApiStyle: 'openai-compatible',
    defaultBaseUrls: ['https://generativelanguage.googleapis.com/v1beta/openai'],
    keyEnvNames: ['NEKO_CODE_GEMINI_API_KEY', 'GEMINI_API_KEY'],
    loadBalanceWeight: 1,
  },
  glm: {
    family: 'openai-compatible',
    defaultApiStyle: 'openai-compatible',
    defaultBaseUrls: ['https://open.bigmodel.cn/api/coding/paas/v4'],
    keyEnvNames: ['NEKO_CODE_GLM_API_KEY', 'GLM_API_KEY', 'ZAI_API_KEY'],
    loadBalanceWeight: 1,
  },
  minimax: {
    family: 'openai-compatible',
    defaultApiStyle: 'openai-compatible',
    defaultBaseUrls: ['https://api.minimaxi.com/v1'],
    keyEnvNames: ['NEKO_CODE_MINIMAX_API_KEY', 'MINIMAX_API_KEY'],
    loadBalanceWeight: 1,
  },
  'openai-compatible': {
    family: 'openai-compatible',
    defaultApiStyle: 'openai-compatible',
    defaultBaseUrls: ['https://api.openai.com/v1'],
    keyEnvNames: [
      'NEKO_CODE_OPENAI_COMPATIBLE_API_KEY',
      'OPENAI_API_KEY',
    ],
    loadBalanceWeight: 1,
  },
}

export function getProviderTransportMetadata(
  provider: TaskRouteProviderName,
): ProviderTransportMetadata {
  return PROVIDER_METADATA[provider] ?? PROVIDER_METADATA['openai-compatible']
}

export function getProviderDefaultApiStyle(
  provider: TaskRouteProviderName,
): TaskRouteApiStyle {
  return getProviderTransportMetadata(provider).defaultApiStyle
}

export function getProviderDefaultBaseUrls(
  provider: TaskRouteProviderName,
): readonly string[] {
  return getProviderTransportMetadata(provider).defaultBaseUrls
}

export function getProviderKeyEnvNames(
  provider: TaskRouteProviderName,
): readonly string[] {
  return getProviderTransportMetadata(provider).keyEnvNames
}

export function getProviderFamily(
  provider: TaskRouteProviderName,
): 'anthropic' | 'openai-compatible' {
  return getProviderTransportMetadata(provider).family
}

export function getProviderLoadBalanceWeight(
  provider: TaskRouteProviderName,
  settings?: ProviderLoadBalanceSettings,
): number {
  const override = getProviderWeightOverrides(settings)[provider]
  if (override !== undefined) {
    return override
  }
  return getProviderTransportMetadata(provider).loadBalanceWeight
}

export function getProviderLoadBalanceStrategy(
  settings?: ProviderLoadBalanceSettings,
): ProviderLoadBalanceStrategy {
  return getProviderLoadBalanceConfigSnapshot(settings).strategy
}

export function getOpenAICompatibleProviderOrder(
  preferredProvider: TaskRouteProviderName,
): TaskRouteProviderName[] {
  const compatibleProviders = PROVIDER_NAMES.filter(
    provider => getProviderFamily(provider) === 'openai-compatible',
  ) as TaskRouteProviderName[]
  const ordered = new Set<TaskRouteProviderName>()
  if (getProviderFamily(preferredProvider) === 'openai-compatible') {
    ordered.add(preferredProvider)
  }
  for (const provider of compatibleProviders) {
    ordered.add(provider)
  }
  return Array.from(ordered)
}

export function getProviderLoadBalanceConfigSnapshot(
  settings = getProviderLoadBalanceSettings(),
): ProviderLoadBalanceConfigSnapshot {
  const envStrategy = parseProviderLoadBalanceStrategy(
    process.env.NEKO_CODE_OPENAI_PROVIDER_STRATEGY,
  )
  const settingsStrategy = parseProviderLoadBalanceStrategy(
    settings?.openAIProviderStrategy,
  )
  const envWeightOverrides = parseProviderWeightOverridesFromString(
    process.env.NEKO_CODE_OPENAI_PROVIDER_WEIGHTS,
  )
  const settingsWeightOverrides = parseProviderWeightOverridesFromRecord(
    settings?.openAIProviderWeights,
  )

  return {
    strategy: envStrategy ?? settingsStrategy ?? 'fallback',
    strategySource: envStrategy
      ? 'env'
      : settingsStrategy
        ? 'settings'
        : 'default',
    weightOverrides:
      Object.keys(envWeightOverrides).length > 0
        ? envWeightOverrides
        : settingsWeightOverrides,
    weightSource:
      Object.keys(envWeightOverrides).length > 0
        ? 'env'
        : Object.keys(settingsWeightOverrides).length > 0
          ? 'settings'
          : 'default',
  }
}

function getProviderLoadBalanceSettings(): ProviderLoadBalanceSettings {
  try {
    const require = createRequire(import.meta.url)
    const settingsModule = require('../settings/settings.js') as {
      getSettings_DEPRECATED?: () => ProviderLoadBalanceSettings | undefined
    }
    return settingsModule.getSettings_DEPRECATED?.() ?? {}
  } catch {
    return {}
  }
}

function getProviderWeightOverrides(
  settings?: ProviderLoadBalanceSettings,
): Partial<Record<TaskRouteProviderName, number>> {
  return getProviderLoadBalanceConfigSnapshot(settings).weightOverrides
}

function parseProviderLoadBalanceStrategy(
  value?: string,
): ProviderLoadBalanceStrategy | undefined {
  const configured = value?.trim().toLowerCase()
  switch (configured) {
    case 'fallback':
    case 'round-robin':
    case 'weighted':
      return configured
    default:
      return undefined
  }
}

function parseProviderWeightOverridesFromString(
  raw?: string,
): Partial<Record<TaskRouteProviderName, number>> {
  if (!raw?.trim()) {
    return {}
  }

  const overrides: Partial<Record<TaskRouteProviderName, number>> = {}
  for (const entry of raw.split(/[\n,;|]/)) {
    const [providerPart, weightPart] = entry.split('=')
    const provider = providerPart?.trim().toLowerCase() as
      | TaskRouteProviderName
      | undefined
    const weight = Number.parseInt(weightPart?.trim() ?? '', 10)
    if (!provider || !PROVIDER_NAMES.includes(provider) || !Number.isFinite(weight)) {
      continue
    }
    overrides[provider] = Math.max(1, weight)
  }

  return overrides
}

function parseProviderWeightOverridesFromRecord(
  record?: Partial<Record<TaskRouteProviderName, number>>,
): Partial<Record<TaskRouteProviderName, number>> {
  if (!record) {
    return {}
  }

  const overrides: Partial<Record<TaskRouteProviderName, number>> = {}
  for (const provider of PROVIDER_NAMES) {
    const weight = record[provider]
    if (!Number.isFinite(weight)) {
      continue
    }
    overrides[provider] = Math.max(1, Math.trunc(weight))
  }
  return overrides
}
