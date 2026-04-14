import type {
  TaskRouteDebugSnapshot,
  TaskRouteDebugSource,
  TaskRouteName,
} from './model/taskRouting.js'

type TaskRouteFieldName =
  | 'provider'
  | 'apiStyle'
  | 'model'
  | 'baseUrl'
  | 'apiKey'

function formatTaskRouteSettingsPath(
  route: TaskRouteName,
  field: TaskRouteFieldName,
): string {
  if (field === 'model') {
    return `taskRoutes.${route}.model (legacy override)`
  }
  return `taskRoutes.${route}.${field}`
}

export function formatTaskRouteSourceLabel(params: {
  route: TaskRouteName
  field: TaskRouteFieldName
  source: TaskRouteDebugSource
  envName?: string
}): string {
  switch (params.source) {
    case 'defaults':
      return `defaults.${params.route}`
    case 'route-settings':
      return formatTaskRouteSettingsPath(params.route, params.field)
    case 'route-env':
      return params.envName ?? 'route env'
    case 'global-env':
      return params.field === 'provider' || params.field === 'apiStyle'
        ? 'global anthropic fallback'
        : params.field === 'baseUrl'
          ? 'global base URL env'
          : 'global API key env'
    case 'session-override':
      return 'current session override'
    case 'derived-provider':
      return 'derived from provider selection'
    case 'forced-by-base-url':
      return 'forced by baseUrl'
    case 'key-ref':
      return 'provider key ref'
    case 'key-ref-env':
      return 'provider key ref env'
    case 'key-ref-missing':
      return 'missing provider key ref'
    case 'key-ref-expired':
      return 'expired provider key ref'
    case 'key-ref-model-denied':
      return 'provider key model denylist'
    case 'default':
      return 'built-in route default'
    case 'none':
      return 'unset'
  }
}

export function buildTaskRouteConfigSourceLines(
  snapshot: TaskRouteDebugSnapshot,
): string[] {
  return [
    `model -> ${formatTaskRouteSourceLabel({
      route: snapshot.route,
      field: 'model',
      source: snapshot.fields.model.source,
      envName: snapshot.envNames.model,
    })}`,
    `provider -> ${formatTaskRouteSourceLabel({
      route: snapshot.route,
      field: 'provider',
      source: snapshot.fields.provider.source,
      envName: snapshot.envNames.provider,
    })}`,
    `apiStyle -> ${formatTaskRouteSourceLabel({
      route: snapshot.route,
      field: 'apiStyle',
      source: snapshot.fields.apiStyle.source,
      envName: snapshot.envNames.apiStyle,
    })}`,
    `baseUrl -> ${formatTaskRouteSourceLabel({
      route: snapshot.route,
      field: 'baseUrl',
      source: snapshot.fields.baseUrl.source,
      envName: snapshot.envNames.baseUrl,
    })}`,
    `apiKey -> ${formatTaskRouteSourceLabel({
      route: snapshot.route,
      field: 'apiKey',
      source: snapshot.fields.apiKey.source,
      envName: snapshot.envNames.apiKey,
    })}`,
  ]
}

export function buildTaskRouteCompactConfigSourceSummary(
  snapshot: TaskRouteDebugSnapshot,
): string {
  const parts = [
    `model:${formatTaskRouteSourceLabel({
      route: snapshot.route,
      field: 'model',
      source: snapshot.fields.model.source,
      envName: snapshot.envNames.model,
    })}`,
  ]

  if (snapshot.fields.provider.source !== 'default') {
    parts.push(
      `provider:${formatTaskRouteSourceLabel({
        route: snapshot.route,
        field: 'provider',
        source: snapshot.fields.provider.source,
        envName: snapshot.envNames.provider,
      })}`,
    )
  }

  if (
    snapshot.fields.apiStyle.source !== 'default' &&
    snapshot.fields.apiStyle.source !== 'derived-provider'
  ) {
    parts.push(
      `apiStyle:${formatTaskRouteSourceLabel({
        route: snapshot.route,
        field: 'apiStyle',
        source: snapshot.fields.apiStyle.source,
        envName: snapshot.envNames.apiStyle,
      })}`,
    )
  }

  if (
    snapshot.fields.baseUrl.source !== 'default' &&
    snapshot.fields.baseUrl.source !== 'none'
  ) {
    parts.push(
      `baseUrl:${formatTaskRouteSourceLabel({
        route: snapshot.route,
        field: 'baseUrl',
        source: snapshot.fields.baseUrl.source,
        envName: snapshot.envNames.baseUrl,
      })}`,
    )
  }

  if (
    snapshot.fields.apiKey.source !== 'default' &&
    snapshot.fields.apiKey.source !== 'none'
  ) {
    parts.push(
      `apiKey:${formatTaskRouteSourceLabel({
        route: snapshot.route,
        field: 'apiKey',
        source: snapshot.fields.apiKey.source,
        envName: snapshot.envNames.apiKey,
      })}`,
    )
  }

  return parts.join(', ')
}

export function buildTaskRouteNamedConfigSourceLines(
  snapshot: TaskRouteDebugSnapshot,
): string[] {
  return buildTaskRouteConfigSourceLines(snapshot).map(
    line => `${snapshot.route}: ${line}`,
  )
}
