import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import { resetProviderBalancerForTests } from 'src/utils/model/providerBalancer.js'

type EnvSnapshot = Record<string, string | undefined>

type FetchCall = {
  url: string
  authorization: string | null
  googleClient: string | null
}

const ENV_KEYS = [
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'NEKO_CODE_GEMINI_API_KEY',
  'NEKO_CODE_CODEX_API_KEY',
] as const

const TEST_MACRO = {
  VERSION: 'test',
}

class MockAPIError extends Error {
  status: number
  error: unknown
  headers: Headers

  constructor(status: number, error: unknown, message: string, headers: Headers) {
    super(message)
    this.name = 'APIError'
    this.status = status
    this.error = error
    this.headers = headers
  }
}

class MockAPIConnectionTimeoutError extends Error {
  constructor({ message }: { message: string }) {
    super(message)
    this.name = 'APIConnectionTimeoutError'
  }
}

class MockAPIUserAbortError extends Error {
  constructor() {
    super('Request aborted')
    this.name = 'APIUserAbortError'
  }
}

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

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  })
}

  describe('openaiCompatibleClient', () => {
  let envSnapshot: EnvSnapshot

  beforeEach(() => {
    mock.module('@anthropic-ai/sdk/error', () => ({
      APIConnectionTimeoutError: MockAPIConnectionTimeoutError,
      APIError: MockAPIError,
      APIUserAbortError: MockAPIUserAbortError,
    }))
    mock.module('src/bootstrap/sessionId.js', () => ({
      getSessionId: () => 'session-test',
    }))
    mock.module('src/utils/debug.js', () => ({
      logForDebugging: () => {},
    }))
    mock.module('src/utils/httpUserAgent.js', () => ({
      getHttpUserAgent: () => 'claude-cli/test',
    }))
    mock.module('src/utils/slowOperations.js', () => ({
      jsonStringify: JSON.stringify,
    }))
    mock.module('src/utils/model/modelNormalization.js', () => ({
      normalizeModelStringForAPI: (model: string) => model,
    }))
    resetProviderBalancerForTests()
    envSnapshot = snapshotEnv(ENV_KEYS)
    process.env.USER_TYPE = 'test'
    process.env.CLAUDE_CODE_ENTRYPOINT = 'bun-test'
    ;(globalThis as typeof globalThis & { MACRO?: typeof TEST_MACRO }).MACRO =
      TEST_MACRO
  })

  afterEach(() => {
    resetProviderBalancerForTests()
    restoreEnv(envSnapshot)
  })

  test('fails over to the next endpoint within the same provider', async () => {
    const { createOpenAICompatibleAnthropicClient } = await import(
      './openaiCompatibleClient.js'
    )
    const calls: FetchCall[] = []
    const client = await createOpenAICompatibleAnthropicClient({
      transport: {
        provider: 'gemini',
        apiStyle: 'openai-compatible',
        baseUrl: 'https://a.example.com/v1,https://b.example.com/v1',
        apiKey: 'key-1',
      },
      maxRetries: 0,
      fetchOverride: async (input, init) => {
        const url = input instanceof Request ? input.url : String(input)
        const headers = new Headers(init?.headers)
        calls.push({
          url,
          authorization: headers.get('authorization'),
          googleClient: headers.get('x-goog-api-client'),
        })

        if (calls.length === 1) {
          return createJsonResponse(
            { error: { message: 'upstream overloaded' } },
            500,
          )
        }

        return createJsonResponse({
          id: 'msg_same_provider',
          model: 'gemini-2.5-pro',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'recovered on second endpoint',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 11,
            completion_tokens: 7,
          },
        })
      },
    })

    const message = await client.beta.messages.create({
      model: 'gemini-2.5-pro',
      max_tokens: 128,
      messages: [{ role: 'user', content: 'ping' }],
      stream: false,
    } as any)

    expect(calls.map(call => call.url)).toEqual([
      'https://a.example.com/v1/chat/completions',
      'https://b.example.com/v1/chat/completions',
    ])
    expect(calls.every(call => call.authorization === 'Bearer key-1')).toBe(true)
    expect(calls.every(call => call.googleClient === 'neko-code')).toBe(true)
    expect(message.model).toBe('gemini-2.5-pro')
    expect(message.stop_reason).toBe('end_turn')
    expect(message.content).toEqual([
      {
        type: 'text',
        text: 'recovered on second endpoint',
      },
    ])
  })

  test('fails over across providers when the preferred provider is unavailable', async () => {
    const { createOpenAICompatibleAnthropicClient } = await import(
      './openaiCompatibleClient.js'
    )
    process.env.NEKO_CODE_GEMINI_API_KEY = 'gemini-key'
    process.env.OPENAI_API_KEY = 'codex-key'

    const calls: FetchCall[] = []
    const client = await createOpenAICompatibleAnthropicClient({
      transport: {
        provider: 'gemini',
        apiStyle: 'openai-compatible',
      },
      maxRetries: 0,
      fetchOverride: async (input, init) => {
        const url = input instanceof Request ? input.url : String(input)
        const headers = new Headers(init?.headers)
        calls.push({
          url,
          authorization: headers.get('authorization'),
          googleClient: headers.get('x-goog-api-client'),
        })

        if (calls.length === 1) {
          return createJsonResponse(
            { error: { message: 'provider temporarily unavailable' } },
            500,
          )
        }

        return createJsonResponse({
          id: 'msg_cross_provider',
          model: 'gpt-4.1',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'served by fallback provider',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 3,
          },
        })
      },
    })

    const message = await client.beta.messages.create({
      model: 'gpt-4.1',
      max_tokens: 64,
      messages: [{ role: 'user', content: 'ping' }],
      stream: false,
    } as any)

    expect(calls).toHaveLength(2)
    expect(calls[0]?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    )
    expect(calls[0]?.authorization).toBe('Bearer gemini-key')
    expect(calls[0]?.googleClient).toBe('neko-code')
    expect(calls[1]?.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(calls[1]?.authorization).toBe('Bearer codex-key')
    expect(calls[1]?.googleClient).toBeNull()
    expect(message.model).toBe('gpt-4.1')
    expect(message.content).toEqual([
      {
        type: 'text',
        text: 'served by fallback provider',
      },
    ])
  })
})
