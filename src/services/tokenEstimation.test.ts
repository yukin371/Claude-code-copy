import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { getMainLoopModel } from '../utils/model/model.js'
import { resolveTokenEstimationTaskRoute } from './tokenEstimation.js'

type EnvSnapshot = Record<string, string | undefined>

const ENV_KEYS = [
  'NEKO_CODE_PLAN_MODEL',
  'NEKO_CODE_REVIEW_MODEL',
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

describe('resolveTokenEstimationTaskRoute', () => {
  let envSnapshot: EnvSnapshot

  beforeEach(() => {
    envSnapshot = snapshotEnv(ENV_KEYS)
  })

  afterEach(() => {
    restoreEnv(envSnapshot)
  })

  test('uses the anthropic task route when the querySource maps to an anthropic route', () => {
    process.env.NEKO_CODE_PLAN_MODEL = 'claude-sonnet-4-5'

    expect(resolveTokenEstimationTaskRoute('agent:builtin:plan')).toEqual({
      route: 'plan',
      model: 'claude-sonnet-4-5',
    })
  })

  test('falls back to the main route for openai-compatible task routes', () => {
    process.env.NEKO_CODE_REVIEW_MODEL = 'gpt-4.1'

    expect(
      resolveTokenEstimationTaskRoute(
        'agent:builtin:general-purpose:route:review',
      ),
    ).toEqual({
      route: 'main',
      model: getMainLoopModel(),
    })
  })
})
