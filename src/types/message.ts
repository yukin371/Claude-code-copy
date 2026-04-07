import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'

export type SystemMessageLevel =
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'suggestion'

export type MessageContentBlock = ContentBlockParam & {
  content?: string | MessageContentBlock[]
  [key: string]: unknown
}

export type MessageContent = string | MessageContentBlock[]

export function isMessageContentBlocks(
  content: unknown,
): content is MessageContentBlock[] {
  return (
    Array.isArray(content) &&
    content.every(
      block =>
        typeof block === 'object' &&
        block !== null &&
        typeof (block as { type?: unknown }).type === 'string',
    )
  )
}

export function getMessageContentBlocks(
  content: MessageContent | null | undefined,
): MessageContentBlock[] {
  return isMessageContentBlocks(content) ? content : []
}

export function getFirstMessageContentBlock(
  content: MessageContent | null | undefined,
): MessageContentBlock | undefined {
  return getMessageContentBlocks(content)[0]
}

export type MessageOrigin = {
  kind?: string
  [key: string]: unknown
}

export type CompactMetadata = {
  trigger: 'manual' | 'auto' | string
  preTokens: number
  userContext?: string
  messagesSummarized?: number
  preservedSegment?: {
    headUuid: string
    anchorUuid: string
    tailUuid: string
  }
}

export type MessageAttachment = {
  type: string
  name?: string
  prompt?: string | MessageContentBlock[]
  identity?: {
    color?: string
    agentName?: string
    [key: string]: unknown
  }
  origin?: unknown
  commandMode?: string
  isMeta?: boolean
  [key: string]: unknown
}

export type Message = {
  type: string
  uuid?: string
  timestamp?: string | number
  isVirtual?: boolean
  isMeta?: boolean
  isCompactSummary?: boolean
  toolUseResult?: unknown
  subtype?: string
  origin?: MessageOrigin
  message?: {
    id?: string
    content: MessageContent
    [key: string]: unknown
  }
  content?: string
  level?: SystemMessageLevel
  toolUseID?: string
  compactMetadata?: CompactMetadata
  attachment?: MessageAttachment
  data?: unknown
  error?: unknown
  [key: string]: unknown
}

export type AssistantMessage = Message & {
  type: 'assistant'
  role?: 'assistant'
  message: {
    id?: string
    content: MessageContentBlock[]
    [key: string]: unknown
  }
}

export type UserMessage = Message & {
  type: 'user'
  role?: 'user'
  message: {
    id?: string
    content: MessageContent
    [key: string]: unknown
  }
}

export type NormalizedUserMessage = Message & {
  type: 'user'
  role?: 'user'
  message: {
    id?: string
    content: MessageContentBlock[]
    [key: string]: unknown
  }
}

export type NormalizedAssistantMessage = AssistantMessage

export type SystemMessage = Message & {
  type: 'system'
  role?: 'system'
  subtype?: string
}

export type AttachmentMessage = Message & {
  type: 'attachment'
  attachment: MessageAttachment
  attachments?: unknown[]
}

export type StopHookInfo = {
  command: string
  promptText?: string
  durationMs?: number
}

export type ProgressMessage<T = unknown> = Message & {
  type: 'progress'
  progress?: unknown
  data?: T
  toolUseID?: string
}

export type RequestStartEvent = {
  type: 'request_start'
  requestId?: string
  uuid?: string
  timestamp?: string
  [key: string]: unknown
}

export type StreamEvent = {
  type: 'stream_event'
  event: unknown
  uuid?: string
  timestamp?: string
  [key: string]: unknown
}

export type TombstoneMessage = {
  type: 'tombstone'
  message: Message
  uuid?: string
  timestamp?: string
  [key: string]: unknown
}

export type ToolUseSummaryMessage = {
  type: 'tool_use_summary'
  summary: string
  precedingToolUseIds: string[]
  uuid?: string
  timestamp?: string
  [key: string]: unknown
}

export type SystemAPIErrorMessage = SystemMessage & {
  error?: unknown
  isApiErrorMessage?: boolean
}

export type SystemBridgeStatusMessage = SystemMessage & {
  subtype: 'bridge_status'
  content: string
  url: string
  upgradeNudge?: string
}

export type SystemInformationalMessage = SystemMessage & {
  subtype: 'informational'
  content: string
  level: SystemMessageLevel
  toolUseID?: string
  preventContinuation?: boolean
}

export type SystemLocalCommandMessage = SystemMessage & {
  subtype: 'local_command'
  content: string
  level: SystemMessageLevel
}

export type SystemMemorySavedMessage = SystemMessage & {
  subtype: 'memory_saved'
  writtenPaths: string[]
  teamCount?: number
}

export type SystemStopHookSummaryMessage = SystemMessage & {
  subtype: 'stop_hook_summary'
  hookCount: number
  hookInfos: StopHookInfo[]
  hookErrors: string[]
  preventedContinuation: boolean
  stopReason?: string
  hasOutput: boolean
  level: SystemMessageLevel
  hookLabel?: string
  totalDurationMs?: number
}

export type SystemThinkingMessage = SystemMessage & {
  subtype?: 'thinking'
}

export type SystemTurnDurationMessage = SystemMessage & {
  subtype: 'turn_duration'
  durationMs: number
  budgetTokens?: number
  budgetLimit?: number
  budgetNudges?: number
  messageCount?: number
}

export type SystemAgentsKilledMessage = SystemMessage & {
  subtype: 'agents_killed'
}

export type SystemApiMetricsMessage = SystemMessage & {
  subtype: 'api_metrics'
  ttftMs: number
  otps: number
  isP50?: boolean
  hookDurationMs?: number
  turnDurationMs?: number
  toolDurationMs?: number
  classifierDurationMs?: number
  toolCount?: number
  hookCount?: number
  classifierCount?: number
  configWriteCount?: number
}

export type SystemAwaySummaryMessage = SystemMessage & {
  subtype: 'away_summary'
  content: string
}

export type SystemPermissionRetryMessage = SystemMessage & {
  subtype: 'permission_retry'
  content: string
  commands: string[]
  level: SystemMessageLevel
}

export type SystemScheduledTaskFireMessage = SystemMessage & {
  subtype: 'scheduled_task_fire'
  content: string
}

export type SystemCompactBoundaryMessage = SystemMessage & {
  subtype: 'compact_boundary'
  content: string
  level: SystemMessageLevel
  compactMetadata: CompactMetadata
  logicalParentUuid?: string
}

export type SystemMicrocompactBoundaryMessage = SystemMessage & {
  subtype: 'microcompact_boundary'
  compactMetadata: {
    trigger: 'auto' | string
    preTokens: number
    tokensSaved: number
    compactedToolIds: string[]
    clearedAttachmentUUIDs: string[]
  }
}

export type SystemFileSnapshotMessage = SystemMessage & {
  subtype: 'file_snapshot'
  content: string
  level: SystemMessageLevel
  snapshotFiles: Array<{
    key: string
    path: string
    content: string
  }>
}

export type GroupedToolUseMessage = Message & {
  type: 'grouped_tool_use'
  toolName: string
  messages: AssistantMessage[]
  results: NormalizedUserMessage[]
  displayMessage: AssistantMessage
  messageId?: string
}

export type CollapsibleMessage =
  | AssistantMessage
  | NormalizedUserMessage
  | GroupedToolUseMessage

export type CollapsedReadSearchGroup = Message & {
  type: 'collapsed_read_search'
  searchCount?: number
  readCount?: number
  listCount?: number
  replCount?: number
  memorySearchCount?: number
  memoryReadCount?: number
  memoryWriteCount?: number
  readFilePaths?: string[]
  searchArgs?: unknown[]
  latestDisplayHint?: unknown
  messages: CollapsibleMessage[]
  displayMessage: CollapsibleMessage
  mcpCallCount?: number
  mcpServerNames?: string[]
  bashCount?: number
  gitOpBashCount?: number
  teamMemorySearchCount?: number
  teamMemoryReadCount?: number
  teamMemoryWriteCount?: number
  commits?: Array<{
    sha: string
    kind: 'committed' | 'amended' | 'cherry-picked'
  }>
  pushes?: Array<{
    branch: string
  }>
  branches?: Array<{
    ref: string
    action: 'merged' | 'rebased'
  }>
  prs?: Array<{
    number: number
    url?: string
    action:
      | 'created'
      | 'edited'
      | 'merged'
      | 'commented'
      | 'closed'
      | 'ready'
  }>
  hookTotalMs?: number
  hookCount?: number
  hookInfos?: StopHookInfo[]
  relevantMemories?: Array<{
    path: string
    content: string
    mtimeMs: number
  }>
  items?: unknown[]
}

export type RenderableMessage =
  | AssistantMessage
  | NormalizedUserMessage
  | SystemMessage
  | AttachmentMessage
  | GroupedToolUseMessage
  | CollapsedReadSearchGroup

export type NormalizedMessage =
  | RenderableMessage
  | ProgressMessage
  | RequestStartEvent
  | StreamEvent
  | TombstoneMessage
  | ToolUseSummaryMessage

export type HookResultMessage = Message & { hook?: string }
export type MessageType = NormalizedMessage
export type PartialCompactDirection = 'older' | 'newer' | 'both' | string
export type RenderableMessageBlock = MessageContentBlock

export type MessageWithAttachment = Message & {
  attachment?: MessageAttachment
}
