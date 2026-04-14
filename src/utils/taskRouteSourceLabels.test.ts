import { describe, expect, test } from 'bun:test'
import type { TaskRouteDebugSnapshot } from './model/taskRouting.js'
import {
  buildTaskRouteCompactConfigSourceSummary,
  buildTaskRouteConfigSourceLines,
  buildTaskRouteNamedConfigSourceLines,
  formatTaskRouteSourceLabel,
} from './taskRouteSourceLabels.js'

function makeSnapshot(): TaskRouteDebugSnapshot {
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
      provider: 'openai-compatible',
      apiStyle: 'openai-compatible',
      model: 'gpt-5.4',
    },
    transport: {
      provider: 'openai-compatible',
      apiStyle: 'openai-compatible',
      model: 'gpt-5.4',
    },
    transportMode: 'single-upstream',
    fields: {
      provider: {
        value: 'openai-compatible',
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
        value: 'https://proxy.example.com/v1',
        explicit: true,
        source: 'route-env',
      },
      apiKey: {
        value: '[masked]',
        explicit: true,
        source: 'key-ref-env',
      },
    },
  }
}

describe('taskRouteSourceLabels', () => {
  test('maps task route debug sources to readable labels', () => {
    expect(
      formatTaskRouteSourceLabel({
        route: 'main',
        field: 'model',
        source: 'defaults',
      }),
    ).toBe('defaults.main')
    expect(
      formatTaskRouteSourceLabel({
        route: 'review',
        field: 'provider',
        source: 'route-settings',
      }),
    ).toBe('taskRoutes.review.provider')
    expect(
      formatTaskRouteSourceLabel({
        route: 'review',
        field: 'model',
        source: 'route-settings',
      }),
    ).toBe('taskRoutes.review.model (legacy override)')
    expect(
      formatTaskRouteSourceLabel({
        route: 'review',
        field: 'baseUrl',
        source: 'forced-by-base-url',
      }),
    ).toBe('forced by baseUrl')
    expect(
      formatTaskRouteSourceLabel({
        route: 'review',
        field: 'apiKey',
        source: 'key-ref-missing',
      }),
    ).toBe('missing provider key ref')
    expect(
      formatTaskRouteSourceLabel({
        route: 'review',
        field: 'apiKey',
        source: 'key-ref-expired',
      }),
    ).toBe('expired provider key ref')
  })

  test('builds a per-field source summary for status and doctor', () => {
    expect(buildTaskRouteConfigSourceLines(makeSnapshot())).toEqual([
      'model -> defaults.main',
      'provider -> taskRoutes.main.provider',
      'apiStyle -> derived from provider selection',
      'baseUrl -> NEKO_CODE_MAIN_BASE_URL',
      'apiKey -> provider key ref env',
    ])
  })

  test('builds a compact config source summary for route matrix lines', () => {
    expect(buildTaskRouteCompactConfigSourceSummary(makeSnapshot())).toBe(
      'model:defaults.main, provider:taskRoutes.main.provider, baseUrl:NEKO_CODE_MAIN_BASE_URL, apiKey:provider key ref env',
    )
  })

  test('builds route-prefixed config source lines for non-main route matrix details', () => {
    expect(buildTaskRouteNamedConfigSourceLines(makeSnapshot())).toEqual([
      'main: model -> defaults.main',
      'main: provider -> taskRoutes.main.provider',
      'main: apiStyle -> derived from provider selection',
      'main: baseUrl -> NEKO_CODE_MAIN_BASE_URL',
      'main: apiKey -> provider key ref env',
    ])
  })

  test('keeps legacy and exceptional sources explicit in compact summaries', () => {
    const summary = buildTaskRouteCompactConfigSourceSummary({
      ...makeSnapshot(),
      route: 'review',
      envNames: {
        provider: 'NEKO_CODE_REVIEW_PROVIDER',
        apiStyle: 'NEKO_CODE_REVIEW_API_STYLE',
        model: 'NEKO_CODE_REVIEW_MODEL',
        baseUrl: 'NEKO_CODE_REVIEW_BASE_URL',
        apiKey: 'NEKO_CODE_REVIEW_API_KEY',
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
          source: 'key-ref-expired',
        },
      },
    })

    expect(summary).toBe(
      'model:taskRoutes.review.model (legacy override), provider:taskRoutes.review.provider, apiStyle:forced by baseUrl, baseUrl:NEKO_CODE_REVIEW_BASE_URL, apiKey:expired provider key ref',
    )
  })
})
