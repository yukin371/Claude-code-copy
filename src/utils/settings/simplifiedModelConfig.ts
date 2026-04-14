import { getProviderDefaultApiStyle, PROVIDER_NAMES } from '../model/providerMetadata.js'
import type {
  SettingsJson,
} from './types.js'

const TASK_ROUTE_NAMES = [
  'main',
  'subagent',
  'frontend',
  'review',
  'explore',
  'plan',
  'guide',
  'statusline',
] as const

type TaskRouteName = (typeof TASK_ROUTE_NAMES)[number]
type ProviderName = (typeof PROVIDER_NAMES)[number]
type ProviderKeyEntry = NonNullable<SettingsJson['providerKeys']>[number]
type TaskRouteEntry = NonNullable<SettingsJson['taskRoutes']>[string]

type SimplifiedProviderEntry = {
  type?: unknown
  apiStyle?: unknown
  baseUrl?: unknown
  keyEnv?: unknown
  key?: unknown
  keys?: unknown
}

type SimplifiedProviderKeyEntry = {
  id?: unknown
  env?: unknown
  secret?: unknown
  priority?: unknown
  baseUrl?: unknown
  expiresAt?: unknown
  limits?: unknown
  context?: unknown
}

type SimplifiedModelEntry = {
  provider?: unknown
  sources?: unknown
  defaultSource?: unknown
}

type SimplifiedModelSourceEntry = {
  provider?: unknown
  priority?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.trunc(value)
}

function normalizeProviderName(value: unknown): ProviderName | undefined {
  const normalized = normalizeString(value)?.toLowerCase()
  if (!normalized) return undefined
  return PROVIDER_NAMES.includes(normalized as ProviderName)
    ? (normalized as ProviderName)
    : undefined
}

function resolveModelProviderAlias(modelConfig: unknown): string | undefined {
  if (typeof modelConfig === 'string') {
    return normalizeString(modelConfig)
  }
  if (!isRecord(modelConfig)) return undefined
  return normalizeString((modelConfig as SimplifiedModelEntry).provider)
}

function slugifySegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'model'
}

function getModelSourceEntries(
  modelConfig: unknown,
): Array<{ providerAlias: string; priority?: number }> {
  if (!isRecord(modelConfig)) return []

  const sourceEntries = Array.isArray(modelConfig.sources)
    ? modelConfig.sources.filter(isRecord)
    : []
  if (sourceEntries.length === 0) return []

  const normalized = sourceEntries
    .map(entry => {
      const source = entry as SimplifiedModelSourceEntry
      const providerAlias = normalizeString(source.provider)
      if (!providerAlias) return undefined
      return {
        providerAlias,
        priority: normalizeInteger(source.priority),
      }
    })
    .filter(entry => entry !== undefined)

  normalized.sort((a, b) => {
    const left = a.priority ?? Number.MAX_SAFE_INTEGER
    const right = b.priority ?? Number.MAX_SAFE_INTEGER
    if (left !== right) return left - right
    return a.providerAlias.localeCompare(b.providerAlias)
  })

  return normalized
}

function resolveDefaultModelProviderAlias(modelConfig: unknown): string | undefined {
  const direct = resolveModelProviderAlias(modelConfig)
  if (direct) return direct
  if (!isRecord(modelConfig)) return undefined

  const sourceEntries = getModelSourceEntries(modelConfig)
  if (sourceEntries.length === 0) return undefined

  const defaultSource = normalizeString(
    (modelConfig as SimplifiedModelEntry).defaultSource,
  )
  if (
    defaultSource &&
    sourceEntries.some(entry => entry.providerAlias === defaultSource)
  ) {
    return defaultSource
  }

  return sourceEntries[0]?.providerAlias
}

function buildGeneratedProviderKeys(
  providerAlias: string,
  provider: SimplifiedProviderEntry,
  models: string[],
): ProviderKeyEntry[] {
  const providerType = normalizeProviderName(provider.type)
  if (!providerType || models.length === 0) {
    return []
  }

  const keyEntries = Array.isArray(provider.keys)
    ? provider.keys.filter(isRecord)
    : []

  const sourceEntries =
    keyEntries.length > 0
      ? keyEntries
      : [
          {
            env: provider.keyEnv,
            secret: provider.key,
          },
        ]

  return sourceEntries.map((entry, index) => {
    const key = entry as SimplifiedProviderKeyEntry
    return {
      id: normalizeString(key.id) ?? `${providerAlias}-k${index + 1}`,
      provider: providerType,
      baseUrl: normalizeString(key.baseUrl) ?? normalizeString(provider.baseUrl),
      secretEnv: normalizeString(key.env),
      secret: normalizeString(key.secret),
      models: [...models],
      priority: normalizeInteger(key.priority) ?? index + 1,
      expiresAt: normalizeString(key.expiresAt),
      limits: isRecord(key.limits) ? key.limits : undefined,
      context: isRecord(key.context) ? key.context : undefined,
    }
  })
}

function buildGeneratedProviderKeysForModelSource(
  providerAlias: string,
  provider: SimplifiedProviderEntry,
  modelName: string,
  sourcePriority?: number,
): ProviderKeyEntry[] {
  const providerType = normalizeProviderName(provider.type)
  if (!providerType) {
    return []
  }

  const keyEntries = Array.isArray(provider.keys)
    ? provider.keys.filter(isRecord)
    : []

  const sourceEntries =
    keyEntries.length > 0
      ? keyEntries
      : [
          {
            env: provider.keyEnv,
            secret: provider.key,
          },
        ]

  const modelSlug = slugifySegment(modelName)
  const sourcePriorityBase = sourcePriority ?? 1

  return sourceEntries.map((entry, index) => {
    const key = entry as SimplifiedProviderKeyEntry
    const keyBaseId =
      normalizeString(key.id) ?? `${providerAlias}-k${index + 1}`
    const keyPriority = normalizeInteger(key.priority) ?? index + 1
    return {
      id: `${keyBaseId}-${modelSlug}`,
      provider: providerType,
      baseUrl: normalizeString(key.baseUrl) ?? normalizeString(provider.baseUrl),
      secretEnv: normalizeString(key.env),
      secret: normalizeString(key.secret),
      models: [modelName],
      priority: sourcePriorityBase * 1000 + keyPriority,
      expiresAt: normalizeString(key.expiresAt),
      limits: isRecord(key.limits) ? key.limits : undefined,
      context: isRecord(key.context) ? key.context : undefined,
    }
  })
}

function buildGeneratedTaskRoutes(
  providers: Record<string, unknown>,
  models: Record<string, unknown>,
  defaults: Record<string, unknown>,
): Record<string, TaskRouteEntry> {
  const taskRoutes: Record<string, TaskRouteEntry> = {}

  for (const route of TASK_ROUTE_NAMES) {
    const modelName = normalizeString(defaults[route])
    if (!modelName) continue

    const providerAlias = resolveDefaultModelProviderAlias(models[modelName])
    if (!providerAlias) continue

    const providerConfig = providers[providerAlias]
    if (!isRecord(providerConfig)) continue

    const providerType = normalizeProviderName(
      (providerConfig as SimplifiedProviderEntry).type,
    )
    if (!providerType) continue

    const apiStyle =
      normalizeString((providerConfig as SimplifiedProviderEntry).apiStyle) ??
      getProviderDefaultApiStyle(providerType)

    taskRoutes[route] = {
      provider: providerType,
      apiStyle: apiStyle === 'anthropic' ? 'anthropic' : 'openai-compatible',
      model: modelName,
      baseUrl: normalizeString((providerConfig as SimplifiedProviderEntry).baseUrl),
    }
  }

  return taskRoutes
}

function mergeProviderKeys(
  generated: ProviderKeyEntry[],
  explicit: unknown,
): unknown {
  if (!Array.isArray(explicit)) {
    return generated
  }

  const explicitIds = new Set(
    explicit
      .filter(isRecord)
      .map(entry => normalizeString(entry.id))
      .filter((id): id is string => !!id),
  )

  return [
    ...generated.filter(entry => !explicitIds.has(entry.id)),
    ...explicit,
  ]
}

function mergeTaskRoutes(
  generated: Record<string, TaskRouteEntry>,
  explicit: unknown,
): unknown {
  if (!isRecord(explicit)) {
    return generated
  }

  const merged: Record<string, unknown> = { ...generated }
  for (const [route, value] of Object.entries(explicit)) {
    if (isRecord(value) && isRecord(merged[route])) {
      merged[route] = {
        ...merged[route],
        ...value,
      }
      continue
    }
    merged[route] = value
  }

  return merged
}

export function normalizeSimplifiedModelConfig(
  input: unknown,
): unknown {
  if (!isRecord(input)) return input

  const providers = isRecord(input.providers) ? input.providers : undefined
  const models = isRecord(input.models) ? input.models : undefined
  const defaults = isRecord(input.defaults) ? input.defaults : undefined

  if (!providers && !models && !defaults) {
    return input
  }

  const generatedProviderKeys: ProviderKeyEntry[] = []
  if (providers && models) {
    const legacyModelsByProvider = new Map<string, string[]>()
    for (const [modelName, modelConfig] of Object.entries(models)) {
      const normalizedModel = normalizeString(modelName)
      if (!normalizedModel) continue

      const sourceEntries = getModelSourceEntries(modelConfig)
      if (sourceEntries.length > 0) {
        for (const sourceEntry of sourceEntries) {
          const providerConfig = providers[sourceEntry.providerAlias]
          if (!isRecord(providerConfig)) continue
          generatedProviderKeys.push(
            ...buildGeneratedProviderKeysForModelSource(
              sourceEntry.providerAlias,
              providerConfig as SimplifiedProviderEntry,
              normalizedModel,
              sourceEntry.priority,
            ),
          )
        }
        continue
      }

      const providerAlias = resolveModelProviderAlias(modelConfig)
      if (!providerAlias) continue
      const list = legacyModelsByProvider.get(providerAlias) ?? []
      list.push(normalizedModel)
      legacyModelsByProvider.set(providerAlias, list)
    }

    for (const [providerAlias, providerConfig] of Object.entries(providers)) {
      if (!isRecord(providerConfig)) continue
      generatedProviderKeys.push(
        ...buildGeneratedProviderKeys(
          providerAlias,
          providerConfig as SimplifiedProviderEntry,
          legacyModelsByProvider.get(providerAlias) ?? [],
        ),
      )
    }
  }

  const generatedTaskRoutes =
    providers && models && defaults
      ? buildGeneratedTaskRoutes(providers, models, defaults)
      : {}

  const generatedModel = defaults ? normalizeString(defaults.main) : undefined

  const normalized: Record<string, unknown> = { ...input }
  if (generatedProviderKeys.length > 0) {
    normalized.providerKeys = mergeProviderKeys(
      generatedProviderKeys,
      input.providerKeys,
    )
  }
  if (Object.keys(generatedTaskRoutes).length > 0) {
    normalized.taskRoutes = mergeTaskRoutes(generatedTaskRoutes, input.taskRoutes)
  }
  if (input.model === undefined && generatedModel) {
    normalized.model = generatedModel
  }

  return normalized
}
