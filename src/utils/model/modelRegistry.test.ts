import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  getAllowedSettingSources,
  setAllowedSettingSources,
  setFlagSettingsInline,
} from '../../bootstrap/state.js'
import { resetSettingsCache } from '../settings/settingsCache.js'
import {
  getConfiguredModelNames,
  getConfiguredModelRegistry,
  resolveConfiguredModelSourceId,
} from './modelRegistry.js'

describe('modelRegistry', () => {
  let allowedSourcesSnapshot: ReturnType<typeof getAllowedSettingSources>

  beforeEach(() => {
    allowedSourcesSnapshot = getAllowedSettingSources()
    setAllowedSettingSources([])
    setFlagSettingsInline(null)
    resetSettingsCache()
  })

  afterEach(() => {
    setAllowedSettingSources(allowedSourcesSnapshot)
    setFlagSettingsInline(null)
    resetSettingsCache()
  })

  test('collects multi-source models from simplified providers/models config', () => {
    setFlagSettingsInline({
      providers: {
        minimaxProxy: {
          type: 'openai-compatible',
          baseUrl: 'https://proxy.example.com/v1',
          keyEnv: 'MINIMAX_API_KEY',
        },
        glmDirect: {
          type: 'glm',
          baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
          keyEnv: 'GLM_API_KEY',
        },
      },
      models: {
        'glm-4.5': {
          sources: [
            { provider: 'minimaxProxy', priority: 10 },
            { provider: 'glmDirect', priority: 20 },
          ],
          defaultSource: 'minimaxProxy',
        },
      },
    })
    resetSettingsCache()

    const registry = getConfiguredModelRegistry()
    const entry = registry.get('glm-4.5')

    expect(getConfiguredModelNames()).toEqual(['glm-4.5'])
    expect(entry?.sources.map(source => source.sourceId)).toEqual([
      'minimaxProxy',
      'glmDirect',
    ])
    expect(entry?.sources.map(source => source.provider)).toEqual([
      'openai-compatible',
      'glm',
    ])
    expect(entry?.sources.map(source => source.defaultSource)).toEqual([
      true,
      false,
    ])
    expect(
      resolveConfiguredModelSourceId({
        model: 'glm-4.5',
        provider: 'openai-compatible',
        baseUrl: 'https://proxy.example.com/v1',
      }),
    ).toBe('minimaxProxy')
  })

  test('falls back to legacy providerKeys and taskRoutes when no simplified registry is present', () => {
    setFlagSettingsInline({
      providerKeys: [
        {
          id: 'gpt-k1',
          provider: 'openai-compatible',
          models: ['gpt-5.4'],
          baseUrl: 'https://api.asxs.top/v1',
        },
      ],
      taskRoutes: {
        review: {
          provider: 'codex',
          apiStyle: 'openai-compatible',
          model: 'gpt-5.2',
        },
      },
    })
    resetSettingsCache()

    const names = getConfiguredModelNames()
    expect(names).toEqual(['gpt-5.2', 'gpt-5.4'])
  })
})
