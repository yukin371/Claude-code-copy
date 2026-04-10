import type { TaskRouteName } from './taskRouting.js'

let mainLoopKeyRefOverride: string | undefined

export function getTaskRouteKeyRefOverride(
  route: TaskRouteName,
): string | undefined {
  if (route !== 'main') return undefined
  return mainLoopKeyRefOverride
}

export function setMainLoopKeyRefOverride(keyRef: string | undefined): void {
  const trimmed = keyRef?.trim()
  mainLoopKeyRefOverride = trimmed ? trimmed : undefined
}

export function resetMainLoopKeyRefOverrideForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      'resetMainLoopKeyRefOverrideForTests can only be called in tests',
    )
  }
  mainLoopKeyRefOverride = undefined
}

