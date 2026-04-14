export const TASK_ROUTE_MAIN_PROVIDER_OPTIONS = [
  'anthropic',
  'codex',
  'gemini',
  'glm',
  'minimax',
  'openai-compatible',
] as const

export const TASK_ROUTE_MAIN_API_STYLE_OPTIONS = [
  'anthropic',
  'openai-compatible',
] as const

export const TASK_ROUTE_MAIN_UNSET = '__unset__' as const

export const ROUTE_DEFAULT_MODEL_ROUTES = [
  'subagent',
  'frontend',
  'review',
  'explore',
  'plan',
  'guide',
  'statusline',
] as const

export type TaskRouteMainProvider =
  (typeof TASK_ROUTE_MAIN_PROVIDER_OPTIONS)[number]
export type TaskRouteMainApiStyle =
  (typeof TASK_ROUTE_MAIN_API_STYLE_OPTIONS)[number]
export type RouteDefaultModelRoute = (typeof ROUTE_DEFAULT_MODEL_ROUTES)[number]

export type TaskRouteMainTransportSettings = {
  provider?: TaskRouteMainProvider
  apiStyle?: TaskRouteMainApiStyle
  model?: string
  baseUrl?: string
}

export type MainRouteConfig = {
  model?: string
  provider?: TaskRouteMainProvider
  apiStyle?: TaskRouteMainApiStyle
  baseUrl?: string
}

const ROUTE_DEFAULT_MODEL_LABELS: Record<RouteDefaultModelRoute, string> = {
  subagent: 'Subagent route default model',
  frontend: 'Frontend route default model',
  review: 'Review route default model',
  explore: 'Explore route default model',
  plan: 'Plan route default model',
  guide: 'Guide route default model',
  statusline: 'Statusline route default model',
}

function normalizeText(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function normalizeTaskRouteMainText(value: string): string | undefined {
  return normalizeText(value)
}

export function getTaskRouteMainTransportSettings(
  settings: unknown,
): TaskRouteMainTransportSettings {
  const taskRoutes = (settings as {
    taskRoutes?: Record<string, TaskRouteMainTransportSettings | undefined>
  } | undefined)?.taskRoutes
  const main = taskRoutes?.main
  return main ? { ...main } : {}
}

export function getMainRouteConfig(settings: unknown): MainRouteConfig {
  const defaults = (settings as {
    defaults?: {
      main?: string
    }
  } | undefined)?.defaults
  const mainTransport = getTaskRouteMainTransportSettings(settings)

  return {
    model:
      normalizeText(defaults?.main ?? '') ??
      normalizeText(mainTransport.model ?? ''),
    provider: mainTransport.provider,
    apiStyle: mainTransport.apiStyle,
    baseUrl: normalizeText(mainTransport.baseUrl ?? ''),
  }
}

export function getRouteDefaultModel(
  settings: unknown,
  route: RouteDefaultModelRoute,
): string | undefined {
  const defaults = (settings as {
    defaults?: Partial<Record<RouteDefaultModelRoute, string | undefined>>
  } | undefined)?.defaults
  return normalizeText(defaults?.[route] ?? '')
}

export function getRouteDefaultModelLabel(
  route: RouteDefaultModelRoute,
): string {
  return ROUTE_DEFAULT_MODEL_LABELS[route]
}

export function formatMainRouteConfigValue(config: MainRouteConfig): string {
  const model = config.model ?? '[default]'
  const provider = config.provider ?? '[default]'
  const apiStyle = config.apiStyle ?? '[default]'
  const baseUrl = config.baseUrl ?? '[default]'
  return `defaultModel=${model}, providerOverride=${provider}, apiStyleOverride=${apiStyle}, baseUrlOverride=${baseUrl}`
}
