import { getConfigEnvironmentVariable } from '../managedEnv.js'
import { getSettings_DEPRECATED } from '../settings/settings.js'

export type ProviderKeyRegistryEntry = {
  id: string
  provider: string
  baseUrl?: string
  secretEnv?: string
  secret?: string
  models?: string[]
  priority?: number
  expiresAt?: string
  limits?: Record<string, unknown>
  context?: Record<string, unknown>
}

export type ProviderKeyRefStatus =
  | 'ok'
  | 'missing'
  | 'provider_mismatch'
  | 'expired'
  | 'model_denied'
  | 'secret_missing'

export type ProviderKeyRefResolution = {
  status: ProviderKeyRefStatus
  entry?: ProviderKeyRegistryEntry
  apiKey?: string
  baseUrl?: string
  secretSource?: 'env' | 'inline'
}

export function getProviderKeyRegistryFromSettings(): ProviderKeyRegistryEntry[] {
  return getSettings_DEPRECATED()?.providerKeys ?? []
}

export function resolveProviderKeyRef(params: {
  keyRef: string
  expectedProvider: string
  model?: string
}): ProviderKeyRefResolution {
  const keyRef = params.keyRef.trim()
  if (!keyRef) return { status: 'missing' }

  const entry = getProviderKeyRegistryFromSettings().find(k => k.id === keyRef)
  if (!entry) return { status: 'missing' }

  const expected = params.expectedProvider.trim().toLowerCase()
  const actual = entry.provider?.trim().toLowerCase()
  if (actual && expected && actual !== expected) {
    return { status: 'provider_mismatch', entry }
  }

  if (entry.expiresAt) {
    const epoch = Date.parse(entry.expiresAt)
    if (Number.isFinite(epoch) && epoch > 0 && Date.now() > epoch) {
      return { status: 'expired', entry }
    }
  }

  if (Array.isArray(entry.models) && entry.models.length > 0 && params.model) {
    const model = params.model.trim()
    if (model && !entry.models.includes(model)) {
      return { status: 'model_denied', entry }
    }
  }

  const envName = entry.secretEnv?.trim()
  const baseUrl = entry.baseUrl?.trim()
  if (envName) {
    const apiKey = getConfigEnvironmentVariable(envName)
    return apiKey
      ? { status: 'ok', entry, apiKey, baseUrl, secretSource: 'env' }
      : { status: 'secret_missing', entry }
  }

  const inline = entry.secret?.trim()
  if (inline) {
    return {
      status: 'ok',
      entry,
      apiKey: inline,
      baseUrl,
      secretSource: 'inline',
    }
  }

  return { status: 'secret_missing', entry }
}
