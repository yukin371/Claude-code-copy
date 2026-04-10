// Read-only registry of models declared in settings.providerKeys.
// Used to:
// - show a unified /model picker (no explicit /provider switching required)
// - infer the correct session provider/keyRef when a user selects a model
// - treat configured models as "valid" without making Anthropic validation calls

import { getSettings_DEPRECATED } from '../settings/settings.js'
import type { TaskRouteProviderName } from './taskRouting.js'

export type ConfiguredModelSource = {
  provider: TaskRouteProviderName
  keyRef: string
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
    if (typeof id !== 'string' || !id.trim()) continue
    if (typeof provider !== 'string' || !provider.trim()) continue
    if (!Array.isArray(models) || models.length === 0) continue

    const keyRef = id.trim()
    const normalizedProvider = provider.trim().toLowerCase() as TaskRouteProviderName

    for (const model of models) {
      if (typeof model !== 'string') continue
      const trimmed = model.trim()
      if (!trimmed) continue
      const list = index.get(trimmed) ?? []
      list.push({ provider: normalizedProvider, keyRef })
      index.set(trimmed, list)
    }
  }

  // Stable ordering helps deterministic selection when multiple keys provide the same model.
  for (const [model, sources] of index) {
    sources.sort((a, b) => {
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

export function pickPrimarySourceForModel(
  model: string,
): ConfiguredModelSource | undefined {
  const trimmed = model.trim()
  if (!trimmed) return undefined
  const sources = getConfiguredModelSources().get(trimmed)
  return sources && sources.length > 0 ? sources[0] : undefined
}

