import type { QuerySource } from 'src/constants/querySource.js'
import {
  DEFAULT_OUTPUT_STYLE_NAME,
  OUTPUT_STYLE_CONFIG,
} from '../constants/outputStyles.js'
import { resolveTaskRouteName } from './model/taskRouting.js'
import { getSettings_DEPRECATED } from './settings/settings.js'

const BUILT_IN_ROUTE_QUERY_SOURCE_AGENT_TYPES = new Set([
  'explore',
  'plan',
  'claude-code-guide',
  'statusline-setup',
  'verification',
])

/**
 * Determines the prompt category for agent usage.
 * Used for analytics to track different agent patterns.
 *
 * @param agentType - The type/name of the agent
 * @param isBuiltInAgent - Whether this is a built-in agent or custom
 * @returns The agent prompt category string
 */
export function getQuerySourceForAgent(
  agentType: string | undefined,
  isBuiltInAgent: boolean,
): QuerySource {
  if (isBuiltInAgent) {
    // TODO: avoid this cast
    return agentType
      ? (`agent:builtin:${agentType}` as QuerySource)
      : 'agent:default'
  } else {
    return 'agent:custom'
  }
}

/**
 * Resolves the querySource for a spawned agent.
 *
 * Normal subagents should always use their own agent-scoped querySource so
 * routing, analytics, and diagnostics reflect the spawned worker instead of
 * the parent request that launched it.
 *
 * Fork workers are the exception: they intentionally preserve the parent's
 * querySource when available so prompt-cache-sensitive request shaping stays
 * aligned with the parent conversation.
 */
export function getQuerySourceForSpawnedAgent(params: {
  agentType: string | undefined
  isBuiltInAgent: boolean
  parentQuerySource?: QuerySource
  preserveParentQuerySource?: boolean
  taskPrompt?: string
}): QuerySource {
  if (params.preserveParentQuerySource && params.parentQuerySource) {
    return params.parentQuerySource
  }

  const querySource = getQuerySourceForAgent(
    params.agentType,
    params.isBuiltInAgent,
  )
  const route = resolveTaskRouteName({
    agentType: params.agentType,
    taskPrompt: params.taskPrompt,
  })

  if (route === 'subagent') {
    return querySource
  }

  const normalizedAgentType = params.agentType?.trim().toLowerCase()
  if (
    params.isBuiltInAgent &&
    normalizedAgentType &&
    BUILT_IN_ROUTE_QUERY_SOURCE_AGENT_TYPES.has(normalizedAgentType)
  ) {
    return querySource
  }

  return `${querySource}:route:${route}` as QuerySource
}

/**
 * Determines the prompt category based on output style settings.
 * Used for analytics to track different output style usage.
 *
 * @returns The prompt category string or undefined for default
 */
export function getQuerySourceForREPL(): QuerySource {
  const settings = getSettings_DEPRECATED()
  const style = settings?.outputStyle ?? DEFAULT_OUTPUT_STYLE_NAME

  if (style === DEFAULT_OUTPUT_STYLE_NAME) {
    return 'repl_main_thread'
  }

  // All styles in OUTPUT_STYLE_CONFIG are built-in
  const isBuiltIn = style in OUTPUT_STYLE_CONFIG
  return isBuiltIn
    ? (`repl_main_thread:outputStyle:${style}` as QuerySource)
    : 'repl_main_thread:outputStyle:custom'
}
