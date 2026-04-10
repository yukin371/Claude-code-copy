import { APIUserAbortError } from '@anthropic-ai/sdk'
import { getEmptyToolPermissionContext } from '../Tool.js'
import type { Message } from '../types/message.js'
import { logForDebugging } from '../utils/debug.js'
import {
  createUserMessage,
  getAssistantMessageText,
} from '../utils/messages.js'
import { getSmallFastModel } from '../utils/model/model.js'
import { asSystemPrompt } from '../utils/systemPromptType.js'
import { queryModelWithoutStreaming } from './api/claude.js'
import { getSessionMemoryContent } from './SessionMemory/sessionMemoryUtils.js'

// Handoff summary needs recent context — avoid prompt-too-long on large sessions.
const RECENT_MESSAGE_WINDOW = 50

function buildHandoffPrompt(params: {
  keyId: string
  usedPercent: number
  resetsAtIso: string
  memory: string | null
}): string {
  const memoryBlock = params.memory
    ? `Session memory (broader context):\n${params.memory}\n\n`
    : ''

  return (
    memoryBlock +
    `We are approaching a quota/budget limit for provider key '${params.keyId}' (used ${params.usedPercent}% in the current window; resets at ${params.resetsAtIso}).\n\n` +
    `Write a handoff note so the user can safely pause now and resume later.\n` +
    `Output Markdown with these exact headings:\n` +
    `## Goal\n` +
    `## Current State\n` +
    `## Next Steps\n` +
    `## Key Files\n` +
    `## Risks / Constraints\n\n` +
    `Constraints:\n` +
    `- Keep it concise.\n` +
    `- Prefer concrete next steps over history/recaps.\n` +
    `- If you mention files, include absolute paths when available.\n` +
    `- Do not include secrets.\n`
  )
}

export async function generateQuotaHandoffSummary(params: {
  messages: readonly Message[]
  signal: AbortSignal
  keyId: string
  usedPercent: number
  resetsAtIso: string
}): Promise<string | null> {
  if (params.messages.length === 0) return null

  try {
    const memory = await getSessionMemoryContent()
    const recent = params.messages.slice(-RECENT_MESSAGE_WINDOW)
    recent.push(
      createUserMessage({
        content: buildHandoffPrompt({
          memory,
          keyId: params.keyId,
          usedPercent: params.usedPercent,
          resetsAtIso: params.resetsAtIso,
        }),
      }),
    )

    const response = await queryModelWithoutStreaming({
      messages: recent,
      systemPrompt: asSystemPrompt([]),
      thinkingConfig: { type: 'disabled' },
      tools: [],
      signal: params.signal,
      options: {
        getToolPermissionContext: async () => getEmptyToolPermissionContext(),
        model: getSmallFastModel(),
        toolChoice: undefined,
        isNonInteractiveSession: false,
        hasAppendSystemPrompt: false,
        agents: [],
        querySource: 'quota_handoff',
        mcpTools: [],
        skipCacheWrite: true,
      },
    })

    if (response.isApiErrorMessage) {
      logForDebugging(
        `[quotaHandoff] API error: ${getAssistantMessageText(response)}`,
      )
      return null
    }

    return getAssistantMessageText(response)
  } catch (err) {
    if (err instanceof APIUserAbortError || params.signal.aborted) {
      return null
    }
    logForDebugging(`[quotaHandoff] generation failed: ${err}`)
    return null
  }
}

