import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  resetMainLoopProviderOverrideForTests,
  setMainLoopProviderOverride,
} from './sessionProviderOverride.js'

type EnvSnapshot = Record<string, string | undefined>

const ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'OPENAI_BASE_URL',
  'OPENAI_API_KEY',
  'NEKO_CODE_OPENAI_COMPATIBLE_BASE_URL',
  'NEKO_CODE_OPENAI_COMPATIBLE_API_KEY',
  'NEKO_CODE_MAIN_PROVIDER',
  'NEKO_CODE_MAIN_API_STYLE',
  'NEKO_CODE_MAIN_MODEL',
  'NEKO_CODE_MAIN_BASE_URL',
  'NEKO_CODE_MAIN_API_KEY',
  'NEKO_CODE_PLAN_BASE_URL',
  'NEKO_CODE_PLAN_API_KEY',
] as const

function snapshotEnv(keys: readonly string[]): EnvSnapshot {
  return Object.fromEntries(keys.map(key => [key, process.env[key]]))
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key]
      continue
    }
    process.env[key] = value
  }
}

describe('taskRouting transport compatibility', () => {
  let envSnapshot: EnvSnapshot

  beforeEach(() => {
    envSnapshot = snapshotEnv(ENV_KEYS)
    resetMainLoopProviderOverrideForTests()
  })

  afterEach(() => {
    restoreEnv(envSnapshot)
    resetMainLoopProviderOverrideForTests()
  })

  test('anthropic routes ignore global openai-compatible transport defaults', async () => {
    process.env.OPENAI_BASE_URL = 'https://gateway.example.com/v1'
    process.env.OPENAI_API_KEY = 'shared-openai-key'

    const { getTaskRouteTransportConfig } = await import('./taskRouting.js')
    const route = getTaskRouteTransportConfig('plan')

    expect(route.provider).toBe('anthropic')
    expect(route.apiStyle).toBe('anthropic')
    expect(route.baseUrl).toBeUndefined()
    expect(route.apiKey).toBeUndefined()
  })

  test('openai-compatible routes still inherit global openai-compatible defaults', async () => {
    process.env.NEKO_CODE_OPENAI_COMPATIBLE_BASE_URL =
      'https://gateway.example.com/v1'
    process.env.NEKO_CODE_OPENAI_COMPATIBLE_API_KEY = 'shared-openai-key'

    const { getTaskRouteTransportConfig } = await import('./taskRouting.js')
    const route = getTaskRouteTransportConfig('main')

    expect(route.provider).toBe('glm')
    expect(route.apiStyle).toBe('openai-compatible')
    expect(route.baseUrl).toBe('https://gateway.example.com/v1')
    expect(route.apiKey).toBe('shared-openai-key')
    expect(route.transportMode).toBe('single-upstream')
  })

  test('global anthropic base url pins default routes to anthropic single-upstream', async () => {
    process.env.ANTHROPIC_BASE_URL = 'https://gateway.example.com/v1/messages'

    const { getTaskRouteTransportConfig } = await import('./taskRouting.js')
    const mainRoute = getTaskRouteTransportConfig('main')
    const subagentRoute = getTaskRouteTransportConfig('subagent')

    expect(mainRoute.provider).toBe('anthropic')
    expect(mainRoute.apiStyle).toBe('anthropic')
    expect(mainRoute.baseUrl).toBe('https://gateway.example.com/v1/messages')
    expect(mainRoute.transportMode).toBe('single-upstream')

    expect(subagentRoute.provider).toBe('anthropic')
    expect(subagentRoute.apiStyle).toBe('anthropic')
    expect(subagentRoute.baseUrl).toBe('https://gateway.example.com/v1/messages')
    expect(subagentRoute.transportMode).toBe('single-upstream')
  })

  test('explicit route base url can still switch an anthropic route to openai-compatible', async () => {
    process.env.NEKO_CODE_PLAN_BASE_URL = 'https://custom-gateway.example.com/v1'
    process.env.OPENAI_API_KEY = 'shared-openai-key'

    const { getTaskRouteTransportConfig } = await import('./taskRouting.js')
    const route = getTaskRouteTransportConfig('plan')

    expect(route.provider).toBe('anthropic')
    expect(route.apiStyle).toBe('openai-compatible')
    expect(route.baseUrl).toBe('https://custom-gateway.example.com/v1')
    expect(route.apiKey).toBe('shared-openai-key')
    expect(route.transportMode).toBe('single-upstream')
  })

  test('global openai-compatible apiKey alone does not pin direct-provider routing', async () => {
    process.env.NEKO_CODE_OPENAI_COMPATIBLE_API_KEY = 'shared-openai-key'

    const { getTaskRouteTransportConfig } = await import('./taskRouting.js')
    const route = getTaskRouteTransportConfig('main')

    expect(route.provider).toBe('glm')
    expect(route.apiStyle).toBe('openai-compatible')
    expect(route.baseUrl).toBeUndefined()
    expect(route.apiKey).toBeUndefined()
    expect(route.transportMode).toBe('direct-provider')
  })

  test('main route prefers session provider override over env provider', async () => {
    process.env.NEKO_CODE_MAIN_PROVIDER = 'anthropic'
    setMainLoopProviderOverride('gemini')

    const { getTaskRouteExecutionTarget } = await import('./taskRouting.js')
    const route = getTaskRouteExecutionTarget('main')
    const baseRoute = getTaskRouteExecutionTarget('main', {
      ignoreSessionOverride: true,
    })

    expect(route.provider).toBe('gemini')
    expect(route.apiStyle).toBe('openai-compatible')
    expect(baseRoute.provider).toBe('anthropic')
    expect(baseRoute.apiStyle).toBe('anthropic')
  })

  test('querySource snapshot reports expected querySource -> route mapping', async () => {
    const { getTaskRoutingDebugSnapshot } = await import('./taskRouting.js')
    const snapshot = getTaskRoutingDebugSnapshot({
      querySources: [
        'compact',
        'verification_agent',
        'agent:builtin:plan',
        'agent:builtin:statusline-setup',
        'agent:custom',
        'agent:custom:route:frontend',
        'agent:builtin:general-purpose:route:review',
        'web_search_tool',
      ],
    })

    expect(snapshot.routes.map(route => route.route)).toEqual([
      'main',
      'subagent',
      'frontend',
      'review',
      'explore',
      'plan',
      'guide',
      'statusline',
    ])
    expect(snapshot.querySources).toEqual([
      {
        querySource: 'compact',
        normalizedQuerySource: 'compact',
        route: 'main',
      },
      {
        querySource: 'verification_agent',
        normalizedQuerySource: 'verification_agent',
        route: 'review',
      },
      {
        querySource: 'agent:builtin:plan',
        normalizedQuerySource: 'agent:builtin:plan',
        route: 'plan',
      },
      {
        querySource: 'agent:builtin:statusline-setup',
        normalizedQuerySource: 'agent:builtin:statusline-setup',
        route: 'statusline',
      },
      {
        querySource: 'agent:custom',
        normalizedQuerySource: 'agent:custom',
        route: 'subagent',
      },
      {
        querySource: 'agent:custom:route:frontend',
        normalizedQuerySource: 'agent:custom:route:frontend',
        route: 'frontend',
      },
      {
        querySource: 'agent:builtin:general-purpose:route:review',
        normalizedQuerySource: 'agent:builtin:general-purpose:route:review',
        route: 'review',
      },
      {
        querySource: 'web_search_tool',
        normalizedQuerySource: 'web_search_tool',
        route: 'main',
      },
    ])
  })

  test('debug snapshot marks provider env override and global transport fallback', async () => {
    process.env.NEKO_CODE_MAIN_PROVIDER = 'gemini'
    process.env.NEKO_CODE_OPENAI_COMPATIBLE_BASE_URL =
      'https://gateway.example.com/v1'
    process.env.NEKO_CODE_OPENAI_COMPATIBLE_API_KEY = 'shared-openai-key'

    const { getTaskRouteDebugSnapshot } = await import('./taskRouting.js')
    const snapshot = getTaskRouteDebugSnapshot('main')

    expect(snapshot.route).toBe('main')
    expect(snapshot.transport.provider).toBe('gemini')
    expect(snapshot.transport.apiStyle).toBe('openai-compatible')
    expect(snapshot.fields.provider.source).toBe('route-env')
    expect(snapshot.fields.provider.explicit).toBe(true)
    expect(snapshot.fields.baseUrl.source).toBe('global-env')
    expect(snapshot.fields.baseUrl.explicit).toBe(true)
    expect(snapshot.fields.apiKey.source).toBe('global-env')
    expect(snapshot.fields.apiKey.explicit).toBe(true)
    expect(snapshot.transportMode).toBe('single-upstream')
  })

  test('debug snapshot reflects global anthropic gateway fallback', async () => {
    process.env.ANTHROPIC_BASE_URL = 'https://gateway.example.com/v1/messages'

    const { getTaskRouteDebugSnapshot } = await import('./taskRouting.js')
    const snapshot = getTaskRouteDebugSnapshot('main')

    expect(snapshot.transport.provider).toBe('anthropic')
    expect(snapshot.transport.apiStyle).toBe('anthropic')
    expect(snapshot.transport.baseUrl).toBe(
      'https://gateway.example.com/v1/messages',
    )
    expect(snapshot.fields.provider.source).toBe('global-env')
    expect(snapshot.fields.provider.explicit).toBe(true)
    expect(snapshot.fields.apiStyle.source).toBe('global-env')
    expect(snapshot.fields.apiStyle.explicit).toBe(true)
    expect(snapshot.fields.baseUrl.source).toBe('global-env')
    expect(snapshot.transportMode).toBe('single-upstream')
  })

  test('debug snapshot keeps explicit baseUrl forcing openai-compatible apiStyle', async () => {
    process.env.NEKO_CODE_PLAN_BASE_URL = 'https://custom-gateway.example.com/v1'
    process.env.OPENAI_API_KEY = 'shared-openai-key'

    const { getTaskRouteDebugSnapshot } = await import('./taskRouting.js')
    const snapshot = getTaskRouteDebugSnapshot('plan')

    expect(snapshot.transport.provider).toBe('anthropic')
    expect(snapshot.transport.apiStyle).toBe('openai-compatible')
    expect(snapshot.fields.baseUrl.source).toBe('route-env')
    expect(snapshot.fields.baseUrl.explicit).toBe(true)
    expect(snapshot.fields.apiStyle.source).toBe('forced-by-base-url')
    expect(snapshot.fields.apiStyle.explicit).toBe(true)
    expect(snapshot.fields.apiKey.source).toBe('global-env')
    expect(snapshot.transportMode).toBe('single-upstream')
  })

  test('debug snapshot keeps global apiKey-only routes in direct-provider mode', async () => {
    process.env.NEKO_CODE_OPENAI_COMPATIBLE_API_KEY = 'shared-openai-key'

    const { getTaskRouteDebugSnapshot } = await import('./taskRouting.js')
    const snapshot = getTaskRouteDebugSnapshot('main')

    expect(snapshot.transport.baseUrl).toBeUndefined()
    expect(snapshot.transport.apiKey).toBeUndefined()
    expect(snapshot.fields.apiKey.source).toBe('none')
    expect(snapshot.transportMode).toBe('direct-provider')
  })

  test('debug snapshot masks apiKey by default across route and querySource helpers', async () => {
    process.env.NEKO_CODE_MAIN_API_KEY = 'main-route-secret'

    const {
      getTaskRouteDebugSnapshot,
      getTaskRouteDebugSnapshotFromQuerySource,
      getTaskRoutingDebugSnapshot,
    } = await import('./taskRouting.js')
    const routeSnapshot = getTaskRouteDebugSnapshot('main')
    const querySourceSnapshot =
      getTaskRouteDebugSnapshotFromQuerySource('repl_main_thread')
    const routingSnapshot = getTaskRoutingDebugSnapshot({
      querySources: ['compact'],
    })
    const mainRouteSnapshot = routingSnapshot.routes.find(
      route => route.route === 'main',
    )

    expect(routeSnapshot.routeEnv.apiKey).toBe('[masked]')
    expect(routeSnapshot.transport.apiKey).toBe('[masked]')
    expect(routeSnapshot.fields.apiKey.value).toBe('[masked]')
    expect(querySourceSnapshot.routeSnapshot.transport.apiKey).toBe('[masked]')
    expect(mainRouteSnapshot?.transport.apiKey).toBe('[masked]')
    expect(JSON.stringify(routeSnapshot)).not.toContain('main-route-secret')
  })

  test('debug snapshot can include raw apiKey only when includeSecrets is true', async () => {
    process.env.NEKO_CODE_MAIN_API_KEY = 'main-route-secret'

    const {
      getTaskRouteDebugSnapshot,
      getTaskRouteDebugSnapshotFromQuerySource,
      getTaskRoutingDebugSnapshot,
    } = await import('./taskRouting.js')
    const routeSnapshot = getTaskRouteDebugSnapshot('main', {
      includeSecrets: true,
    })
    const querySourceSnapshot = getTaskRouteDebugSnapshotFromQuerySource(
      'repl_main_thread',
      {
        includeSecrets: true,
      },
    )
    const routingSnapshot = getTaskRoutingDebugSnapshot({
      querySources: ['compact'],
      includeSecrets: true,
    })
    const mainRouteSnapshot = routingSnapshot.routes.find(
      route => route.route === 'main',
    )

    expect(routeSnapshot.routeEnv.apiKey).toBe('main-route-secret')
    expect(routeSnapshot.transport.apiKey).toBe('main-route-secret')
    expect(routeSnapshot.fields.apiKey.value).toBe('main-route-secret')
    expect(querySourceSnapshot.routeSnapshot.transport.apiKey).toBe(
      'main-route-secret',
    )
    expect(mainRouteSnapshot?.transport.apiKey).toBe('main-route-secret')
  })
})
