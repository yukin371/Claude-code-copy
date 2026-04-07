// Minimal runtime-safe SDK control type placeholders for this repository
// snapshot. They intentionally model the real control protocol closely enough
// for source-mode CLI development until the generated types are restored.

import type {
  JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js'
import type {
  SDKMessage,
  SDKPartialAssistantMessage,
  SDKPostTurnSummaryMessage,
} from './coreTypes.js'
import type { PermissionMode } from '../../types/permissions.js'
import type { PermissionUpdate } from '../../utils/permissions/PermissionUpdateSchema.js'

type SDKLooseRecord = Record<string, unknown>

type SDKHookCallbackMatcher = {
  matcher?: string
  hookCallbackIds: string[]
  timeout?: number
}

type SDKProcessTransportConfig =
  | {
      type?: 'stdio'
      command: string
      args?: string[]
      env?: Record<string, string>
    }
  | {
      type: 'sse'
      url: string
      headers?: Record<string, string>
    }
  | {
      type: 'http'
      url: string
      headers?: Record<string, string>
    }
  | {
      type: 'sdk'
      name: string
    }

type SDKNamedControlRequest<
  TSubtype extends string,
  TExtra extends SDKLooseRecord = {},
> = {
  subtype: TSubtype
} & TExtra

export type SDKControlPermissionRequest = SDKNamedControlRequest<
  'can_use_tool',
  {
    tool_name: string
    input: Record<string, unknown>
    permission_suggestions?: PermissionUpdate[]
    blocked_path?: string
    decision_reason?: string
    title?: string
    display_name?: string
    tool_use_id: string
    agent_id?: string
    description?: string
  }
>

export type SDKControlInterruptRequest = SDKNamedControlRequest<'interrupt'>

export type SDKControlEndSessionRequest = SDKNamedControlRequest<
  'end_session',
  {
    reason?: string
  }
>

export type SDKControlInitializeRequest = SDKNamedControlRequest<
  'initialize',
  {
    hooks?: Record<string, SDKHookCallbackMatcher[]>
    sdkMcpServers?: string[]
    jsonSchema?: Record<string, unknown>
    systemPrompt?: string
    appendSystemPrompt?: string
    agents?: Record<string, unknown>
    promptSuggestions?: boolean
    agentProgressSummaries?: boolean
  }
>

export type SDKControlSetPermissionModeRequest = SDKNamedControlRequest<
  'set_permission_mode',
  {
    mode: PermissionMode
    ultraplan?: boolean
  }
>

export type SDKControlSetModelRequest = SDKNamedControlRequest<
  'set_model',
  {
    model?: string
  }
>

export type SDKControlSetMaxThinkingTokensRequest = SDKNamedControlRequest<
  'set_max_thinking_tokens',
  {
    max_thinking_tokens: number | null
  }
>

export type SDKControlMcpStatusRequest =
  SDKNamedControlRequest<'mcp_status'>

export type SDKControlGetContextUsageRequest =
  SDKNamedControlRequest<'get_context_usage'>

export type SDKControlHookCallbackRequest = SDKNamedControlRequest<
  'hook_callback',
  {
    callback_id: string
    input: Record<string, unknown>
    tool_use_id?: string
  }
>

export type SDKControlMcpMessageRequest = SDKNamedControlRequest<
  'mcp_message',
  {
    server_name: string
    message: JSONRPCMessage
  }
>

export type SDKControlRewindFilesRequest = SDKNamedControlRequest<
  'rewind_files',
  {
    user_message_id: string
    dry_run?: boolean
  }
>

export type SDKControlCancelAsyncMessageRequest = SDKNamedControlRequest<
  'cancel_async_message',
  {
    message_uuid: string
  }
>

export type SDKControlSeedReadStateRequest = SDKNamedControlRequest<
  'seed_read_state',
  {
    path: string
    mtime: number
  }
>

export type SDKControlMcpSetServersRequest = SDKNamedControlRequest<
  'mcp_set_servers',
  {
    servers: Record<string, SDKProcessTransportConfig>
  }
>

export type SDKControlReloadPluginsRequest =
  SDKNamedControlRequest<'reload_plugins'>

export type SDKControlMcpReconnectRequest = SDKNamedControlRequest<
  'mcp_reconnect',
  {
    serverName: string
  }
>

export type SDKControlMcpToggleRequest = SDKNamedControlRequest<
  'mcp_toggle',
  {
    serverName: string
    enabled: boolean
  }
>

export type SDKControlChannelEnableRequest = SDKNamedControlRequest<
  'channel_enable',
  {
    serverName: string
  }
>

export type SDKControlMcpAuthenticateRequest = SDKNamedControlRequest<
  'mcp_authenticate',
  {
    serverName: string
  }
>

export type SDKControlMcpOAuthCallbackUrlRequest = SDKNamedControlRequest<
  'mcp_oauth_callback_url',
  {
    serverName: string
    callbackUrl: string
  }
>

export type SDKControlClaudeAuthenticateRequest = SDKNamedControlRequest<
  'claude_authenticate',
  {
    loginWithClaudeAi?: boolean
  }
>

export type SDKControlClaudeOAuthCallbackRequest = SDKNamedControlRequest<
  'claude_oauth_callback',
  {
    authorizationCode: string
    state: string
  }
>

export type SDKControlClaudeOAuthWaitForCompletionRequest =
  SDKNamedControlRequest<'claude_oauth_wait_for_completion'>

export type SDKControlMcpClearAuthRequest = SDKNamedControlRequest<
  'mcp_clear_auth',
  {
    serverName: string
  }
>

export type SDKControlApplyFlagSettingsRequest = SDKNamedControlRequest<
  'apply_flag_settings',
  {
    settings: Record<string, unknown>
  }
>

export type SDKControlGetSettingsRequest =
  SDKNamedControlRequest<'get_settings'>

export type SDKControlStopTaskRequest = SDKNamedControlRequest<
  'stop_task',
  {
    task_id: string
  }
>

export type SDKControlGenerateSessionTitleRequest = SDKNamedControlRequest<
  'generate_session_title',
  {
    description: string
    persist?: boolean
  }
>

export type SDKControlSideQuestionRequest = SDKNamedControlRequest<
  'side_question',
  {
    question: string
  }
>

export type SDKControlSetProactiveRequest = SDKNamedControlRequest<
  'set_proactive',
  {
    enabled: boolean
  }
>

export type SDKControlRemoteControlRequest = SDKNamedControlRequest<
  'remote_control',
  {
    enabled: boolean
  }
>

export type SDKControlElicitationRequest = SDKNamedControlRequest<
  'elicitation',
  {
    mcp_server_name: string
    message: string
    mode?: 'form' | 'url'
    url?: string
    elicitation_id?: string
    requested_schema?: Record<string, unknown>
  }
>

export type SDKControlRequestInner =
  | SDKControlPermissionRequest
  | SDKControlInterruptRequest
  | SDKControlEndSessionRequest
  | SDKControlInitializeRequest
  | SDKControlSetPermissionModeRequest
  | SDKControlSetModelRequest
  | SDKControlSetMaxThinkingTokensRequest
  | SDKControlMcpStatusRequest
  | SDKControlGetContextUsageRequest
  | SDKControlHookCallbackRequest
  | SDKControlMcpMessageRequest
  | SDKControlRewindFilesRequest
  | SDKControlCancelAsyncMessageRequest
  | SDKControlSeedReadStateRequest
  | SDKControlMcpSetServersRequest
  | SDKControlReloadPluginsRequest
  | SDKControlMcpReconnectRequest
  | SDKControlMcpToggleRequest
  | SDKControlChannelEnableRequest
  | SDKControlMcpAuthenticateRequest
  | SDKControlMcpOAuthCallbackUrlRequest
  | SDKControlClaudeAuthenticateRequest
  | SDKControlClaudeOAuthCallbackRequest
  | SDKControlClaudeOAuthWaitForCompletionRequest
  | SDKControlMcpClearAuthRequest
  | SDKControlApplyFlagSettingsRequest
  | SDKControlGetSettingsRequest
  | SDKControlStopTaskRequest
  | SDKControlGenerateSessionTitleRequest
  | SDKControlSideQuestionRequest
  | SDKControlSetProactiveRequest
  | SDKControlRemoteControlRequest
  | SDKControlElicitationRequest

export type SDKControlRequest = SDKLooseRecord & {
  type: 'control_request'
  requestId?: string
  request_id: string
  request: SDKControlRequestInner
}

type SDKControlResponseSuccess = {
  subtype: 'success'
  request_id: string
  response?: Record<string, unknown>
}

type SDKControlResponseError = {
  subtype: 'error'
  request_id: string
  error: string
  pending_permission_requests?: SDKControlRequest[]
}

export type SDKControlResponse = SDKLooseRecord & {
  type: 'control_response'
  requestId?: string
  response: SDKControlResponseSuccess | SDKControlResponseError
}

export type SDKControlCancelRequest = {
  type: 'control_cancel_request'
  request_id: string
}

export type SDKControlInitializeResponse = {
  commands: Array<{
    name: string
    description: string
    argumentHint: string
  }>
  agents: Array<{
    name: string
    description: string
    model?: string
  }>
  output_style: string
  available_output_styles: string[]
  models: Array<Record<string, unknown>>
  account: Record<string, unknown>
  pid?: number
  fast_mode_state?: unknown
}

export type SDKControlMcpSetServersResponse = {
  added: string[]
  removed: string[]
  errors: Record<string, string>
}

export type SDKControlReloadPluginsResponse = {
  commands: Array<{
    name: string
    description: string
    argumentHint: string
  }>
  agents: Array<{
    name: string
    description: string
    model?: string
  }>
  plugins: Array<{
    name: string
    path: string
    source?: string
  }>
  mcpServers: Array<Record<string, unknown>>
  error_count: number
}

type SDKKeepAliveMessage = {
  type: 'keep_alive'
}

type SDKUpdateEnvironmentVariablesMessage = {
  type: 'update_environment_variables'
  variables: Record<string, string>
}

type SDKStreamlinedTextMessage = {
  type: 'streamlined_text'
  text: string
  session_id: string
  uuid: string
}

type SDKStreamlinedToolUseSummaryMessage = {
  type: 'streamlined_tool_use_summary'
  tool_summary: string
  session_id: string
  uuid: string
}

export type StdoutMessage =
  | SDKMessage
  | SDKControlRequest
  | SDKControlResponse
  | SDKControlCancelRequest
  | SDKKeepAliveMessage
  | SDKStreamlinedTextMessage
  | SDKStreamlinedToolUseSummaryMessage
  | SDKPostTurnSummaryMessage

export type StdinMessage =
  | SDKMessage
  | SDKControlRequest
  | SDKControlResponse
  | SDKKeepAliveMessage
  | SDKUpdateEnvironmentVariablesMessage

export type { SDKPartialAssistantMessage }
