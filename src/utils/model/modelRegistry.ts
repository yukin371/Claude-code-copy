import { getProviderDefaultApiStyle } from './providerMetadata.js'
import { getSettings_DEPRECATED } from '../settings/settings.js'
import type { TaskRouteApiStyle, TaskRouteProviderName } from './taskRouting.js'

type SimplifiedProviderEntry = {
  type?: unknown
  apiStyle?: unknown
  baseUrl?: unknown
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

export type ModelRegistrySource = {
  sourceId: string
  provider: TaskRouteProviderName
  apiStyle: TaskRouteApiStyle
  baseUrl?: string
  priority: number
  defaultSource: boolean
}

export type ModelRegistryEntry = {
  model: string
  sources: ModelRegistrySource[]
}

type ResolveConfiguredModelSourceIdParams = {
  model?: string
  provider?: TaskRouteProviderName
  baseUrl?: string
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

function normalizeProviderName(
  value: unknown,
): TaskRouteProviderName | undefined {
  const normalized = normalizeString(value)?.toLowerCase()
  switch (normalized) {
    case 'anthropic':
    case 'codex':
    case 'gemini':
    case 'glm':
    case 'minimax':
    case 'openai-compatible':
      return normalized as TaskRouteProviderName
    default:
      return undefined
  }
}

function getConfiguredProviderTransport(
  providers: Record<string, unknown> | undefined,
  providerAlias: string,
):
  | {
      provider: TaskRouteProviderName
      apiStyle: TaskRouteApiStyle
      baseUrl?: string
    }
  | undefined {
  const providerConfig = providers?.[providerAlias]
  if (!isRecord(providerConfig)) return undefined
  const entry = providerConfig as SimplifiedProviderEntry
  const provider = normalizeProviderName(entry.type)
  if (!provider) return undefined
  const apiStyle =
    normalizeString(entry.apiStyle) === 'anthropic'
      ? 'anthropic'
      : getProviderDefaultApiStyle(provider)
  return {
    provider,
    apiStyle: apiStyle === 'anthropic' ? 'anthropic' : 'openai-compatible',
    baseUrl: normalizeString(entry.baseUrl),
  }
}

function appendSource(
  index: Map<string, ModelRegistryEntry>,
  model: string,
  source: ModelRegistrySource,
): void {
  const current = index.get(model) ?? { model, sources: [] }
  current.sources.push(source)
  index.set(model, current)
}

function getModelSources(
  modelConfig: unknown,
): Array<{ providerAlias: string; priority: number }> {
  if (!isRecord(modelConfig)) return []
  const sourceEntries = Array.isArray(modelConfig.sources)
    ? modelConfig.sources.filter(isRecord)
    : []
  return sourceEntries
    .map(entry => {
      const source = entry as SimplifiedModelSourceEntry
      const providerAlias = normalizeString(source.provider)
      if (!providerAlias) return undefined
      return {
        providerAlias,
        priority: normalizeInteger(source.priority) ?? Number.MAX_SAFE_INTEGER,
      }
    })
    .filter(
      (
        entry,
      ): entry is {
        providerAlias: string
        priority: number
      } => !!entry,
    )
}

export function getConfiguredModelRegistry(): Map<string, ModelRegistryEntry> {
  const settings = (getSettings_DEPRECATED() || {}) as Record<string, unknown>
  const providers = isRecord(settings.providers) ? settings.providers : undefined
  const models = isRecord(settings.models) ? settings.models : undefined

  const index = new Map<string, ModelRegistryEntry>()
  const explicitlyDeclaredModels = new Set<string>()

  if (models) {
    for (const [modelName, modelConfig] of Object.entries(models)) {
      const normalizedModel = normalizeString(modelName)
      if (!normalizedModel) continue
      explicitlyDeclaredModels.add(normalizedModel)

      const sourceEntries = getModelSources(modelConfig)
      if (sourceEntries.length > 0) {
        const defaultSource =
          isRecord(modelConfig) &&
          normalizeString((modelConfig as SimplifiedModelEntry).defaultSource)

        for (const sourceEntry of sourceEntries) {
          const transport = getConfiguredProviderTransport(
            providers,
            sourceEntry.providerAlias,
          )
          if (!transport) continue
          appendSource(index, normalizedModel, {
            sourceId: sourceEntry.providerAlias,
            provider: transport.provider,
            apiStyle: transport.apiStyle,
            baseUrl: transport.baseUrl,
            priority: sourceEntry.priority,
            defaultSource: sourceEntry.providerAlias === defaultSource,
          })
        }
        continue
      }

      const providerAlias =
        typeof modelConfig === 'string'
          ? normalizeString(modelConfig)
          : isRecord(modelConfig)
            ? normalizeString((modelConfig as SimplifiedModelEntry).provider)
            : undefined
      if (!providerAlias) {
        appendSource(index, normalizedModel, {
          sourceId: 'declared-model',
          provider: 'openai-compatible',
          apiStyle: 'openai-compatible',
          priority: Number.MAX_SAFE_INTEGER,
          defaultSource: false,
        })
        continue
      }

      const transport = getConfiguredProviderTransport(providers, providerAlias)
      if (!transport) continue
      appendSource(index, normalizedModel, {
        sourceId: providerAlias,
        provider: transport.provider,
        apiStyle: transport.apiStyle,
        baseUrl: transport.baseUrl,
        priority: 1,
        defaultSource: true,
      })
    }
  }

  const providerKeys = settings.providerKeys
  if (Array.isArray(providerKeys)) {
    for (const entry of providerKeys) {
      if (!isRecord(entry)) continue
      const provider = normalizeProviderName(entry.provider)
      const keyRef = normalizeString(entry.id)
      const modelsAllowlist = Array.isArray(entry.models) ? entry.models : []
      if (!provider || !keyRef) continue
      for (const model of modelsAllowlist) {
        const normalizedModel = normalizeString(model)
        if (!normalizedModel) continue
        if (explicitlyDeclaredModels.has(normalizedModel)) continue
        appendSource(index, normalizedModel, {
          sourceId: keyRef,
          provider,
          apiStyle:
            getProviderDefaultApiStyle(provider) === 'anthropic'
              ? 'anthropic'
              : 'openai-compatible',
          baseUrl: normalizeString(entry.baseUrl),
          priority: normalizeInteger(entry.priority) ?? Number.MAX_SAFE_INTEGER,
          defaultSource: false,
        })
      }
    }
  }

  const taskRoutes = settings.taskRoutes
  if (isRecord(taskRoutes)) {
    for (const routeSettings of Object.values(taskRoutes)) {
      if (!isRecord(routeSettings)) continue
      const model = normalizeString(routeSettings.model)
      if (!model) continue
      if (explicitlyDeclaredModels.has(model)) continue
      const provider = normalizeProviderName(routeSettings.provider)
      appendSource(index, model, {
        sourceId: `task-route:${provider ?? 'unknown'}`,
        provider: provider ?? 'openai-compatible',
        apiStyle:
          normalizeString(routeSettings.apiStyle) === 'anthropic'
            ? 'anthropic'
            : 'openai-compatible',
        baseUrl: normalizeString(routeSettings.baseUrl),
        priority: Number.MAX_SAFE_INTEGER,
        defaultSource: false,
      })
    }
  }

  const taskRouteRules = settings.taskRouteRules
  if (Array.isArray(taskRouteRules)) {
    for (const rule of taskRouteRules) {
      if (!isRecord(rule)) continue
      const model = normalizeString(rule.model)
      if (!model) continue
      if (explicitlyDeclaredModels.has(model)) continue
      const provider = normalizeProviderName(rule.provider)
      appendSource(index, model, {
        sourceId: `task-route-rule:${provider ?? 'unknown'}`,
        provider: provider ?? 'openai-compatible',
        apiStyle:
          normalizeString(rule.apiStyle) === 'anthropic'
            ? 'anthropic'
            : 'openai-compatible',
        baseUrl: normalizeString(rule.baseUrl),
        priority: Number.MAX_SAFE_INTEGER,
        defaultSource: false,
      })
    }
  }

  for (const [model, entry] of index) {
    const deduped = new Map<string, ModelRegistrySource>()
    for (const source of entry.sources) {
      const key = [
        source.sourceId,
        source.provider,
        source.apiStyle,
        source.baseUrl ?? '',
      ].join('|')
      const existing = deduped.get(key)
      if (!existing) {
        deduped.set(key, source)
        continue
      }
      if (source.defaultSource && !existing.defaultSource) {
        deduped.set(key, source)
      }
    }
    const sources = Array.from(deduped.values()).sort((a, b) => {
      if (a.defaultSource !== b.defaultSource) {
        return a.defaultSource ? -1 : 1
      }
      if (a.priority !== b.priority) return a.priority - b.priority
      if (a.provider !== b.provider) return a.provider.localeCompare(b.provider)
      return a.sourceId.localeCompare(b.sourceId)
    })
    index.set(model, { model, sources })
  }

  return new Map(
    Array.from(index.entries()).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )
}

export function getConfiguredModelNames(): string[] {
  return Array.from(getConfiguredModelRegistry().keys())
}

export function resolveConfiguredModelSourceId(
  params: ResolveConfiguredModelSourceIdParams,
): string | undefined {
  const model = normalizeString(params.model)
  if (!model) return undefined

  const entry = getConfiguredModelRegistry().get(model)
  if (!entry) return undefined

  const normalizedBaseUrl = normalizeString(params.baseUrl)
  const providerMatches = entry.sources.filter(
    source => !params.provider || source.provider === params.provider,
  )
  if (providerMatches.length === 0) return undefined

  if (normalizedBaseUrl) {
    const baseUrlMatch = providerMatches.find(
      source => source.baseUrl === normalizedBaseUrl,
    )
    if (baseUrlMatch) return baseUrlMatch.sourceId
  }

  return providerMatches[0]?.sourceId
}
