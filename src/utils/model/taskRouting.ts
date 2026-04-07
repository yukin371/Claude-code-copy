import { createRequire } from 'node:module'
import { getProviderDefaultApiStyle, getProviderFamily } from './providerMetadata.js'
import { getMainLoopProviderOverride } from './sessionProviderOverride.js'

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
}

type TaskRouteDebugSettings = {
  provider?: string
  apiStyle?: string
  model?: string
  baseUrl?: string
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
  'verification_agent',
  'hook_agent',
  'web_search_tool',
  'agent:builtin:explore',
  'agent:builtin:plan',
  'agent:builtin:claude-code-guide',
  'agent:builtin:statusline-setup',
  'agent:builtin:verification',
  'agent:custom',
  'sdk',
] as const

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
  } = {},
): TaskRouteExecutionTarget {
  const defaultTarget = DEFAULT_ROUTE_TARGETS[route]
  const routeSettings = getTaskRouteSettings(route)
  const sessionProviderOverride =
    route === 'main' && !options.ignoreSessionOverride
      ? getMainLoopProviderOverride()
      : undefined
  const provider = process.env[TASK_ROUTE_PROVIDER_ENV[route]]?.trim()
  const apiStyle = process.env[TASK_ROUTE_API_STYLE_ENV[route]]?.trim()
  const model = process.env[TASK_ROUTE_MODEL_ENV[route]]?.trim()
  const configuredProvider =
    sessionProviderOverride ??
    normalizeProviderName(provider) ??
    normalizeProviderName(routeSettings?.provider) ??
    defaultTarget.provider
  const configuredApiStyle =
    inferApiStyleFromProvider(sessionProviderOverride) ??
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
  const routeEnvBaseUrl = process.env[TASK_ROUTE_BASE_URL_ENV[route]]?.trim()
  const settingsBaseUrl = routeSettings?.baseUrl?.trim()
  const explicitBaseUrl = routeEnvBaseUrl || settingsBaseUrl
  const usesOpenAICompatibleTransport =
    explicitBaseUrl !== undefined ||
    target.apiStyle === 'openai-compatible' ||
    getProviderFamily(target.provider) === 'openai-compatible'
  const globalBaseUrl = usesOpenAICompatibleTransport
    ? getGlobalOpenAICompatibleBaseUrl()
    : undefined
  const baseUrl =
    explicitBaseUrl || globalBaseUrl
  const routeApiKey = process.env[TASK_ROUTE_API_KEY_ENV[route]]?.trim()
  const globalApiKey = usesOpenAICompatibleTransport
    ? getGlobalOpenAICompatibleApiKey()
    : undefined
  const transportMode: TaskRouteTransportMode =
    baseUrl !== undefined || routeApiKey !== undefined
      ? 'single-upstream'
      : 'direct-provider'
  const apiKey =
    routeApiKey || (baseUrl !== undefined ? globalApiKey : undefined)
  const baseUrlSource: TaskRouteDebugSource =
    routeEnvBaseUrl !== undefined
      ? 'route-env'
      : settingsBaseUrl !== undefined
        ? 'route-settings'
        : globalBaseUrl !== undefined
          ? 'global-env'
          : 'none'
  const apiKeySource: TaskRouteDebugSource =
    routeApiKey !== undefined
      ? 'route-env'
      : apiKey !== undefined
        ? 'global-env'
        : 'none'

  return {
    ...target,
    apiStyle: explicitBaseUrl ? 'openai-compatible' : target.apiStyle,
    baseUrl,
    apiKey,
    transportMode,
    baseUrlSource,
    apiKeySource,
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
): TaskRouteDebugSnapshot {
  const includeSecrets = options.includeSecrets === true
  const defaultTarget = DEFAULT_ROUTE_TARGETS[route]
  const routeEnv = getTaskRouteDebugRouteEnv(route)
  const routeSettings = getTaskRouteDebugSettings(route)
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
  const executionTarget = getTaskRouteExecutionTarget(route)
  const transport = getTaskRouteTransportConfig(route)
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
      },
      apiKey: {
        ...apiKeyField,
        value: transportApiKey,
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
  return {
    ...querySourceSnapshot,
    routeSnapshot: getTaskRouteDebugSnapshot(querySourceSnapshot.route, options),
  }
}

export function getTaskRoutingDebugSnapshot(
  options: {
    querySources?: readonly (string | undefined)[]
    includeSecrets?: boolean
  } = {},
): TaskRoutingDebugSnapshot {
  return {
    routes: TASK_ROUTE_NAMES.map(route =>
      getTaskRouteDebugSnapshot(route, {
        includeSecrets: options.includeSecrets,
      }),
    ),
    querySources: (options.querySources ?? []).map(querySource =>
      getTaskRouteQuerySourceSnapshot(querySource),
    ),
  }
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
