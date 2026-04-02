type GrowthBookRefreshListener = () => void | Promise<void>

const refreshListeners = new Set<GrowthBookRefreshListener>()
const growthBookConfigOverrides = new Map<string, unknown>()

function notifyRefreshListeners(): void {
  for (const listener of refreshListeners) {
    try {
      void listener()
    } catch {
      // telemetry and remote experimentation are disabled
    }
  }
}

export function onGrowthBookRefresh(
  listener: GrowthBookRefreshListener,
): () => void {
  refreshListeners.add(listener)
  return () => {
    refreshListeners.delete(listener)
  }
}

export function hasGrowthBookEnvOverride(_feature: string): boolean {
  return false
}

export function getAllGrowthBookFeatures(): Record<string, unknown> {
  return Object.fromEntries(growthBookConfigOverrides)
}

export function getGrowthBookConfigOverrides(): Record<string, unknown> {
  return Object.fromEntries(growthBookConfigOverrides)
}

export function setGrowthBookConfigOverride(
  feature: string,
  value: unknown,
): void {
  growthBookConfigOverrides.set(feature, value)
  notifyRefreshListeners()
}

export function clearGrowthBookConfigOverrides(): void {
  if (growthBookConfigOverrides.size === 0) {
    return
  }
  growthBookConfigOverrides.clear()
  notifyRefreshListeners()
}

export function getApiBaseUrlHost(): string | undefined {
  try {
    const baseUrl = process.env.ANTHROPIC_BASE_URL
    return baseUrl ? new URL(baseUrl).host : undefined
  } catch {
    return undefined
  }
}

export async function initializeGrowthBook(): Promise<void> {}

export async function getFeatureValue_DEPRECATED<T>(
  feature: string,
  defaultValue: T,
): Promise<T> {
  return getFeatureValue_CACHED_MAY_BE_STALE(feature, defaultValue)
}

export function getFeatureValue_CACHED_MAY_BE_STALE<T>(
  feature: string,
  defaultValue: T,
): T {
  const override = growthBookConfigOverrides.get(feature)
  if (override !== undefined) {
    return override as T
  }

  return defaultValue
}

export function getFeatureValue_CACHED_WITH_REFRESH<T>(
  feature: string,
  defaultValue: T,
): T {
  return getFeatureValue_CACHED_MAY_BE_STALE(feature, defaultValue)
}

export function checkStatsigFeatureGate_CACHED_MAY_BE_STALE(
  gate: string,
): boolean {
  return getFeatureValue_CACHED_MAY_BE_STALE(gate, false)
}

export async function checkSecurityRestrictionGate(
  gate: string,
): Promise<boolean> {
  return checkStatsigFeatureGate_CACHED_MAY_BE_STALE(gate)
}

export async function checkGate_CACHED_OR_BLOCKING(
  gate: string,
): Promise<boolean> {
  return checkStatsigFeatureGate_CACHED_MAY_BE_STALE(gate)
}

export function refreshGrowthBookAfterAuthChange(): void {}

export function resetGrowthBook(): void {}

export async function refreshGrowthBookFeatures(): Promise<void> {}

export function setupPeriodicGrowthBookRefresh(): void {}

export function stopPeriodicGrowthBookRefresh(): void {}

export async function getDynamicConfig_BLOCKS_ON_INIT<T>(
  configName: string,
  defaultValue: T,
): Promise<T> {
  return getFeatureValue_CACHED_MAY_BE_STALE(configName, defaultValue)
}

export function getDynamicConfig_CACHED_MAY_BE_STALE<T>(
  configName: string,
  defaultValue: T,
): T {
  return getFeatureValue_CACHED_MAY_BE_STALE(configName, defaultValue)
}
