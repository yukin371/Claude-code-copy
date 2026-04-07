import { z } from 'zod/v4'
import type { Tool } from '../../Tool.js'
import { buildTool, type ToolDef } from '../../Tool.js'

const SUGGEST_BACKGROUND_PR_TOOL_NAME = 'SuggestBackgroundPR'
const inputSchema = z.strictObject({})

type InputSchema = typeof inputSchema

type Output = {
  available: false
  message: string
}

export const SuggestBackgroundPRTool: Tool<InputSchema, Output> = buildTool({
  name: SUGGEST_BACKGROUND_PR_TOOL_NAME,
  maxResultSizeChars: 4_000,
  description: async () =>
    'Background PR suggestion is unavailable in this build.',
  prompt: async () =>
    'Background PR suggestion is unavailable in this build.',
  get inputSchema(): InputSchema {
    return inputSchema
  },
  isEnabled() {
    return false
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  renderToolUseMessage() {
    return null
  },
  async call() {
    return {
      data: {
        available: false,
        message: 'Background PR suggestion is unavailable in this build.',
      },
    }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      type: 'tool_result',
      content: output.message,
      tool_use_id: toolUseID,
    }
  },
} satisfies ToolDef<InputSchema, Output>)
