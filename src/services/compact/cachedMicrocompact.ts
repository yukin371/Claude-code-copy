export type CacheEditsBlock = {
  type: 'cache_edits'
  edits: Array<{
    type: 'delete'
    cache_reference: string
  }>
}

export type PinnedCacheEdits = {
  userMessageIndex: number
  block: CacheEditsBlock
}

export type CachedMCState = {
  pinnedEdits: PinnedCacheEdits[]
  registeredTools: Set<string>
  toolOrder: string[]
  deletedRefs: Set<string>
}

export function isCachedMicrocompactEnabled(): boolean {
  return false
}

export function isModelSupportedForCacheEditing(_model: string): boolean {
  return false
}

export function getCachedMCConfig(): {
  supportedModels: string[]
  triggerThreshold: number
  keepRecent: number
} {
  return { supportedModels: [], triggerThreshold: 0, keepRecent: 0 }
}

export function createCachedMCState(): CachedMCState {
  return {
    pinnedEdits: [],
    registeredTools: new Set<string>(),
    toolOrder: [],
    deletedRefs: new Set<string>(),
  }
}

export function markToolsSentToAPI(_state: CachedMCState): void {}

export function resetCachedMCState(state: CachedMCState): void {
  state.pinnedEdits = []
  state.registeredTools.clear()
}

export function registerToolResult(state: CachedMCState, toolUseId: string): void {
  state.registeredTools.add(toolUseId)
  state.toolOrder.push(toolUseId)
}

export function registerToolMessage(
  _state: CachedMCState,
  _groupIds: string[],
): void {}

export function getToolResultsToDelete(_state: CachedMCState): string[] {
  return []
}

export function createCacheEditsBlock(
  _state: CachedMCState,
  toolsToDelete: string[],
): CacheEditsBlock | null {
  return toolsToDelete.length > 0
    ? {
        type: 'cache_edits',
        edits: toolsToDelete.map(toolUseId => ({
          type: 'delete',
          cache_reference: toolUseId,
        })),
      }
    : null
}
