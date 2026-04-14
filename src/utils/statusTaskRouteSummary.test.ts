import { describe, expect, test } from 'bun:test'
import type {
  TaskRouteDebugSnapshot,
  TaskRouteFromQuerySourceDebugSnapshot,
} from './model/taskRouting.js'
import {
  formatQuerySourceTaskRouteSummaryLine,
  formatTaskRouteSummaryLine,
} from './statusTaskRouteSummary.js'

function makeSnapshot(
  overrides: Partial<TaskRouteDebugSnapshot> = {},
): TaskRouteDebugSnapshot {
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
    ...overrides,
  }
}

describe('statusTaskRouteSummary', () => {
  test('formats route summaries with model source and resolved source', () => {
    const line = formatTaskRouteSummaryLine('review', makeSnapshot())

    expect(line).toContain('review:')
    expect(line).toContain('model=gpt-5.4 (defaults)')
    expect(line).toContain('resolvedSource=openai_main')
    expect(line).toContain(
      'config=model:defaults.review, baseUrl:taskRoutes.review.baseUrl, apiKey:provider key ref env',
    )
    expect(line).toContain('baseUrl=https://api.openai.com/v1')
  })

  test('formats querySource summaries from route snapshots', () => {
    const line = formatQuerySourceTaskRouteSummaryLine({
      querySource: 'agent:builtin:general-purpose:route:review',
      normalizedQuerySource: 'agent:builtin:general-purpose:route:review',
      route: 'review',
      querySourceRuleOverrideFields: ['model', 'provider'],
      routeSnapshot: makeSnapshot(),
    } satisfies TaskRouteFromQuerySourceDebugSnapshot)

    expect(line).toContain('agent:builtin:general-purpose:route:review -> review:')
    expect(line).toContain('model=gpt-5.4 (defaults)')
    expect(line).toContain('resolvedSource=openai_main')
    expect(line).toContain(
      'config=model:defaults.review, baseUrl:taskRoutes.review.baseUrl, apiKey:provider key ref env',
    )
    expect(line).toContain('ruleOverride=model+provider')
  })

  test('formats legacy and exceptional source summaries for route snapshots', () => {
    const line = formatTaskRouteSummaryLine(
      'review',
      makeSnapshot({
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
            value: 'unset',
            explicit: true,
            source: 'key-ref-missing',
          },
        },
      }),
    )

    expect(line).toContain('model=legacy-route-model (route-settings)')
    expect(line).toContain(
      'config=model:taskRoutes.review.model (legacy override), apiStyle:forced by baseUrl, baseUrl:taskRoutes.review.baseUrl, apiKey:missing provider key ref',
    )
  })
})
