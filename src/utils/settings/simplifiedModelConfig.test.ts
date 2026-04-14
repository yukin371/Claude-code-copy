import { describe, expect, test } from 'bun:test'
import { normalizeSimplifiedModelConfig } from './simplifiedModelConfig.js'

describe('normalizeSimplifiedModelConfig', () => {
  test('generates providerKeys, taskRoutes, and root model from simplified settings', () => {
    const normalized = normalizeSimplifiedModelConfig({
      providers: {
        asxs: {
          type: 'openai-compatible',
          baseUrl: 'https://api.asxs.top/v1',
          keyEnv: 'ASXS_API_KEY',
        },
        glmcn: {
          type: 'glm',
          keyEnv: 'GLM_API_KEY',
        },
      },
      models: {
        'gpt-5.2': 'asxs',
        'gpt-5.4': {
          provider: 'asxs',
        },
        'glm-4.5': 'glmcn',
      },
      defaults: {
        main: 'gpt-5.2',
        review: 'gpt-5.4',
        subagent: 'glm-4.5',
      },
    }) as Record<string, unknown>

    expect(normalized.model).toBe('gpt-5.2')
    expect(normalized.providerKeys).toEqual([
      {
        id: 'asxs-k1',
        provider: 'openai-compatible',
        baseUrl: 'https://api.asxs.top/v1',
        secretEnv: 'ASXS_API_KEY',
        secret: undefined,
        models: ['gpt-5.2', 'gpt-5.4'],
        priority: 1,
        expiresAt: undefined,
        limits: undefined,
        context: undefined,
      },
      {
        id: 'glmcn-k1',
        provider: 'glm',
        baseUrl: undefined,
        secretEnv: 'GLM_API_KEY',
        secret: undefined,
        models: ['glm-4.5'],
        priority: 1,
        expiresAt: undefined,
        limits: undefined,
        context: undefined,
      },
    ])
    expect(normalized.taskRoutes).toEqual({
      main: {
        provider: 'openai-compatible',
        apiStyle: 'openai-compatible',
        model: 'gpt-5.2',
        baseUrl: 'https://api.asxs.top/v1',
      },
      review: {
        provider: 'openai-compatible',
        apiStyle: 'openai-compatible',
        model: 'gpt-5.4',
        baseUrl: 'https://api.asxs.top/v1',
      },
      subagent: {
        provider: 'glm',
        apiStyle: 'openai-compatible',
        model: 'glm-4.5',
        baseUrl: undefined,
      },
    })
  })

  test('explicit low-level taskRoutes and providerKeys override generated values', () => {
    const normalized = normalizeSimplifiedModelConfig({
      providers: {
        asxs: {
          type: 'openai-compatible',
          baseUrl: 'https://api.asxs.top/v1',
          keyEnv: 'ASXS_API_KEY',
        },
      },
      models: {
        'gpt-5.2': 'asxs',
      },
      defaults: {
        main: 'gpt-5.2',
      },
      providerKeys: [
        {
          id: 'asxs-k1',
          provider: 'codex',
          secretEnv: 'OVERRIDE_KEY',
          models: ['gpt-5.2'],
        },
      ],
      taskRoutes: {
        main: {
          provider: 'codex',
          model: 'gpt-5.2',
        },
      },
      model: 'manual-model',
    }) as Record<string, unknown>

    expect(normalized.model).toBe('manual-model')
    expect(normalized.providerKeys).toEqual([
      {
        id: 'asxs-k1',
        provider: 'codex',
        secretEnv: 'OVERRIDE_KEY',
        models: ['gpt-5.2'],
      },
    ])
    expect(normalized.taskRoutes).toEqual({
      main: {
        provider: 'codex',
        apiStyle: 'openai-compatible',
        model: 'gpt-5.2',
        baseUrl: 'https://api.asxs.top/v1',
      },
    })
  })

  test('supports multi-key provider definitions with stable default priorities', () => {
    const normalized = normalizeSimplifiedModelConfig({
      providers: {
        asxs: {
          type: 'openai-compatible',
          baseUrl: 'https://api.asxs.top/v1',
          keys: [
            { env: 'ASXS_KEY_A' },
            { id: 'asxs-k9', env: 'ASXS_KEY_B', priority: 9 },
          ],
        },
      },
      models: {
        'gpt-5.2': 'asxs',
      },
    }) as Record<string, unknown>

    expect(normalized.providerKeys).toEqual([
      {
        id: 'asxs-k1',
        provider: 'openai-compatible',
        baseUrl: 'https://api.asxs.top/v1',
        secretEnv: 'ASXS_KEY_A',
        secret: undefined,
        models: ['gpt-5.2'],
        priority: 1,
        expiresAt: undefined,
        limits: undefined,
        context: undefined,
      },
      {
        id: 'asxs-k9',
        provider: 'openai-compatible',
        baseUrl: 'https://api.asxs.top/v1',
        secretEnv: 'ASXS_KEY_B',
        secret: undefined,
        models: ['gpt-5.2'],
        priority: 9,
        expiresAt: undefined,
        limits: undefined,
        context: undefined,
      },
    ])
  })

  test('compiles multi-source model definitions into model-specific provider keys and routes', () => {
    const normalized = normalizeSimplifiedModelConfig({
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
      defaults: {
        main: 'glm-4.5',
      },
    }) as Record<string, unknown>

    expect(normalized.model).toBe('glm-4.5')
    expect(normalized.providerKeys).toEqual([
      {
        id: 'minimaxProxy-k1-glm-4-5',
        provider: 'openai-compatible',
        baseUrl: 'https://proxy.example.com/v1',
        secretEnv: 'MINIMAX_API_KEY',
        secret: undefined,
        models: ['glm-4.5'],
        priority: 10001,
        expiresAt: undefined,
        limits: undefined,
        context: undefined,
      },
      {
        id: 'glmDirect-k1-glm-4-5',
        provider: 'glm',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        secretEnv: 'GLM_API_KEY',
        secret: undefined,
        models: ['glm-4.5'],
        priority: 20001,
        expiresAt: undefined,
        limits: undefined,
        context: undefined,
      },
    ])
    expect(normalized.taskRoutes).toEqual({
      main: {
        provider: 'openai-compatible',
        apiStyle: 'openai-compatible',
        model: 'glm-4.5',
        baseUrl: 'https://proxy.example.com/v1',
      },
    })
  })
})
