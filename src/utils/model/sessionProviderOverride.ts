import type { TaskRouteProviderName } from './taskRouting.js'

let mainLoopProviderOverride: TaskRouteProviderName | undefined

export function getMainLoopProviderOverride():
  | TaskRouteProviderName
  | undefined {
  return mainLoopProviderOverride
}

export function setMainLoopProviderOverride(
  provider: TaskRouteProviderName | undefined,
): void {
  mainLoopProviderOverride = provider
}

export function resetMainLoopProviderOverrideForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      'resetMainLoopProviderOverrideForTests can only be called in tests',
    )
  }
  mainLoopProviderOverride = undefined
}
