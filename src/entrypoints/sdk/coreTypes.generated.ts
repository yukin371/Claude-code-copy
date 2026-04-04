import type { PermissionMode } from '../../types/permissions.js'

// This repository snapshot is missing the generated SDK type exports.
// These hand-written placeholders keep source-mode CLI and editor tooling
// usable until the real generator output is restored.

type SDKLooseRecord = Record<string, unknown>

type SDKContentBlock = {
  type: string
  text?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  thinking?: string
  data?: string
}

type SDKMessagePayload = {
  role?: 'assistant' | 'user' | 'system'
  content: string | SDKContentBlock[]
}

type SDKAssistantPayload = SDKMessagePayload & {
  id: string
}

type SDKBaseMessage = SDKLooseRecord & {
  type: string
  uuid?: string
  session_id?: string
  sessionId?: string
  timestamp?: string | number
}

export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'Notification'
  | 'UserPromptSubmit'
  | 'SessionStart'
  | 'SessionEnd'
  | 'Stop'
  | 'StopFailure'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreCompact'
  | 'PostCompact'
  | 'PermissionRequest'
  | 'PermissionDenied'
  | 'Setup'
  | 'TeammateIdle'
  | 'TaskCreated'
  | 'TaskCompleted'
  | 'Elicitation'
  | 'ElicitationResult'
  | 'ConfigChange'
  | 'WorktreeCreate'
  | 'WorktreeRemove'
  | 'InstructionsLoaded'
  | 'CwdChanged'
  | 'FileChanged'

export type PermissionResult =
  | {
      behavior: 'allow'
      updatedInput?: Record<string, unknown>
      updatedPermissions?: unknown[]
      toolUseID?: string
      decisionClassification?:
        | 'user_temporary'
        | 'user_permanent'
        | 'user_reject'
    }
  | {
      behavior: 'deny'
      message: string
      interrupt?: boolean
      toolUseID?: string
      decisionClassification?:
        | 'user_temporary'
        | 'user_permanent'
        | 'user_reject'
    }

export type ModelUsage = SDKLooseRecord & {
  inputTokens?: number
  outputTokens?: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
  webSearchRequests?: number
  costUSD?: number
  contextWindow?: number
  maxOutputTokens?: number
}

export type SDKAssistantMessageError = SDKLooseRecord & {
  message?: string
  type?: string
}

export type SDKPermissionDenial = {
  tool_name: string
  tool_use_id: string
  tool_input: Record<string, unknown>
}

export type SDKUserMessage = SDKBaseMessage & {
  type: 'user'
  session_id: string
  message: SDKMessagePayload
  parent_tool_use_id: string | null
  isSynthetic?: boolean
  tool_use_result?: unknown
  priority?: 'now' | 'next' | 'later'
}

export type SDKAssistantMessage = SDKBaseMessage & {
  type: 'assistant'
  session_id: string
  message: SDKAssistantPayload
  parent_tool_use_id: string | null
  error?: SDKAssistantMessageError
}

export type SDKCompactMetadata = {
  trigger?: string
  pre_tokens?: number
  preserved_segment?: {
    head_uuid?: string
    anchor_uuid?: string
    tail_uuid?: string
  }
}

export type SDKStatus = 'compacting' | null | string

export type SDKSystemMessage = SDKBaseMessage & {
  type: 'system'
  subtype: string
  model?: string
  status?: SDKStatus
  permissionMode?: PermissionMode
  slash_commands?: string[]
  task_id?: string
  compact_metadata?: SDKCompactMetadata
}

export type SDKCompactBoundaryMessage = SDKSystemMessage & {
  subtype: 'compact_boundary'
  compact_metadata: SDKCompactMetadata
}

export type SDKPostTurnSummaryMessage = SDKSystemMessage & {
  subtype: 'post_turn_summary'
  summary?: string
}

export type SDKStatusMessage = SDKSystemMessage & {
  subtype: 'status'
  status: SDKStatus
}

export type SDKToolProgressMessage = SDKBaseMessage & {
  type: 'tool_progress'
  tool_name: string
  tool_use_id: string
  elapsed_time_seconds: number
}

export type SDKRateLimitInfo = {
  status: 'allowed' | 'allowed_warning' | 'rejected'
  resetsAt?: number
  rateLimitType?:
    | 'five_hour'
    | 'seven_day'
    | 'seven_day_opus'
    | 'seven_day_sonnet'
    | 'overage'
  utilization?: number
  overageStatus?: 'allowed' | 'allowed_warning' | 'rejected'
  overageResetsAt?: number
  overageDisabledReason?: string
  isUsingOverage?: boolean
  surpassedThreshold?: number
}

export type SDKPartialAssistantMessage = SDKBaseMessage & {
  type: 'stream_event'
  uuid: string
  session_id: string
  parent_tool_use_id: string | null
  event:
    | {
        type: 'message_start'
        message: { id: string }
      }
    | {
        type: 'content_block_delta'
        index: number
        delta:
          | {
              type: 'text_delta'
              text: string
            }
          | (SDKLooseRecord & { type: string })
      }
    | (SDKLooseRecord & {
        type: string
        delta?: SDKLooseRecord
        message?: SDKLooseRecord & { id?: string }
        index?: number
      })
}

export type SDKResultSuccess = SDKBaseMessage & {
  type: 'result'
  subtype: 'success'
  duration_ms: number
  duration_api_ms: number
  is_error: boolean
  num_turns: number
  result: string
  stop_reason: string | null
  total_cost_usd: number
  usage: SDKLooseRecord
  modelUsage: Record<string, ModelUsage>
  permission_denials: Array<SDKLooseRecord>
  structured_output?: unknown
  fast_mode_state?: SDKLooseRecord
}

export type SDKResultError = SDKBaseMessage & {
  type: 'result'
  subtype:
    | 'error_during_execution'
    | 'error_max_turns'
    | 'error_max_budget_usd'
    | 'error_max_structured_output_retries'
  duration_ms: number
  duration_api_ms: number
  is_error: boolean
  num_turns: number
  stop_reason: string | null
  total_cost_usd: number
  usage: SDKLooseRecord
  modelUsage: Record<string, ModelUsage>
  permission_denials: Array<SDKLooseRecord>
  errors?: string[]
  fast_mode_state?: SDKLooseRecord
}

export type SDKResultMessage = SDKResultSuccess | SDKResultError

type SDKMiscMessage =
  | (SDKBaseMessage & {
      type:
        | 'auth_status'
        | 'rate_limit_event'
        | 'tool_use_summary'
        | 'prompt_suggestion'
        | 'files_persisted'
    })
  | SDKPostTurnSummaryMessage
  | SDKStatusMessage
  | SDKCompactBoundaryMessage

export type SDKMessage =
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKResultMessage
  | SDKSystemMessage
  | SDKPartialAssistantMessage
  | SDKToolProgressMessage
  | SDKMiscMessage

export type SDKSessionInfo = SDKLooseRecord & {
  sessionId?: string
  session_id?: string
  title?: string
}

export {}
