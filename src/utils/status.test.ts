import { describe, expect, test } from 'bun:test'
import type { TaskRouteDebugSnapshot } from './model/taskRouting.js'
import type { TaskRouteFromQuerySourceDebugSnapshot } from './model/taskRouting.js'
import {
  buildAdditionalTaskRoutePropertiesFromSnapshots,
  buildDoctorRouteSnapshotDiagnostics,
  formatDoctorRouteSnapshotDiagnostic,
} from './status.js'

function makeSnapshot(): TaskRouteDebugSnapshot {
  return {
    route: 'review',
    envNames: {
      provider: 'NEKO_CODE_REVIEW_PROVIDER',
      apiStyle: 'NEKO_CODE_REVIEW_API_STYLE',
      model: 'NEKO_CODE_REVIEW_MODEL',
      baseUrl: 'NEKO_CODE_REVIEW_BASE_URL',
      apiKey: 'NEKO_CODE_REVIEW_API_KEY',
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
      provider: { value: 'codex', explicit: false, source: 'default' },
      apiStyle: {
        value: 'openai-compatible',
        explicit: false,
        source: 'default',
      },
      model: { value: 'gpt-5.4', explicit: true, source: 'defaults' },
      baseUrl: {
        value: 'https://api.openai.com/v1',
        explicit: true,
        source: 'route-settings',
      },
      apiKey: { value: '[masked]', explicit: true, source: 'key-ref-env' },
    },
  }
}

describe('status doctor route diagnostics', () => {
  test('formats route snapshots with config source details', () => {
    const line = formatDoctorRouteSnapshotDiagnostic(makeSnapshot())

    expect(line).toContain('Doctor route snapshot (review):')
    expect(line).toContain('provider=codex (default)')
    expect(line).toContain('model=gpt-5.4 (defaults)')
    expect(line).toContain('resolvedSource=openai_main')
    expect(line).toContain(
      'configSources=model -> defaults.review, provider -> built-in route default, apiStyle -> built-in route default, baseUrl -> taskRoutes.review.baseUrl, apiKey -> provider key ref env',
    )
  })

  test('formats legacy model overrides and expired key refs in doctor diagnostics', () => {
    const line = formatDoctorRouteSnapshotDiagnostic({
      ...makeSnapshot(),
      executionTarget: {
        provider: 'codex',
        apiStyle: 'openai-compatible',
        model: 'legacy-route-model',
      },
      fields: {
        ...makeSnapshot().fields,
        model: {
          value: 'legacy-route-model',
          explicit: true,
          source: 'route-settings',
        },
        apiStyle: {
          value: 'openai-compatible',
          explicit: true,
          source: 'forced-by-base-url',
        },
        apiKey: {
          value: '[masked]',
          explicit: true,
          source: 'key-ref-expired',
        },
      },
    })

    expect(line).toContain('model=legacy-route-model (route-settings)')
    expect(line).toContain(
      'configSources=model -> taskRoutes.review.model (legacy override), provider -> built-in route default, apiStyle -> forced by baseUrl, baseUrl -> taskRoutes.review.baseUrl, apiKey -> expired provider key ref',
    )
  })

  test('builds doctor diagnostics for every supplied route snapshot', () => {
    const diagnostics = buildDoctorRouteSnapshotDiagnostics([
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
    ])

    expect(diagnostics).toHaveLength(2)
    expect(diagnostics[0]).toContain('Doctor route snapshot (review):')
    expect(diagnostics[1]).toContain('Doctor route snapshot (subagent):')
  })
})

describe('status task route properties', () => {
  test('builds matrix, config matrix, and hints from supplied snapshots', () => {
    const routeSnapshots: TaskRouteDebugSnapshot[] = [
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
    ]
    const querySourceSnapshots: TaskRouteFromQuerySourceDebugSnapshot[] = [
      {
        querySource: 'agent:builtin:general-purpose:route:review',
        normalizedQuerySource: 'agent:builtin:general-purpose:route:review',
        route: 'review',
        querySourceRuleOverrideFields: ['model'],
        routeSnapshot: makeSnapshot(),
      },
    ]

    const properties = buildAdditionalTaskRoutePropertiesFromSnapshots(
      routeSnapshots,
      querySourceSnapshots,
    )

    expect(properties).toHaveLength(3)
    expect(properties[0]).toEqual({
      label: 'Task route matrix',
      value: [
        expect.stringContaining('review:'),
        expect.stringContaining('subagent:'),
      ],
    })
    expect(properties[1]).toEqual({
      label: 'Task route config matrix',
      value: expect.arrayContaining([
        expect.stringContaining('review: model -> defaults.review'),
        expect.stringContaining('subagent: model -> defaults.subagent'),
      ]),
    })
    expect(properties[2]).toEqual({
      label: 'Task route hints',
      value: [expect.stringContaining('ruleOverride=model')],
    })
  })
})
