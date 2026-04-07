import { z } from 'zod/v4'
import type { Tool } from '../../Tool.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import { VERIFY_PLAN_EXECUTION_TOOL_NAME } from './constants.js'

const inputSchema = z.strictObject({})

type InputSchema = typeof inputSchema

type Output = {
  available: false
  message: string
}

export const VerifyPlanExecutionTool: Tool<InputSchema, Output> = buildTool({
  name: VERIFY_PLAN_EXECUTION_TOOL_NAME,
  maxResultSizeChars: 4_000,
  description: async () =>
    'Plan execution verification is unavailable in this build.',
  prompt: async () =>
    'Plan execution verification is unavailable in this build.',
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
        message: 'Plan execution verification is unavailable in this build.',
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
