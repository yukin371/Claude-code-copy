// Read-only registry of models declared in settings.providerKeys.
// Used to:
// - show a unified /model picker (no explicit /provider switching required)
// - infer the correct session provider/keyRef when a user selects a model
// - treat configured models as "valid" without making Anthropic validation calls

import { getSettings_DEPRECATED } from '../settings/settings.js'
import { resolveProviderKeyRef } from './providerKeyRegistry.js'
import type { TaskRouteProviderName } from './taskRouting.js'

export type ConfiguredModelSource = {
  provider: TaskRouteProviderName
  keyRef: string
  priority: number
}

export function getConfiguredModelSources(): Map<string, ConfiguredModelSource[]> {
  const settings = (getSettings_DEPRECATED() || {}) as Record<string, unknown>
  const providerKeys = settings.providerKeys

  const index = new Map<string, ConfiguredModelSource[]>()
  if (!Array.isArray(providerKeys)) return index

  for (const entry of providerKeys) {
    if (!entry || typeof entry !== 'object') continue
    const id = (entry as { id?: unknown }).id
    const provider = (entry as { provider?: unknown }).provider
    const models = (entry as { models?: unknown }).models
    const priority = (entry as { priority?: unknown }).priority
    if (typeof id !== 'string' || !id.trim()) continue
    if (typeof provider !== 'string' || !provider.trim()) continue
    if (!Array.isArray(models) || models.length === 0) continue

    const keyRef = id.trim()
    const normalizedProvider = provider.trim().toLowerCase() as TaskRouteProviderName
    const normalizedPriority =
      typeof priority === 'number' && Number.isFinite(priority)
        ? Math.trunc(priority)
        : Number.MAX_SAFE_INTEGER

    for (const model of models) {
      if (typeof model !== 'string') continue
      const trimmed = model.trim()
      if (!trimmed) continue
      const list = index.get(trimmed) ?? []
      list.push({
        provider: normalizedProvider,
        keyRef,
        priority: normalizedPriority,
      })
      index.set(trimmed, list)
    }
  }

  // Stable ordering helps deterministic selection when multiple keys provide the same model.
  for (const [model, sources] of index) {
    sources.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      if (a.provider !== b.provider) return a.provider.localeCompare(b.provider)
      return a.keyRef.localeCompare(b.keyRef)
    })
    index.set(model, sources)
  }

  return index
}

export function isModelDeclaredInProviderKeys(model: string): boolean {
  const trimmed = model.trim()
  if (!trimmed) return false
  return getConfiguredModelSources().has(trimmed)
}

export function getConfiguredSourcesForModel(
  model: string,
  provider?: TaskRouteProviderName,
): ConfiguredModelSource[] {
  const trimmed = model.trim()
  if (!trimmed) return []
  const sources = getConfiguredModelSources().get(trimmed) ?? []
  if (!provider) return [...sources]
  return sources.filter(source => source.provider === provider)
}

export function pickPrimarySourceForModel(
  model: string,
): ConfiguredModelSource | undefined {
  const trimmed = model.trim()
  if (!trimmed) return undefined
  const sources = getConfiguredSourcesForModel(trimmed)
  if (!sources || sources.length === 0) return undefined

  // Prefer a source whose keyRef can actually resolve right now. This keeps
  // `/model <name>` provider-agnostic for users even when multiple keys expose
  // the same model and one of them is currently unset or expired.
  for (const source of sources) {
    const resolution = resolveProviderKeyRef({
      keyRef: source.keyRef,
      expectedProvider: source.provider,
      model: trimmed,
    })
    if (resolution.status === 'ok') {
      return source
    }
  }

  return sources[0]
}
