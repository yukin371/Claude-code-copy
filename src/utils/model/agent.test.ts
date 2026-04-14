import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  getAllowedSettingSources,
  setAllowedSettingSources,
  setFlagSettingsInline,
} from '../../bootstrap/state.js'
import { resetSettingsCache } from '../settings/settingsCache.js'
import {
  getAgentModelDisplay,
  getAgentModelOptions,
  SUBAGENT_ROUTE_DEFAULT_OPTION_VALUE,
} from './agent.js'

describe('agent model defaults', () => {
  let allowedSourcesSnapshot: ReturnType<typeof getAllowedSettingSources>
  let anthropicApiKeySnapshot: string | undefined
  let legacySubagentModelSnapshot: string | undefined
  let routeSubagentModelSnapshot: string | undefined

  beforeEach(() => {
    allowedSourcesSnapshot = getAllowedSettingSources()
    anthropicApiKeySnapshot = process.env.ANTHROPIC_API_KEY
    legacySubagentModelSnapshot = process.env.CLAUDE_CODE_SUBAGENT_MODEL
    routeSubagentModelSnapshot = process.env.NEKO_CODE_SUBAGENT_MODEL
    setAllowedSettingSources([])
    setFlagSettingsInline(null)
    process.env.ANTHROPIC_API_KEY = 'test-key'
    delete process.env.CLAUDE_CODE_SUBAGENT_MODEL
    delete process.env.NEKO_CODE_SUBAGENT_MODEL
    resetSettingsCache()
  })

  afterEach(() => {
    setAllowedSettingSources(allowedSourcesSnapshot)
    setFlagSettingsInline(null)
    if (anthropicApiKeySnapshot === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = anthropicApiKeySnapshot
    }
    if (legacySubagentModelSnapshot === undefined) {
      delete process.env.CLAUDE_CODE_SUBAGENT_MODEL
    } else {
      process.env.CLAUDE_CODE_SUBAGENT_MODEL = legacySubagentModelSnapshot
    }
    if (routeSubagentModelSnapshot === undefined) {
      delete process.env.NEKO_CODE_SUBAGENT_MODEL
    } else {
      process.env.NEKO_CODE_SUBAGENT_MODEL = routeSubagentModelSnapshot
    }
    resetSettingsCache()
  })

  test('omitted agent model displays subagent route fallback when no route model is configured', () => {
    expect(getAgentModelDisplay(undefined)).toBe(
      'Subagent route default (default; inherits from parent)',
    )

    expect(getAgentModelOptions()[0]).toEqual({
      value: SUBAGENT_ROUTE_DEFAULT_OPTION_VALUE,
      label: 'Use subagent route default',
      description:
        'No subagent route model is configured; falls back to inherit from parent',
    })
  })

  test('omitted agent model display reflects defaults.subagent when configured', () => {
    setFlagSettingsInline({
      defaults: {
        subagent: 'gpt-5.4',
      },
    })
    resetSettingsCache()

    expect(getAgentModelDisplay(undefined)).toBe(
      'Subagent route default (default; gpt-5.4 via defaults.subagent)',
    )

    expect(getAgentModelOptions()[0]).toEqual({
      value: SUBAGENT_ROUTE_DEFAULT_OPTION_VALUE,
      label: 'Use subagent route default',
      description: 'Currently gpt-5.4 from defaults.subagent',
    })
  })

  test('omitted agent model display reflects legacy taskRoutes.subagent.model', () => {
    setFlagSettingsInline({
      taskRoutes: {
        subagent: {
          model: 'legacy-subagent-model',
        },
      },
    })
    resetSettingsCache()

    expect(getAgentModelDisplay(undefined)).toBe(
      'Subagent route default (default; legacy-subagent-model via taskRoutes.subagent.model)',
    )
  })

  test('route env source wins over settings for omitted agent model display', () => {
    process.env.NEKO_CODE_SUBAGENT_MODEL = 'route-env-model'
    setFlagSettingsInline({
      defaults: {
        subagent: 'gpt-5.4',
      },
    })
    resetSettingsCache()

    expect(getAgentModelDisplay(undefined)).toBe(
      'Subagent route default (default; route-env-model via NEKO_CODE_SUBAGENT_MODEL)',
    )
  })

  test('legacy Claude env is still surfaced when route defaults are absent', () => {
    process.env.CLAUDE_CODE_SUBAGENT_MODEL = 'legacy-env-model'
    resetSettingsCache()

    expect(getAgentModelDisplay(undefined)).toBe(
      'Subagent route default (default; legacy-env-model via CLAUDE_CODE_SUBAGENT_MODEL)',
    )
  })
})
