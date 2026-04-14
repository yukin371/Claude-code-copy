import { describe, expect, test } from 'bun:test'
import type { DiagnosticInfo } from '../utils/doctorDiagnostic.js'
import { getMainRouteSummary, getTaskRouteSummaries } from './Doctor.js'

function makeSnapshot(): DiagnosticInfo['currentTaskRouteSnapshot'] {
  return {
    route: 'main',
    envNames: {
      provider: 'NEKO_CODE_MAIN_PROVIDER',
      apiStyle: 'NEKO_CODE_MAIN_API_STYLE',
      model: 'NEKO_CODE_MAIN_MODEL',
      baseUrl: 'NEKO_CODE_MAIN_BASE_URL',
      apiKey: 'NEKO_CODE_MAIN_API_KEY',
    },
    routeEnv: {},
    routeSettings: {},
    executionTarget: {
      provider: 'codex',
      apiStyle: 'openai-compatible',
      model: 'gpt-5.4',
    },
    transport: {
      provider: 'codex',
      apiStyle: 'openai-compatible',
      model: 'gpt-5.4',
      resolvedSourceId: 'openai_main',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '[masked]',
    },
    transportMode: 'single-upstream',
    fields: {
      provider: {
        value: 'codex',
        explicit: true,
        source: 'route-settings',
      },
      apiStyle: {
        value: 'openai-compatible',
        explicit: false,
        source: 'derived-provider',
      },
      model: {
        value: 'gpt-5.4',
        explicit: true,
        source: 'defaults',
      },
      baseUrl: {
        value: 'https://api.openai.com/v1',
        explicit: true,
        source: 'route-settings',
      },
      apiKey: {
        value: 'secret-key',
        explicit: true,
        source: 'key-ref-env',
      },
    },
  }
}

describe('Doctor route summary', () => {
  test('returns null when route snapshot is unavailable', () => {
    expect(getMainRouteSummary(null)).toBeNull()
  })

  test('summarizes the main route and masks api key values', () => {
    const line = getMainRouteSummary(makeSnapshot())

    expect(line).toContain('route=main')
    expect(line).toContain('provider=codex (route-settings)')
    expect(line).toContain('apiStyle=openai-compatible (derived-provider)')
    expect(line).toContain('model=gpt-5.4 (defaults)')
    expect(line).toContain('baseUrl=https://api.openai.com/v1 (route-settings)')
    expect(line).toContain('apiKey=[masked] (key-ref-env)')
  })

  test('builds multi-route summaries from diagnostic snapshots', () => {
    const summaries = getTaskRouteSummaries({
      currentTaskRouteSnapshot: makeSnapshot(),
      taskRouteSnapshots: [
        makeSnapshot(),
        {
          ...makeSnapshot(),
          route: 'subagent',
          envNames: {
            provider: 'NEKO_CODE_SUBAGENT_PROVIDER',
            apiStyle: 'NEKO_CODE_SUBAGENT_API_STYLE',
            model: 'NEKO_CODE_SUBAGENT_MODEL',
            baseUrl: 'NEKO_CODE_SUBAGENT_BASE_URL',
            apiKey: 'NEKO_CODE_SUBAGENT_API_KEY',
          },
        },
      ],
    })

    expect(summaries).toHaveLength(2)
    expect(summaries[0]).toContain('route=main')
    expect(summaries[1]).toContain('route=subagent')
  })

  test('falls back to currentTaskRouteSnapshot when route snapshot list is absent', () => {
    const summaries = getTaskRouteSummaries({
      currentTaskRouteSnapshot: makeSnapshot(),
      taskRouteSnapshots: [],
    })

    expect(summaries).toEqual([expect.stringContaining('route=main')])
  })
})
