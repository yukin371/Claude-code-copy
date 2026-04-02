import {
  getProviderDefaultBaseUrls,
  getProviderDisplayName,
  getProviderFamily,
  PROVIDER_NAMES,
} from './providerMetadata.js'
import {
  getMainLoopProviderOverride,
  setMainLoopProviderOverride,
} from './sessionProviderOverride.js'
import {
  getTaskRouteExecutionTarget,
  type TaskRouteExecutionTarget,
  type TaskRouteProviderName,
} from './taskRouting.js'

export type MainLoopProviderSelection = TaskRouteProviderName | 'default'

export type MainLoopProviderState = {
  currentTarget: TaskRouteExecutionTarget
  baseTarget: TaskRouteExecutionTarget
  overrideProvider: TaskRouteProviderName | undefined
}

export function getMainLoopProviderState(): MainLoopProviderState {
  return {
    currentTarget: getTaskRouteExecutionTarget('main'),
    baseTarget: getTaskRouteExecutionTarget('main', {
      ignoreSessionOverride: true,
    }),
    overrideProvider: getMainLoopProviderOverride(),
  }
}

export function parseMainLoopProviderSelection(
  value: string,
): MainLoopProviderSelection | undefined {
  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return undefined
  }
  if (normalized === 'default') {
    return 'default'
  }
  return PROVIDER_NAMES.includes(normalized as TaskRouteProviderName)
    ? (normalized as TaskRouteProviderName)
    : undefined
}

export function applyMainLoopProviderSelection(
  selection: MainLoopProviderSelection,
): MainLoopProviderState {
  setMainLoopProviderOverride(
    selection === 'default' ? undefined : selection,
  )
  return getMainLoopProviderState()
}

export function formatProviderTargetLabel(
  target: TaskRouteExecutionTarget,
): string {
  return `${getProviderDisplayName(target.provider)} (${target.provider}, ${target.apiStyle})`
}

export function getProviderPickerDescription(
  provider: TaskRouteProviderName,
): string {
  const family =
    getProviderFamily(provider) === 'anthropic'
      ? 'Anthropic transport'
      : 'OpenAI-compatible transport'
  const defaultBaseUrl = getProviderDefaultBaseUrls(provider)[0]
  return defaultBaseUrl ? `${family} · ${defaultBaseUrl}` : family
}
