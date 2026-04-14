import { describe, expect, test } from 'bun:test'
import {
  formatMainRouteConfigValue,
  getMainRouteConfig,
  getRouteDefaultModel,
  getRouteDefaultModelLabel,
} from './mainRouteConfig.js'

describe('mainRouteConfig', () => {
  test('prefers defaults.main over generated taskRoutes.main.model', () => {
    const config = getMainRouteConfig({
      defaults: {
        main: 'gpt-5.4',
      },
      taskRoutes: {
        main: {
          provider: 'openai-compatible',
          model: 'legacy-route-model',
          baseUrl: 'https://api.example.com/v1',
        },
      },
    })

    expect(config).toEqual({
      model: 'gpt-5.4',
      provider: 'openai-compatible',
      apiStyle: undefined,
      baseUrl: 'https://api.example.com/v1',
    })
  })

  test('falls back to legacy taskRoutes.main.model when defaults.main is absent', () => {
    const config = getMainRouteConfig({
      taskRoutes: {
        main: {
          provider: 'anthropic',
          apiStyle: 'anthropic',
          model: 'sonnet',
        },
      },
    })

    expect(config).toEqual({
      model: 'sonnet',
      provider: 'anthropic',
      apiStyle: 'anthropic',
      baseUrl: undefined,
    })
  })

  test('formats the combined main-route summary with default model and overrides', () => {
    expect(
      formatMainRouteConfigValue({
        model: 'glm-4.5',
        provider: 'openai-compatible',
        apiStyle: 'openai-compatible',
        baseUrl: 'https://proxy.example.com/v1',
      }),
    ).toBe(
      'defaultModel=glm-4.5, providerOverride=openai-compatible, apiStyleOverride=openai-compatible, baseUrlOverride=https://proxy.example.com/v1',
    )
  })

  test('reads non-main route defaults and labels', () => {
    expect(
      getRouteDefaultModel(
        {
          defaults: {
            review: 'gpt-5.4',
          },
        },
        'review',
      ),
    ).toBe('gpt-5.4')
    expect(getRouteDefaultModelLabel('review')).toBe(
      'Review route default model',
    )
  })
})
