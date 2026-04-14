import { isModelAlias } from './aliases.js'
import { pickPrimarySourceForModel } from './configuredModelRegistry.js'
import { setMainLoopKeyRefOverride } from './sessionKeyRefOverride.js'
import { setMainLoopProviderOverride } from './sessionProviderOverride.js'
import type { TaskRouteProviderName } from './taskRouting.js'

export function syncMainLoopRoutingForModelSelection(params: {
  model: string | null | undefined
  explicitProvider?: TaskRouteProviderName | undefined
}): void {
  const explicitProvider = params.explicitProvider
  if (explicitProvider) {
    setMainLoopProviderOverride(explicitProvider)
    setMainLoopKeyRefOverride(undefined)
    return
  }

  const modelValue = params.model?.trim()
  if (!modelValue) {
    setMainLoopProviderOverride(undefined)
    setMainLoopKeyRefOverride(undefined)
    return
  }

  const primary = pickPrimarySourceForModel(modelValue)
  if (primary) {
    setMainLoopProviderOverride(primary.provider)
    setMainLoopKeyRefOverride(primary.keyRef)
    return
  }

  if (
    isModelAlias(modelValue) ||
    modelValue === process.env.ANTHROPIC_CUSTOM_MODEL_OPTION
  ) {
    setMainLoopProviderOverride('anthropic')
    setMainLoopKeyRefOverride(undefined)
    return
  }

  setMainLoopProviderOverride(undefined)
  setMainLoopKeyRefOverride(undefined)
}
