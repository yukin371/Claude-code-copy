import { getSettings_DEPRECATED } from '../settings/settings.js'
import { getProviderDefaultApiStyle } from './providerMetadata.js'

export type TaskRouteName =
  | 'main'
  | 'subagent'
  | 'frontend'
  | 'review'
  | 'explore'
  | 'plan'
  | 'guide'
  | 'statusline'

export type TaskRouteApiStyle = 'anthropic' | 'openai-compatible'

export type TaskRouteProviderName =
  | 'anthropic'
  | 'codex'
  | 'gemini'
  | 'glm'
  | 'minimax'
  | 'openai-compatible'

export type TaskRouteExecutionTarget = {
  provider: TaskRouteProviderName
  apiStyle: TaskRouteApiStyle
  model?: string
}

export type TaskRouteTransportConfig = TaskRouteExecutionTarget & {
  baseUrl?: string
  apiKey?: string
}

export type TaskRouteClientConfig = TaskRouteTransportConfig & {
  route: TaskRouteName
  executionTarget: TaskRouteExecutionTarget
}

type TaskRouteSettings = {
  provider?: string
  apiStyle?: string
  model?: string
  baseUrl?: string
}

const TASK_ROUTE_MODEL_ENV: Record<TaskRouteName, string> = {
  main: 'NEKO_CODE_MAIN_MODEL',
  subagent: 'NEKO_CODE_SUBAGENT_MODEL',
  frontend: 'NEKO_CODE_FRONTEND_MODEL',
  review: 'NEKO_CODE_REVIEW_MODEL',
  explore: 'NEKO_CODE_EXPLORE_MODEL',
  plan: 'NEKO_CODE_PLAN_MODEL',
  guide: 'NEKO_CODE_GUIDE_MODEL',
  statusline: 'NEKO_CODE_STATUSLINE_MODEL',
}

const TASK_ROUTE_PROVIDER_ENV: Record<TaskRouteName, string> = {
  main: 'NEKO_CODE_MAIN_PROVIDER',
  subagent: 'NEKO_CODE_SUBAGENT_PROVIDER',
  frontend: 'NEKO_CODE_FRONTEND_PROVIDER',
  review: 'NEKO_CODE_REVIEW_PROVIDER',
  explore: 'NEKO_CODE_EXPLORE_PROVIDER',
  plan: 'NEKO_CODE_PLAN_PROVIDER',
  guide: 'NEKO_CODE_GUIDE_PROVIDER',
  statusline: 'NEKO_CODE_STATUSLINE_PROVIDER',
}

const TASK_ROUTE_API_STYLE_ENV: Record<TaskRouteName, string> = {
  main: 'NEKO_CODE_MAIN_API_STYLE',
  subagent: 'NEKO_CODE_SUBAGENT_API_STYLE',
  frontend: 'NEKO_CODE_FRONTEND_API_STYLE',
  review: 'NEKO_CODE_REVIEW_API_STYLE',
  explore: 'NEKO_CODE_EXPLORE_API_STYLE',
  plan: 'NEKO_CODE_PLAN_API_STYLE',
  guide: 'NEKO_CODE_GUIDE_API_STYLE',
  statusline: 'NEKO_CODE_STATUSLINE_API_STYLE',
}

const TASK_ROUTE_BASE_URL_ENV: Record<TaskRouteName, string> = {
  main: 'NEKO_CODE_MAIN_BASE_URL',
  subagent: 'NEKO_CODE_SUBAGENT_BASE_URL',
  frontend: 'NEKO_CODE_FRONTEND_BASE_URL',
  review: 'NEKO_CODE_REVIEW_BASE_URL',
  explore: 'NEKO_CODE_EXPLORE_BASE_URL',
  plan: 'NEKO_CODE_PLAN_BASE_URL',
  guide: 'NEKO_CODE_GUIDE_BASE_URL',
  statusline: 'NEKO_CODE_STATUSLINE_BASE_URL',
}

const TASK_ROUTE_API_KEY_ENV: Record<TaskRouteName, string> = {
  main: 'NEKO_CODE_MAIN_API_KEY',
  subagent: 'NEKO_CODE_SUBAGENT_API_KEY',
  frontend: 'NEKO_CODE_FRONTEND_API_KEY',
  review: 'NEKO_CODE_REVIEW_API_KEY',
  explore: 'NEKO_CODE_EXPLORE_API_KEY',
  plan: 'NEKO_CODE_PLAN_API_KEY',
  guide: 'NEKO_CODE_GUIDE_API_KEY',
  statusline: 'NEKO_CODE_STATUSLINE_API_KEY',
}

const DEFAULT_ROUTE_TARGETS: Record<TaskRouteName, TaskRouteExecutionTarget> = {
  main: { provider: 'glm', apiStyle: 'openai-compatible' },
  subagent: { provider: 'minimax', apiStyle: 'openai-compatible' },
  frontend: { provider: 'gemini', apiStyle: 'openai-compatible' },
  review: { provider: 'codex', apiStyle: 'openai-compatible' },
  explore: { provider: 'anthropic', apiStyle: 'anthropic' },
  plan: { provider: 'anthropic', apiStyle: 'anthropic' },
  guide: { provider: 'anthropic', apiStyle: 'anthropic' },
  statusline: { provider: 'anthropic', apiStyle: 'anthropic' },
}

function getTaskRouteSettings(route: TaskRouteName): TaskRouteSettings | undefined {
  return (
    (getSettings_DEPRECATED()?.taskRoutes?.[route] as TaskRouteSettings | undefined) ??
    undefined
  )
}

function inferApiStyleFromProvider(
  provider?: TaskRouteProviderName,
): TaskRouteApiStyle | undefined {
  if (!provider) return undefined
  return getProviderDefaultApiStyle(provider)
}

function normalizeTaskRouteModel(model?: string): string | undefined {
  const trimmed = model?.trim()
  if (!trimmed) return undefined
  return normalizeOpenAICompatibleModel(trimmed)
}

const FRONTEND_TASK_RE =
  /(front[- ]?end|frontend|ui|user interface|前端|界面|页面|react|tsx|component|components|css|tailwind|vue|svelte)/i
const REVIEW_TASK_RE =
  /(review|code review|verification|verify|审查|审核|检查|验证|审阅)/i

function normalizeAgentType(agentType?: string): string {
  return agentType?.trim().toLowerCase() ?? ''
}

function looksLikeFrontendTask(taskPrompt?: string): boolean {
  return taskPrompt ? FRONTEND_TASK_RE.test(taskPrompt) : false
}

function looksLikeReviewTask(taskPrompt?: string): boolean {
  return taskPrompt ? REVIEW_TASK_RE.test(taskPrompt) : false
}

export function resolveTaskRouteName(params: {
  agentType?: string
  taskPrompt?: string
  taskHints?: readonly string[]
}): TaskRouteName {
  const agentType = normalizeAgentType(params.agentType)
  const taskPrompt = params.taskPrompt ?? ''
  const taskHints = new Set(
    params.taskHints?.map(hint => hint.trim().toLowerCase()).filter(Boolean) ??
      [],
  )

  if (
    agentType === 'verification' ||
    taskHints.has('review') ||
    looksLikeReviewTask(taskPrompt)
  ) {
    return 'review'
  }

  if (
    agentType === 'explore' ||
    agentType === 'plan' ||
    agentType === 'claude-code-guide' ||
    agentType === 'statusline-setup'
  ) {
    return agentType === 'explore'
      ? 'explore'
      : agentType === 'plan'
        ? 'plan'
        : agentType === 'claude-code-guide'
          ? 'guide'
          : 'statusline'
  }

  if (taskHints.has('frontend') || looksLikeFrontendTask(taskPrompt)) {
    return 'frontend'
  }

  if (agentType === 'general-purpose' || agentType === 'subagent') {
    return 'subagent'
  }

  return 'subagent'
}

export function getTaskRouteModelOverride(route: TaskRouteName): string | undefined {
  return resolveTaskRouteModel(getTaskRouteExecutionTarget(route))
}

export function getTaskRouteExecutionTarget(
  route: TaskRouteName,
): TaskRouteExecutionTarget {
  const defaultTarget = DEFAULT_ROUTE_TARGETS[route]
  const routeSettings = getTaskRouteSettings(route)
  const provider = process.env[TASK_ROUTE_PROVIDER_ENV[route]]?.trim()
  const apiStyle = process.env[TASK_ROUTE_API_STYLE_ENV[route]]?.trim()
  const model = process.env[TASK_ROUTE_MODEL_ENV[route]]?.trim()
  const configuredProvider =
    normalizeProviderName(provider) ??
    normalizeProviderName(routeSettings?.provider) ??
    defaultTarget.provider
  const configuredApiStyle =
    normalizeApiStyle(apiStyle) ??
    normalizeApiStyle(routeSettings?.apiStyle) ??
    inferApiStyleFromProvider(
      normalizeProviderName(provider) ??
        normalizeProviderName(routeSettings?.provider),
    ) ??
    defaultTarget.apiStyle

  return {
    provider: configuredProvider,
    apiStyle: configuredApiStyle,
    model: normalizeTaskRouteModel(model || routeSettings?.model),
  }
}

export function getTaskRouteTransportConfig(
  route: TaskRouteName,
): TaskRouteTransportConfig {
  const target = getTaskRouteExecutionTarget(route)
  const routeSettings = getTaskRouteSettings(route)
  const baseUrl =
    process.env[TASK_ROUTE_BASE_URL_ENV[route]]?.trim() ||
    routeSettings?.baseUrl?.trim() ||
    process.env.NEKO_CODE_OPENAI_COMPATIBLE_BASE_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim()
  const apiKey =
    process.env[TASK_ROUTE_API_KEY_ENV[route]]?.trim() ||
    process.env.NEKO_CODE_OPENAI_COMPATIBLE_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim()

  return {
    ...target,
    apiStyle: baseUrl ? 'openai-compatible' : target.apiStyle,
    baseUrl,
    apiKey,
  }
}

export function resolveTaskRouteExecutionTarget(params: {
  agentType?: string
  taskPrompt?: string
  taskHints?: readonly string[]
}): TaskRouteExecutionTarget & { route: TaskRouteName } {
  const route = resolveTaskRouteName(params)
  return {
    route,
    ...getTaskRouteExecutionTarget(route),
  }
}

export function resolveTaskRouteModel(target: TaskRouteExecutionTarget): string | undefined {
  return normalizeTaskRouteModel(target.model)
}

export function resolveTaskRouteTransportConfig(params: {
  agentType?: string
  taskPrompt?: string
  taskHints?: readonly string[]
}): TaskRouteTransportConfig & { route: TaskRouteName } {
  const route = resolveTaskRouteName(params)
  return {
    route,
    ...getTaskRouteTransportConfig(route),
  }
}

export function resolveTaskRouteNameFromQuerySource(
  querySource?: string,
): TaskRouteName {
  const normalized = querySource?.trim().toLowerCase() ?? ''
  if (!normalized) return 'main'
  if (normalized === 'compact' || normalized === 'session_memory') return 'main'
  if (normalized.startsWith('repl_main_thread')) return 'main'
  if (normalized === 'verification_agent') return 'review'
  if (normalized === 'hook_agent') return 'subagent'
  if (normalized === 'web_search_tool') return 'main'

  if (normalized.startsWith('agent:builtin:')) {
    const agentType = normalized.slice('agent:builtin:'.length)
    if (agentType === 'explore') return 'explore'
    if (agentType === 'plan') return 'plan'
    if (agentType === 'claude-code-guide') return 'guide'
    if (agentType === 'statusline-setup') return 'statusline'
    if (agentType === 'verification') return 'review'
    return 'subagent'
  }

  if (normalized.startsWith('agent:')) return 'subagent'
  return 'main'
}

export function resolveTaskRouteTransportFromQuerySource(querySource?: string) {
  const route = resolveTaskRouteNameFromQuerySource(querySource)
  return {
    route,
    ...getTaskRouteTransportConfig(route),
  }
}

export function resolveTaskRouteClientConfigFromQuerySource(
  querySource?: string,
): TaskRouteClientConfig {
  const route = resolveTaskRouteNameFromQuerySource(querySource)
  const executionTarget = getTaskRouteExecutionTarget(route)
  return {
    route,
    executionTarget,
    ...getTaskRouteTransportConfig(route),
  }
}

function normalizeProviderName(
  provider?: string,
): TaskRouteProviderName | undefined {
  const normalized = provider?.trim().toLowerCase()
  switch (normalized) {
    case 'anthropic':
    case 'codex':
    case 'gemini':
    case 'glm':
    case 'minimax':
    case 'openai-compatible':
      return normalized as TaskRouteProviderName
    default:
      return undefined
  }
}

function normalizeOpenAICompatibleModel(model: string): string {
  return model.replace(/\[(1|2)m\]$/gi, '').trim()
}

function normalizeApiStyle(
  apiStyle?: string,
): TaskRouteApiStyle | undefined {
  const normalized = apiStyle?.trim().toLowerCase()
  switch (normalized) {
    case 'anthropic':
    case 'openai-compatible':
      return normalized as TaskRouteApiStyle
    default:
      return undefined
  }
}
