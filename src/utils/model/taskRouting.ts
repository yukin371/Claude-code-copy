import { createRequire } from 'node:module'
import { getProviderDefaultApiStyle, getProviderFamily } from './providerMetadata.js'
import { getMainLoopProviderOverride } from './sessionProviderOverride.js'
import { getTaskRouteKeyRefOverride } from './sessionKeyRefOverride.js'
import { resolveProviderKeyRef } from './providerKeyRegistry.js'

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

export type TaskRouteTransportMode = 'direct-provider' | 'single-upstream'

export type TaskRouteTransportConfig = TaskRouteExecutionTarget & {
  baseUrl?: string
  apiKey?: string
  /**
   * Non-secret key identity, typically set from settings taskRoutes.*.keyRef.
   * This is used for quota monitoring and diagnostics. It MUST NOT contain secrets.
   */
  keyId?: string
  transportMode?: TaskRouteTransportMode
  baseUrlSource?: TaskRouteDebugSource
  apiKeySource?: TaskRouteDebugSource
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
  keyRef?: string
}

type TaskRouteDebugSettings = {
  provider?: string
  apiStyle?: string
  model?: string
  baseUrl?: string
  keyRef?: string
}

type TaskRouteDebugRouteEnv = {
  provider?: string
  apiStyle?: string
  model?: string
  baseUrl?: string
  apiKey?: string
}

export type TaskRouteDebugSource =
  | 'default'
  | 'none'
  | 'route-env'
  | 'route-settings'
  | 'global-env'
  | 'session-override'
  | 'derived-provider'
  | 'forced-by-base-url'
  | 'key-ref'
  | 'key-ref-env'
  | 'key-ref-missing'
  | 'key-ref-expired'
  | 'key-ref-model-denied'

export type TaskRouteDebugField<T> = {
  value: T | undefined
  explicit: boolean
  source: TaskRouteDebugSource
}

export type TaskRouteDebugSnapshot = {
  route: TaskRouteName
  envNames: {
    provider: string
    apiStyle: string
    model: string
    baseUrl: string
    apiKey: string
  }
  routeEnv: TaskRouteDebugRouteEnv
  routeSettings: TaskRouteDebugSettings
  executionTarget: TaskRouteExecutionTarget
  transport: TaskRouteTransportConfig
  transportMode: TaskRouteTransportMode
  fields: {
    provider: TaskRouteDebugField<TaskRouteProviderName>
    apiStyle: TaskRouteDebugField<TaskRouteApiStyle>
    model: TaskRouteDebugField<string>
    baseUrl: TaskRouteDebugField<string>
    apiKey: TaskRouteDebugField<string>
  }
}

export type TaskRouteQuerySourceSnapshot = {
  querySource: string | undefined
  normalizedQuerySource: string
  route: TaskRouteName
}

export type TaskRouteFromQuerySourceDebugSnapshot = TaskRouteQuerySourceSnapshot & {
  routeSnapshot: TaskRouteDebugSnapshot
}

export type TaskRoutingDebugSnapshot = {
  routes: TaskRouteDebugSnapshot[]
  querySources: TaskRouteQuerySourceSnapshot[]
  querySourceRoutes: TaskRouteFromQuerySourceDebugSnapshot[]
}

export type TaskRouteDebugSnapshotOptions = {
  includeSecrets?: boolean
}

const MASKED_SECRET_VALUE = '[masked]'

export const TASK_ROUTE_NAMES = [
  'main',
  'subagent',
  'frontend',
  'review',
  'explore',
  'plan',
  'guide',
  'statusline',
] as const satisfies readonly TaskRouteName[]

export const TASK_ROUTE_QUERY_SOURCE_EXAMPLES = [
  'compact',
  'session_memory',
  'repl_main_thread',
  'repl_main_thread:outputStyle:Explanatory',
  'session_search',
  'permission_explainer',
  'model_validation',
  'side_question',
  'auto_mode',
  'memdir_relevance',
  'hook_prompt',
  'chrome_mcp',
  'mcp_datetime_parse',
  'generate_session_title',
  'rename_generate_name',
  'tool_use_summary_generation',
  'feedback',
  'agent_creation',
  'away_summary',
  'teleport_generate_title',
  'verification_agent',
  'hook_agent',
  'web_search_tool',
  'agent:builtin:explore',
  'agent:builtin:plan',
  'agent:builtin:claude-code-guide',
  'agent:builtin:statusline-setup',
  'agent:builtin:verification',
  'agent:custom',
  'agent:custom:route:frontend',
  'agent:builtin:general-purpose:route:review',
  'sdk',
] as const

export const TASK_ROUTE_STATUS_QUERY_SOURCE_EXAMPLES = [
  'repl_main_thread',
  'compact',
  'session_search',
  'permission_explainer',
  'auto_mode',
  'mcp_datetime_parse',
  'generate_session_title',
  'tool_use_summary_generation',
  'agent:custom',
  'agent:custom:route:frontend',
  'agent:builtin:general-purpose:route:review',
  'agent:builtin:plan',
  'agent:builtin:statusline-setup',
] as const satisfies readonly string[]

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
  try {
    const require = createRequire(import.meta.url)
    const settingsModule = require('../settings/settings.js') as {
      getSettings_DEPRECATED?: () => {
        taskRoutes?: Record<string, TaskRouteSettings | undefined>
      }
    }
    return settingsModule.getSettings_DEPRECATED?.()?.taskRoutes?.[route]
  } catch {
    return undefined
  }
}

type TaskRouteRule = {
  matchQuerySource?: string
  matchQuerySourcePrefix?: string
  matchRoute?: TaskRouteName
  matchProvider?: string
  provider?: string
  apiStyle?: string
  model?: string
  baseUrl?: string
  keyRef?: string
}

function getTaskRouteRules(): TaskRouteRule[] {
  try {
    const require = createRequire(import.meta.url)
    const settingsModule = require('../settings/settings.js') as {
      getSettings_DEPRECATED?: () => {
        taskRouteRules?: TaskRouteRule[]
      }
    }
    return settingsModule.getSettings_DEPRECATED?.()?.taskRouteRules ?? []
  } catch {
    return []
  }
}

function matchTaskRouteRule(params: {
  rule: TaskRouteRule
  normalizedQuerySource: string
  route: TaskRouteName
  currentProvider: TaskRouteProviderName
}): boolean {
  const rule = params.rule
  if (rule.matchRoute && rule.matchRoute !== params.route) return false
  if (rule.matchProvider) {
    const expected = normalizeProviderName(rule.matchProvider)
    if (expected && expected !== params.currentProvider) {
      return false
    }
  }
  if (rule.matchQuerySource) {
    if (normalizeQuerySource(rule.matchQuerySource) !== params.normalizedQuerySource) {
      return false
    }
  }
  if (rule.matchQuerySourcePrefix) {
    const prefix = normalizeQuerySource(rule.matchQuerySourcePrefix)
    if (!params.normalizedQuerySource.startsWith(prefix)) {
      return false
    }
  }
  return true
}

function getTaskRouteOverridesFromQuerySource(querySource?: string): TaskRouteSettings | undefined {
  const normalizedQuerySource = normalizeQuerySource(querySource)
  const route = resolveTaskRouteNameFromNormalizedQuerySource(normalizedQuerySource)
  const rules = getTaskRouteRules()
  if (rules.length === 0) return undefined
  const currentProvider = getTaskRouteExecutionTarget(route).provider

  let best: { rule: TaskRouteRule; rank: number } | null = null
  for (const rule of rules) {
    const normalizedRule = {
      ...rule,
      matchRoute: rule.matchRoute as TaskRouteName | undefined,
    }
    if (!matchTaskRouteRule({ rule: normalizedRule, normalizedQuerySource, route, currentProvider })) {
      continue
    }

    // Specificity ranking: exact querySource > prefix > route-only
    const rank =
      (normalizedRule.matchQuerySource ? 100 : 0) +
      (normalizedRule.matchQuerySourcePrefix ? 50 : 0) +
      (normalizedRule.matchRoute ? 10 : 0) +
      (normalizedRule.matchProvider ? 5 : 0)

    if (!best || rank > best.rank) {
      best = { rule: normalizedRule, rank }
    }
  }

  if (!best) return undefined
  return {
    provider: best.rule.provider,
    apiStyle: best.rule.apiStyle,
    model: best.rule.model,
    baseUrl: best.rule.baseUrl,
    keyRef: best.rule.keyRef,
  }
}

function mergeTaskRouteSettings(
  base: TaskRouteSettings | undefined,
  overrides: TaskRouteSettings | undefined,
): TaskRouteSettings | undefined {
  if (!base && !overrides) return undefined
  if (!overrides) return base

  const merged: TaskRouteSettings = { ...(base ?? {}) }
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      ;(merged as any)[key] = value
    }
  }
  return merged
}

function normalizeConfiguredValue(value?: string): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function getTaskRouteEnvNames(route: TaskRouteName) {
  return {
    provider: TASK_ROUTE_PROVIDER_ENV[route],
    apiStyle: TASK_ROUTE_API_STYLE_ENV[route],
    model: TASK_ROUTE_MODEL_ENV[route],
    baseUrl: TASK_ROUTE_BASE_URL_ENV[route],
    apiKey: TASK_ROUTE_API_KEY_ENV[route],
  }
}

function getTaskRouteDebugSettings(route: TaskRouteName): TaskRouteDebugSettings {
  const settings = getTaskRouteSettings(route)
  return {
    provider: normalizeConfiguredValue(settings?.provider),
    apiStyle: normalizeConfiguredValue(settings?.apiStyle),
    model: normalizeConfiguredValue(settings?.model),
    baseUrl: settings?.baseUrl?.trim(),
    keyRef: normalizeConfiguredValue(settings?.keyRef),
  }
}

function getTaskRouteDebugRouteEnv(route: TaskRouteName): TaskRouteDebugRouteEnv {
  return {
    provider: normalizeConfiguredValue(process.env[TASK_ROUTE_PROVIDER_ENV[route]]),
    apiStyle: normalizeConfiguredValue(process.env[TASK_ROUTE_API_STYLE_ENV[route]]),
    model: normalizeConfiguredValue(process.env[TASK_ROUTE_MODEL_ENV[route]]),
    baseUrl: normalizeConfiguredValue(process.env[TASK_ROUTE_BASE_URL_ENV[route]]),
    apiKey: normalizeConfiguredValue(process.env[TASK_ROUTE_API_KEY_ENV[route]]),
  }
}

function getGlobalOpenAICompatibleBaseUrl(): string | undefined {
  return (
    normalizeConfiguredValue(process.env.NEKO_CODE_OPENAI_COMPATIBLE_BASE_URL) ||
    normalizeConfiguredValue(process.env.OPENAI_BASE_URL)
  )
}

function getGlobalOpenAICompatibleApiKey(): string | undefined {
  return (
    normalizeConfiguredValue(process.env.NEKO_CODE_OPENAI_COMPATIBLE_API_KEY) ||
    normalizeConfiguredValue(process.env.OPENAI_API_KEY)
  )
}

function getGlobalAnthropicBaseUrl(): string | undefined {
  return normalizeConfiguredValue(process.env.ANTHROPIC_BASE_URL)
}

function shouldUseGlobalAnthropicUpstream(params: {
  routeEnv: TaskRouteDebugRouteEnv
  routeSettings: TaskRouteDebugSettings
}): boolean {
  if (getGlobalAnthropicBaseUrl() === undefined) {
    return false
  }

  return (
    normalizeProviderName(params.routeEnv.provider) === undefined &&
    normalizeProviderName(params.routeSettings.provider) === undefined &&
    normalizeApiStyle(params.routeEnv.apiStyle) === undefined &&
    normalizeApiStyle(params.routeSettings.apiStyle) === undefined &&
    params.routeEnv.baseUrl === undefined &&
    params.routeSettings.baseUrl === undefined
  )
}

function maskSecret(value?: string): string | undefined {
  if (value === undefined) return undefined
  return MASKED_SECRET_VALUE
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
  options: {
    ignoreSessionOverride?: boolean
    settingsOverride?: TaskRouteSettings
  } = {},
): TaskRouteExecutionTarget {
  const defaultTarget = DEFAULT_ROUTE_TARGETS[route]
  const routeSettings = mergeTaskRouteSettings(
    getTaskRouteSettings(route),
    options.settingsOverride,
  )
  const sessionProviderOverride =
    route === 'main' && !options.ignoreSessionOverride
      ? getMainLoopProviderOverride()
      : undefined
  const provider = process.env[TASK_ROUTE_PROVIDER_ENV[route]]?.trim()
  const apiStyle = process.env[TASK_ROUTE_API_STYLE_ENV[route]]?.trim()
  const model = process.env[TASK_ROUTE_MODEL_ENV[route]]?.trim()
  const routeEnv: TaskRouteDebugRouteEnv = {
    provider: normalizeConfiguredValue(provider),
    apiStyle: normalizeConfiguredValue(apiStyle),
    model: normalizeConfiguredValue(model),
    baseUrl: normalizeConfiguredValue(process.env[TASK_ROUTE_BASE_URL_ENV[route]]),
    apiKey: normalizeConfiguredValue(process.env[TASK_ROUTE_API_KEY_ENV[route]]),
  }
  const routeDebugSettings = getTaskRouteDebugSettings(route)
  const globalAnthropicFallback = shouldUseGlobalAnthropicUpstream({
    routeEnv,
    routeSettings: routeDebugSettings,
  })
    ? { provider: 'anthropic' as const, apiStyle: 'anthropic' as const }
    : undefined
  const configuredProvider =
    sessionProviderOverride ??
    normalizeProviderName(provider) ??
    normalizeProviderName(routeSettings?.provider) ??
    globalAnthropicFallback?.provider ??
    defaultTarget.provider
  const configuredApiStyle =
    inferApiStyleFromProvider(sessionProviderOverride) ??
    normalizeApiStyle(apiStyle) ??
    normalizeApiStyle(routeSettings?.apiStyle) ??
    inferApiStyleFromProvider(
      normalizeProviderName(provider) ??
        normalizeProviderName(routeSettings?.provider),
    ) ??
    globalAnthropicFallback?.apiStyle ??
    defaultTarget.apiStyle

  return {
    provider: configuredProvider,
    apiStyle: configuredApiStyle,
    model: normalizeTaskRouteModel(model || routeSettings?.model),
  }
}

export function getTaskRouteTransportConfig(
  route: TaskRouteName,
  settingsOverride?: TaskRouteSettings,
): TaskRouteTransportConfig {
  const routeSettings = mergeTaskRouteSettings(
    getTaskRouteSettings(route),
    settingsOverride,
  )
  const target = getTaskRouteExecutionTarget(route, { settingsOverride })
  const routeEnvBaseUrl = process.env[TASK_ROUTE_BASE_URL_ENV[route]]?.trim()
  const settingsBaseUrl = routeSettings?.baseUrl?.trim()
  const explicitBaseUrl = routeEnvBaseUrl || settingsBaseUrl
  const usesOpenAICompatibleTransport =
    explicitBaseUrl !== undefined ||
    target.apiStyle === 'openai-compatible' ||
    getProviderFamily(target.provider) === 'openai-compatible'
  const globalOpenAIBaseUrl = usesOpenAICompatibleTransport
    ? getGlobalOpenAICompatibleBaseUrl()
    : undefined
  const globalAnthropicBaseUrl =
    explicitBaseUrl === undefined && target.apiStyle === 'anthropic'
      ? getGlobalAnthropicBaseUrl()
      : undefined
  const baseUrl = explicitBaseUrl || globalOpenAIBaseUrl || globalAnthropicBaseUrl
  const routeApiKey = process.env[TASK_ROUTE_API_KEY_ENV[route]]?.trim()
  const sessionKeyRefOverride = getTaskRouteKeyRefOverride(route)
  const resolvedKeyRef =
    sessionKeyRefOverride?.trim() || routeSettings?.keyRef?.trim() || undefined
  const keyRefResolution = resolvedKeyRef
    ? resolveApiKeyFromProviderKeyRef({
        keyRef: resolvedKeyRef,
        routeProvider: target.provider,
        routeModel: target.model,
      })
    : undefined
  if (resolvedKeyRef && routeApiKey === undefined && !keyRefResolution?.apiKey) {
    throw new Error(
      `taskRoutes.${route}.keyRef='${resolvedKeyRef}' could not be resolved (${keyRefResolution?.source ?? 'unknown'})`,
    )
  }
  const globalApiKey = usesOpenAICompatibleTransport
    ? getGlobalOpenAICompatibleApiKey()
    : undefined
  const transportMode: TaskRouteTransportMode =
    baseUrl !== undefined || routeApiKey !== undefined || keyRefResolution?.apiKey !== undefined
      ? 'single-upstream'
      : 'direct-provider'
  const apiKey =
    routeApiKey ||
    keyRefResolution?.apiKey ||
    (baseUrl !== undefined ? globalApiKey : undefined)
  const baseUrlSource: TaskRouteDebugSource =
    routeEnvBaseUrl !== undefined
      ? 'route-env'
      : settingsBaseUrl !== undefined
        ? 'route-settings'
        : globalOpenAIBaseUrl !== undefined || globalAnthropicBaseUrl !== undefined
          ? 'global-env'
          : 'none'
  const apiKeySource: TaskRouteDebugSource =
    routeApiKey !== undefined
      ? 'route-env'
      : keyRefResolution?.apiKey !== undefined
        ? keyRefResolution.source
      : apiKey !== undefined
        ? 'global-env'
        : 'none'

  return {
    ...target,
    apiStyle:
      explicitBaseUrl || globalOpenAIBaseUrl ? 'openai-compatible' : target.apiStyle,
    baseUrl,
    apiKey,
    keyId: keyRefResolution?.apiKey ? resolvedKeyRef : undefined,
    transportMode,
    baseUrlSource,
    apiKeySource,
  }
}

function resolveApiKeyFromProviderKeyRef(params: {
  keyRef: string
  routeProvider: TaskRouteProviderName
  routeModel?: string
}): { apiKey?: string; source: TaskRouteDebugSource } {
  const resolution = resolveProviderKeyRef({
    keyRef: params.keyRef,
    expectedProvider: params.routeProvider,
    model: params.routeModel,
  })

  switch (resolution.status) {
    case 'ok':
      return {
        apiKey: resolution.apiKey,
        source: resolution.secretSource === 'inline' ? 'key-ref' : 'key-ref-env',
      }
    case 'expired':
      return { apiKey: undefined, source: 'key-ref-expired' }
    case 'model_denied':
      return { apiKey: undefined, source: 'key-ref-model-denied' }
    case 'provider_mismatch':
    case 'secret_missing':
    case 'missing':
    default:
      return { apiKey: undefined, source: 'key-ref-missing' }
  }
}

export function getTaskRouteTransportMode(
  transport: TaskRouteTransportConfig,
): TaskRouteTransportMode {
  return (
    transport.transportMode ??
    (transport.baseUrl?.trim() || transport.apiKey?.trim()
      ? 'single-upstream'
      : 'direct-provider')
  )
}

function getTaskRouteProviderDebugField(params: {
  route: TaskRouteName
  defaultTarget: TaskRouteExecutionTarget
  routeEnv: TaskRouteDebugRouteEnv
  routeSettings: TaskRouteDebugSettings
}): TaskRouteDebugField<TaskRouteProviderName> {
  const sessionProviderOverride =
    params.route === 'main' ? getMainLoopProviderOverride() : undefined
  if (sessionProviderOverride) {
    return {
      value: sessionProviderOverride,
      explicit: true,
      source: 'session-override',
    }
  }

  const envProvider = normalizeProviderName(params.routeEnv.provider)
  if (envProvider) {
    return {
      value: envProvider,
      explicit: true,
      source: 'route-env',
    }
  }

  const settingsProvider = normalizeProviderName(params.routeSettings.provider)
  if (settingsProvider) {
    return {
      value: settingsProvider,
      explicit: true,
      source: 'route-settings',
    }
  }

  if (
    shouldUseGlobalAnthropicUpstream({
      routeEnv: params.routeEnv,
      routeSettings: params.routeSettings,
    })
  ) {
    return {
      value: 'anthropic',
      explicit: true,
      source: 'global-env',
    }
  }

  return {
    value: params.defaultTarget.provider,
    explicit: false,
    source: 'default',
  }
}

function getTaskRouteExecutionApiStyleDebugField(params: {
  defaultTarget: TaskRouteExecutionTarget
  routeEnv: TaskRouteDebugRouteEnv
  routeSettings: TaskRouteDebugSettings
  sessionProviderOverride?: TaskRouteProviderName
}): TaskRouteDebugField<TaskRouteApiStyle> {
  const apiStyleFromSessionOverride = inferApiStyleFromProvider(
    params.sessionProviderOverride,
  )
  if (apiStyleFromSessionOverride) {
    return {
      value: apiStyleFromSessionOverride,
      explicit: true,
      source: 'session-override',
    }
  }

  const envApiStyle = normalizeApiStyle(params.routeEnv.apiStyle)
  if (envApiStyle) {
    return {
      value: envApiStyle,
      explicit: true,
      source: 'route-env',
    }
  }

  const settingsApiStyle = normalizeApiStyle(params.routeSettings.apiStyle)
  if (settingsApiStyle) {
    return {
      value: settingsApiStyle,
      explicit: true,
      source: 'route-settings',
    }
  }

  const providerForInference =
    normalizeProviderName(params.routeEnv.provider) ??
    normalizeProviderName(params.routeSettings.provider)
  const inferredFromProvider = inferApiStyleFromProvider(providerForInference)
  if (inferredFromProvider) {
    return {
      value: inferredFromProvider,
      explicit: false,
      source: 'derived-provider',
    }
  }

  if (
    shouldUseGlobalAnthropicUpstream({
      routeEnv: params.routeEnv,
      routeSettings: params.routeSettings,
    })
  ) {
    return {
      value: 'anthropic',
      explicit: true,
      source: 'global-env',
    }
  }

  return {
    value: params.defaultTarget.apiStyle,
    explicit: false,
    source: 'default',
  }
}

function getTaskRouteModelDebugField(params: {
  routeEnv: TaskRouteDebugRouteEnv
  routeSettings: TaskRouteDebugSettings
}): TaskRouteDebugField<string> {
  const envModel = normalizeTaskRouteModel(params.routeEnv.model)
  if (envModel) {
    return {
      value: envModel,
      explicit: true,
      source: 'route-env',
    }
  }

  const settingsModel = normalizeTaskRouteModel(params.routeSettings.model)
  if (settingsModel) {
    return {
      value: settingsModel,
      explicit: true,
      source: 'route-settings',
    }
  }

  return {
    value: undefined,
    explicit: false,
    source: 'none',
  }
}

function getTaskRouteBaseUrlDebugField(params: {
  routeEnv: TaskRouteDebugRouteEnv
  routeSettings: TaskRouteDebugSettings
  executionTarget: TaskRouteExecutionTarget
}): TaskRouteDebugField<string> {
  if (params.routeEnv.baseUrl) {
    return {
      value: params.routeEnv.baseUrl,
      explicit: true,
      source: 'route-env',
    }
  }

  if (params.routeSettings.baseUrl !== undefined) {
    return {
      value: params.routeSettings.baseUrl,
      explicit: true,
      source: 'route-settings',
    }
  }

  if (params.executionTarget.apiStyle === 'anthropic') {
    const globalAnthropicBaseUrl = getGlobalAnthropicBaseUrl()
    if (!globalAnthropicBaseUrl) {
      return {
        value: undefined,
        explicit: false,
        source: 'none',
      }
    }

    return {
      value: globalAnthropicBaseUrl,
      explicit: true,
      source: 'global-env',
    }
  }

  const usesOpenAICompatibleTransport =
    params.executionTarget.apiStyle === 'openai-compatible' ||
    getProviderFamily(params.executionTarget.provider) === 'openai-compatible'
  if (!usesOpenAICompatibleTransport) {
    return {
      value: undefined,
      explicit: false,
      source: 'none',
    }
  }

  const globalBaseUrl = getGlobalOpenAICompatibleBaseUrl()
  if (!globalBaseUrl) {
    return {
      value: undefined,
      explicit: false,
      source: 'none',
    }
  }

  return {
    value: globalBaseUrl,
    explicit: true,
    source: 'global-env',
  }
}

function getTaskRouteApiKeyDebugField(params: {
  routeEnv: TaskRouteDebugRouteEnv
  baseUrlDebugField: TaskRouteDebugField<string>
}): TaskRouteDebugField<string> {
  if (params.routeEnv.apiKey) {
    return {
      value: params.routeEnv.apiKey,
      explicit: true,
      source: 'route-env',
    }
  }

  const usesSingleUpstreamTransport =
    params.baseUrlDebugField.value !== undefined || params.routeEnv.apiKey !== undefined
  if (!usesSingleUpstreamTransport) {
    return {
      value: undefined,
      explicit: false,
      source: 'none',
    }
  }

  const globalApiKey = getGlobalOpenAICompatibleApiKey()
  if (!globalApiKey) {
    return {
      value: undefined,
      explicit: false,
      source: 'none',
    }
  }

  return {
    value: globalApiKey,
    explicit: true,
    source: 'global-env',
  }
}

export function getTaskRouteDebugSnapshot(
  route: TaskRouteName,
  options: TaskRouteDebugSnapshotOptions = {},
  settingsOverride?: TaskRouteSettings,
): TaskRouteDebugSnapshot {
  const includeSecrets = options.includeSecrets === true
  const defaultTarget = DEFAULT_ROUTE_TARGETS[route]
  const routeEnv = getTaskRouteDebugRouteEnv(route)
  const routeSettings = (() => {
    const merged = mergeTaskRouteSettings(getTaskRouteSettings(route), settingsOverride)
    return {
      provider: normalizeConfiguredValue(merged?.provider),
      apiStyle: normalizeConfiguredValue(merged?.apiStyle),
      model: normalizeConfiguredValue(merged?.model),
      baseUrl: merged?.baseUrl?.trim(),
      keyRef: normalizeConfiguredValue(merged?.keyRef),
    }
  })()
  const sessionProviderOverride =
    route === 'main' ? getMainLoopProviderOverride() : undefined
  const providerField = getTaskRouteProviderDebugField({
    route,
    defaultTarget,
    routeEnv,
    routeSettings,
  })
  const executionApiStyleField = getTaskRouteExecutionApiStyleDebugField({
    defaultTarget,
    routeEnv,
    routeSettings,
    sessionProviderOverride,
  })
  const modelField = getTaskRouteModelDebugField({
    routeEnv,
    routeSettings,
  })
  const executionTarget = getTaskRouteExecutionTarget(route, { settingsOverride })
  const transport = getTaskRouteTransportConfig(route, settingsOverride)
  const baseUrlField = getTaskRouteBaseUrlDebugField({
    routeEnv,
    routeSettings,
    executionTarget,
  })
  const apiKeyField = getTaskRouteApiKeyDebugField({
    routeEnv,
    baseUrlDebugField: baseUrlField,
  })
  const apiStyleField: TaskRouteDebugField<TaskRouteApiStyle> =
    routeEnv.baseUrl !== undefined || routeSettings.baseUrl !== undefined
      ? {
          value: transport.apiStyle,
          explicit: true,
          source: 'forced-by-base-url',
        }
      : {
          ...executionApiStyleField,
          value: transport.apiStyle,
        }

  const routeApiKey = includeSecrets
    ? routeEnv.apiKey
    : maskSecret(routeEnv.apiKey)
  const transportApiKey = includeSecrets
    ? transport.apiKey
    : maskSecret(transport.apiKey)

  return {
    route,
    envNames: getTaskRouteEnvNames(route),
    routeEnv: {
      ...routeEnv,
      apiKey: routeApiKey,
    },
    routeSettings,
    executionTarget,
    transportMode: getTaskRouteTransportMode(transport),
    transport: {
      ...transport,
      apiKey: transportApiKey,
    },
    fields: {
      provider: {
        ...providerField,
        value: executionTarget.provider,
      },
      apiStyle: apiStyleField,
      model: {
        ...modelField,
        value: executionTarget.model,
      },
      baseUrl: {
        ...baseUrlField,
        value: transport.baseUrl,
        source: transport.baseUrlSource ?? baseUrlField.source,
      },
      apiKey: {
        ...apiKeyField,
        value: transportApiKey,
        source: transport.apiKeySource ?? apiKeyField.source,
      },
    },
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

function normalizeQuerySource(querySource?: string): string {
  return querySource?.trim().toLowerCase() ?? ''
}

function resolveTaskRouteNameFromNormalizedQuerySource(
  normalized: string,
): TaskRouteName {
  if (!normalized) return 'main'
  if (normalized === 'compact' || normalized === 'session_memory') return 'main'
  if (normalized.startsWith('repl_main_thread')) return 'main'
  if (normalized === 'verification_agent') return 'review'
  if (normalized === 'hook_agent') return 'subagent'
  if (normalized === 'web_search_tool') return 'main'

  const explicitRoute = normalized.match(/:route:(main|subagent|frontend|review|explore|plan|guide|statusline)$/)
  if (explicitRoute?.[1]) {
    return explicitRoute[1] as TaskRouteName
  }

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

export function resolveTaskRouteNameFromQuerySource(
  querySource?: string,
): TaskRouteName {
  return resolveTaskRouteNameFromNormalizedQuerySource(
    normalizeQuerySource(querySource),
  )
}

export function getTaskRouteQuerySourceSnapshot(
  querySource?: string,
): TaskRouteQuerySourceSnapshot {
  const normalizedQuerySource = normalizeQuerySource(querySource)
  return {
    querySource,
    normalizedQuerySource,
    route: resolveTaskRouteNameFromNormalizedQuerySource(normalizedQuerySource),
  }
}

export function getTaskRouteDebugSnapshotFromQuerySource(
  querySource?: string,
  options: TaskRouteDebugSnapshotOptions = {},
): TaskRouteFromQuerySourceDebugSnapshot {
  const querySourceSnapshot = getTaskRouteQuerySourceSnapshot(querySource)
  const overrides = getTaskRouteOverridesFromQuerySource(querySource)
  return {
    ...querySourceSnapshot,
    routeSnapshot: getTaskRouteDebugSnapshot(querySourceSnapshot.route, options, overrides),
  }
}

export function getTaskRoutingDebugSnapshot(
  options: {
    querySources?: readonly (string | undefined)[]
    includeSecrets?: boolean
  } = {},
): TaskRoutingDebugSnapshot {
  const querySourceRoutes = (options.querySources ?? []).map(querySource =>
    getTaskRouteDebugSnapshotFromQuerySource(querySource, {
      includeSecrets: options.includeSecrets,
    }),
  )

  return {
    routes: TASK_ROUTE_NAMES.map(route =>
      getTaskRouteDebugSnapshot(route, {
        includeSecrets: options.includeSecrets,
      }),
    ),
    querySources: querySourceRoutes.map(
      ({ querySource, normalizedQuerySource, route }) => ({
        querySource,
        normalizedQuerySource,
        route,
      }),
    ),
    querySourceRoutes,
  }
}

export function resolveTaskRouteTransportFromQuerySource(querySource?: string) {
  const route = resolveTaskRouteNameFromQuerySource(querySource)
  const overrides = getTaskRouteOverridesFromQuerySource(querySource)
  return {
    route,
    ...getTaskRouteTransportConfig(route, overrides),
  }
}

export function resolveTaskRouteClientConfigFromQuerySource(
  querySource?: string,
): TaskRouteClientConfig {
  const route = resolveTaskRouteNameFromQuerySource(querySource)
  const overrides = getTaskRouteOverridesFromQuerySource(querySource)
  const executionTarget = getTaskRouteExecutionTarget(route, {
    settingsOverride: overrides,
  })
  return {
    route,
    executionTarget,
    ...getTaskRouteTransportConfig(route, overrides),
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
