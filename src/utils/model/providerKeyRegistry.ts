import { createRequire } from 'node:module'

export type ProviderKeyRegistryEntry = {
  id: string
  provider: string
  secretEnv?: string
  secret?: string
  models?: string[]
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
  secretSource?: 'env' | 'inline'
}

export function getProviderKeyRegistryFromSettings(): ProviderKeyRegistryEntry[] {
  try {
    const require = createRequire(import.meta.url)
    const settingsModule = require('../settings/settings.js') as {
      getSettings_DEPRECATED?: () => {
        providerKeys?: ProviderKeyRegistryEntry[]
      }
    }
    return settingsModule.getSettings_DEPRECATED?.()?.providerKeys ?? []
  } catch {
    return []
  }
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
  if (envName) {
    const apiKey = process.env[envName]?.trim()
    return apiKey
      ? { status: 'ok', entry, apiKey, secretSource: 'env' }
      : { status: 'secret_missing', entry }
  }

  const inline = entry.secret?.trim()
  if (inline) {
    return { status: 'ok', entry, apiKey: inline, secretSource: 'inline' }
  }

  return { status: 'secret_missing', entry }
}
