import { z } from 'zod/v4'
import type { Tool } from '../../Tool.js'

export const TungstenTool = {
  name: 'TungstenTool',
  inputSchema: z.object({}),
  maxResultSizeChars: 0,
  async call() {
    return {
      type: 'tool_result',
      data: { output: 'TungstenTool is unavailable in this reverse-restored snapshot.' },
    }
  },
  async description() {
    return 'Unavailable placeholder tool'
  },
  isConcurrencySafe() {
    return true
  },
  isEnabled() {
    return false
  },
  isReadOnly() {
    return true
  },
} as unknown as Tool

export function clearSessionsWithTungstenUsage(): void {}

export function resetInitializationState(): void {}
