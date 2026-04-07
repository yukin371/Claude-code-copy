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
  'NEKO_CODE_GLM_API_KEY',
  'NEKO_CODE_OPENAI_COMPATIBLE_BASE_URL',
  'NEKO_CODE_OPENAI_COMPATIBLE_API_KEY',
  'NEKO_CODE_OPENAI_PROVIDER_STRATEGY',
  'NEKO_CODE_OPENAI_PROVIDER_WEIGHTS',
  'NEKO_CODE_MAIN_PROVIDER',
  'NEKO_CODE_MAIN_API_STYLE',
  'NEKO_CODE_MAIN_BASE_URL',
  'NEKO_CODE_REVIEW_PROVIDER',
  'NEKO_CODE_REVIEW_API_STYLE',
  'NEKO_CODE_REVIEW_BASE_URL',
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

class MockAnthropicError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AnthropicError'
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

function createSseResponse(frames: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const frame of frames) {
          controller.enqueue(encoder.encode(frame))
        }
        controller.close()
      },
    }),
    {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'request-id': 'req_test_stream',
      },
    },
  )
}

  describe('openaiCompatibleClient', () => {
  let envSnapshot: EnvSnapshot

  beforeEach(() => {
    mock.module('@anthropic-ai/sdk/error', () => ({
      AnthropicError: MockAnthropicError,
      APIConnectionTimeoutError: MockAPIConnectionTimeoutError,
      APIError: MockAPIError,
      APIUserAbortError: MockAPIUserAbortError,
    }))
    mock.module('src/bootstrap/sessionId.js', () => ({
      getSessionId: () => 'session-test',
      setSessionId: () => {},
    }))
    mock.module('src/utils/debug.js', () => ({
      isDebugToStdErr: () => false,
      logAntError: () => {},
      logForDebugging: () => {},
    }))
    mock.module('src/utils/httpUserAgent.js', () => ({
      getHttpUserAgent: () => 'claude-cli/test',
    }))
    mock.module('src/utils/slowOperations.js', () => ({
      clone: <T>(value: T) => structuredClone(value),
      cloneDeep: <T>(value: T) => structuredClone(value),
      jsonParse: JSON.parse,
      jsonStringify: JSON.stringify,
      slowLogging: () => {},
      writeFileSync_DEPRECATED: () => {},
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

  test('rejects explicit transport pools before sending a request', async () => {
    const { createOpenAICompatibleAnthropicClient } = await import(
      './openaiCompatibleClient.js'
    )
    const calls: FetchCall[] = []
    const client = await createOpenAICompatibleAnthropicClient({
      transport: {
        provider: 'gemini',
        apiStyle: 'openai-compatible',
        baseUrl: 'https://a.example.com/v1,https://b.example.com/v1',
        apiKey: 'key-1,key-2',
      },
      maxRetries: 0,
      fetchOverride: (async (input, init) => {
        const url = input instanceof Request ? input.url : String(input)
        const headers = new Headers(init?.headers)
        calls.push({
          url,
          authorization: headers.get('authorization'),
          googleClient: headers.get('x-goog-api-client'),
        })

        return createJsonResponse({
          id: 'unexpected_request',
          model: 'gemini-2.5-pro',
          choices: [],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
          },
        })
      }) as typeof fetch,
    })

    await expect(
      client.beta.messages.create({
        model: 'gemini-2.5-pro',
        max_tokens: 128,
        messages: [{ role: 'user', content: 'ping' }],
        stream: false,
      } as any),
    ).rejects.toThrow(
      'Explicit task-route baseUrl pools are not supported.',
    )

    expect(calls).toHaveLength(0)
  })

  test('explicit baseUrl and apiKey prevent cross-provider fallback', async () => {
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
        baseUrl: 'https://a.example.com/v1',
        apiKey: 'explicit-gemini-key',
      },
      maxRetries: 0,
      fetchOverride: (async (input, init) => {
        const url = input instanceof Request ? input.url : String(input)
        const headers = new Headers(init?.headers)
        calls.push({
          url,
          authorization: headers.get('authorization'),
          googleClient: headers.get('x-goog-api-client'),
        })

        return createJsonResponse(
          { error: { message: 'explicit provider failed' } },
          500,
        )
      }) as typeof fetch,
    })

    await expect(
      client.beta.messages.create({
        model: 'gemini-2.5-pro',
        max_tokens: 16,
        messages: [{ role: 'user', content: 'ping' }],
        stream: false,
      } as any),
    ).rejects.toThrow(MockAPIError)

    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      url: 'https://a.example.com/v1/chat/completions',
      authorization: 'Bearer explicit-gemini-key',
      googleClient: 'neko-code',
    })
  })

  test('streaming create exposes withResponse compatibility for openai-compatible clients', async () => {
    const { createOpenAICompatibleAnthropicClient } = await import(
      './openaiCompatibleClient.js'
    )

    const client = await createOpenAICompatibleAnthropicClient({
      transport: {
        provider: 'gemini',
        apiStyle: 'openai-compatible',
      },
      maxRetries: 0,
      fetchOverride: ((async () =>
        createSseResponse([
          'data: {"id":"chatcmpl-test","model":"gemini-2.5-pro","choices":[{"index":0,"delta":{"role":"assistant","content":"OK"}}]}\n\n',
          'data: {"id":"chatcmpl-test","model":"gemini-2.5-pro","choices":[{"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":1}}\n\n',
          'data: [DONE]\n\n',
        ])) as unknown) as typeof fetch,
    })

    const result = await client.beta.messages
      .create({
        model: 'gemini-2.5-pro',
        max_tokens: 32,
        messages: [{ role: 'user', content: 'ping stream route' }],
        stream: true,
      } as any)
      .withResponse()

    expect(result.request_id).toBe('req_test_stream')
    expect(result.response.headers.get('content-type')).toContain(
      'text/event-stream',
    )

    const events: Array<Record<string, unknown>> = []
    for await (const event of result.data as unknown as AsyncIterable<
      Record<string, unknown>
    >) {
      events.push(event)
    }

    expect(events.some(event => event.type === 'message_start')).toBe(true)
    expect(events.some(event => event.type === 'message_stop')).toBe(true)
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
      fetchOverride: (async (input, init) => {
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
      }) as typeof fetch,
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
    ] as unknown as typeof message.content)
  })

  test('direct-provider mode ignores shared transport apiKey and keeps provider-specific fallback', async () => {
    const { createOpenAICompatibleAnthropicClient } = await import(
      './openaiCompatibleClient.js'
    )
    process.env.NEKO_CODE_GEMINI_API_KEY = 'gemini-key'
    process.env.NEKO_CODE_CODEX_API_KEY = 'codex-key'

    const calls: FetchCall[] = []
    const client = await createOpenAICompatibleAnthropicClient({
      transport: {
        provider: 'gemini',
        apiStyle: 'openai-compatible',
        apiKey: 'shared-openai-key',
        apiKeySource: 'global-env',
        transportMode: 'direct-provider',
      },
      maxRetries: 0,
      fetchOverride: (async (input, init) => {
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
          id: 'msg_direct_provider_fallback',
          model: 'gpt-4.1',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'served by provider-specific fallback',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 3,
          },
        })
      }) as typeof fetch,
    })

    const message = await client.beta.messages.create({
      model: 'gpt-4.1',
      max_tokens: 64,
      messages: [{ role: 'user', content: 'ping' }],
      stream: false,
    } as any)

    expect(calls.map(call => call.url)).toEqual([
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      'https://api.openai.com/v1/chat/completions',
    ])
    expect(calls.map(call => call.authorization)).toEqual([
      'Bearer gemini-key',
      'Bearer codex-key',
    ])
    expect(calls.map(call => call.googleClient)).toEqual([
      'neko-code',
      null,
    ])
    expect(message.content).toEqual([
      {
        type: 'text',
        text: 'served by provider-specific fallback',
      },
    ] as unknown as typeof message.content)
  })

  test('preferred provider recovers after failure and future requests prefer it', async () => {
    const { createOpenAICompatibleAnthropicClient } = await import(
      './openaiCompatibleClient.js'
    )
    process.env.NEKO_CODE_GEMINI_API_KEY = 'gemini-key'
    process.env.OPENAI_API_KEY = 'codex-key'

    const responseSequence = [
      {
        status: 500,
        body: { error: { message: 'primary down' } },
      },
      {
        status: 200,
        payload: {
          id: 'msg_fallback',
          model: 'gpt-4.1',
          text: 'served by fallback provider',
        },
      },
      {
        status: 200,
        payload: {
          id: 'msg_recovery',
          model: 'gemini-2.5-pro',
          text: 'primary recovered',
        },
      },
    ] as const

    const calls: FetchCall[] = []
    const client = await createOpenAICompatibleAnthropicClient({
      transport: {
        provider: 'gemini',
        apiStyle: 'openai-compatible',
      },
      maxRetries: 0,
      fetchOverride: (async (input, init) => {
        const url = input instanceof Request ? input.url : String(input)
        const headers = new Headers(init?.headers)
        const invocationIndex = calls.length
        calls.push({
          url,
          authorization: headers.get('authorization'),
          googleClient: headers.get('x-goog-api-client'),
        })
        const config = responseSequence[invocationIndex]
        if (!config) {
          throw new Error('unexpected fetch invocation')
        }

        if (config.status !== 200) {
          return createJsonResponse(config.body, config.status)
        }

        return createJsonResponse({
          id: config.payload.id,
          model: config.payload.model,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: config.payload.text,
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 1,
            completion_tokens: 1,
          },
        })
      }) as typeof fetch,
    })

    const realDateNow = Date.now
    let fakeNow = realDateNow()
    Date.now = () => fakeNow

    try {
      const fallbackMessage = await client.beta.messages.create({
        model: 'gpt-4.1',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'ping' }],
        stream: false,
      } as any)
      expect(fallbackMessage.content).toEqual([
        {
          type: 'text',
          text: 'served by fallback provider',
        },
      ] as unknown as typeof fallbackMessage.content)

      fakeNow += 120_000

      const recoveryMessage = await client.beta.messages.create({
        model: 'gemini-2.5-pro',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'ping again' }],
        stream: false,
      } as any)
      expect(recoveryMessage.content).toEqual([
        {
          type: 'text',
          text: 'primary recovered',
        },
      ] as unknown as typeof recoveryMessage.content)
    } finally {
      Date.now = realDateNow
    }

    expect(calls.map(call => call.url)).toEqual([
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      'https://api.openai.com/v1/chat/completions',
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    ])
    expect(calls.map(call => call.authorization)).toEqual([
      'Bearer gemini-key',
      'Bearer codex-key',
      'Bearer gemini-key',
    ])
    expect(calls.map(call => call.googleClient)).toEqual([
      'neko-code',
      null,
      'neko-code',
    ])
  })

  test('round-robin strategy rotates the first provider across successful requests', async () => {
    const { createOpenAICompatibleAnthropicClient } = await import(
      './openaiCompatibleClient.js'
    )
    process.env.NEKO_CODE_OPENAI_PROVIDER_STRATEGY = 'round-robin'
    process.env.NEKO_CODE_GEMINI_API_KEY = 'gemini-key'
    process.env.NEKO_CODE_CODEX_API_KEY = 'codex-key'

    const calls: FetchCall[] = []
    const client = await createOpenAICompatibleAnthropicClient({
      transport: {
        provider: 'gemini',
        apiStyle: 'openai-compatible',
      },
      maxRetries: 0,
      fetchOverride: (async (input, init) => {
        const url = input instanceof Request ? input.url : String(input)
        const headers = new Headers(init?.headers)
        calls.push({
          url,
          authorization: headers.get('authorization'),
          googleClient: headers.get('x-goog-api-client'),
        })

        return createJsonResponse({
          id: `msg_round_robin_${calls.length}`,
          model: 'gemini-2.5-pro',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'ok',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 3,
            completion_tokens: 2,
          },
        })
      }) as typeof fetch,
    })

    await client.beta.messages.create({
      model: 'gemini-2.5-pro',
      max_tokens: 64,
      messages: [{ role: 'user', content: 'ping-1' }],
      stream: false,
    } as any)
    await client.beta.messages.create({
      model: 'gemini-2.5-pro',
      max_tokens: 64,
      messages: [{ role: 'user', content: 'ping-2' }],
      stream: false,
    } as any)

    expect(calls).toHaveLength(2)
    expect(calls[0]).toEqual({
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      authorization: 'Bearer gemini-key',
      googleClient: 'neko-code',
    })
    expect(calls[1]).toEqual({
      url: 'https://api.openai.com/v1/chat/completions',
      authorization: 'Bearer codex-key',
      googleClient: null,
    })
  })

  test('weighted strategy honors provider weights across successful requests', async () => {
    const { createOpenAICompatibleAnthropicClient } = await import(
      './openaiCompatibleClient.js'
    )
    process.env.NEKO_CODE_OPENAI_PROVIDER_STRATEGY = 'weighted'
    process.env.NEKO_CODE_OPENAI_PROVIDER_WEIGHTS = 'gemini=2,codex=1'
    process.env.NEKO_CODE_GEMINI_API_KEY = 'gemini-key'
    process.env.NEKO_CODE_CODEX_API_KEY = 'codex-key'

    const calls: FetchCall[] = []
    const client = await createOpenAICompatibleAnthropicClient({
      transport: {
        provider: 'gemini',
        apiStyle: 'openai-compatible',
      },
      maxRetries: 0,
      fetchOverride: (async (input, init) => {
        const url = input instanceof Request ? input.url : String(input)
        const headers = new Headers(init?.headers)
        calls.push({
          url,
          authorization: headers.get('authorization'),
          googleClient: headers.get('x-goog-api-client'),
        })

        return createJsonResponse({
          id: `msg_weighted_${calls.length}`,
          model: 'gemini-2.5-pro',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'ok',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 3,
            completion_tokens: 2,
          },
        })
      }) as typeof fetch,
    })

    for (const content of ['ping-1', 'ping-2', 'ping-3']) {
      await client.beta.messages.create({
        model: 'gemini-2.5-pro',
        max_tokens: 64,
        messages: [{ role: 'user', content }],
        stream: false,
      } as any)
    }

    expect(calls).toHaveLength(3)
    expect(calls.map(call => call.url)).toEqual([
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      'https://api.openai.com/v1/chat/completions',
    ])
    expect(calls.map(call => call.authorization)).toEqual([
      'Bearer gemini-key',
      'Bearer gemini-key',
      'Bearer codex-key',
    ])
  })

  test('getAnthropicClientForTaskRoute uses the configured main route gateway', async () => {
    const { getAnthropicClientForTaskRoute } = await import('./client.js')
    process.env.NEKO_CODE_MAIN_PROVIDER = 'gemini'
    process.env.NEKO_CODE_MAIN_API_STYLE = 'openai-compatible'
    process.env.NEKO_CODE_MAIN_BASE_URL = 'https://main-gateway.example.com/v1'
    process.env.NEKO_CODE_OPENAI_COMPATIBLE_API_KEY = 'shared-gateway-key'

    const calls: FetchCall[] = []
    const client = await getAnthropicClientForTaskRoute({
      route: 'main',
      maxRetries: 0,
      model: 'gemini-2.5-pro',
      source: 'route_helper_test',
      fetchOverride: (async (input, init) => {
        const url = input instanceof Request ? input.url : String(input)
        const headers = new Headers(init?.headers)
        calls.push({
          url,
          authorization: headers.get('authorization'),
          googleClient: headers.get('x-goog-api-client'),
        })

        return createJsonResponse({
          id: 'msg_main_route',
          model: 'gemini-2.5-pro',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'ok',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 2,
            completion_tokens: 1,
          },
        })
      }) as typeof fetch,
    })

    await client.beta.messages.create({
      model: 'gemini-2.5-pro',
      max_tokens: 32,
      messages: [{ role: 'user', content: 'ping main route' }],
      stream: false,
    } as any)

    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      url: 'https://main-gateway.example.com/v1/chat/completions',
      authorization: 'Bearer shared-gateway-key',
      googleClient: 'neko-code',
    })
  })

  test('getAnthropicClientForTaskRoute keeps direct-provider routing on main route', async () => {
    const { getAnthropicClientForTaskRoute } = await import('./client.js')
    process.env.NEKO_CODE_MAIN_PROVIDER = 'gemini'
    process.env.NEKO_CODE_MAIN_API_STYLE = 'openai-compatible'
    process.env.NEKO_CODE_GEMINI_API_KEY = 'gemini-direct-key'
    process.env.NEKO_CODE_OPENAI_COMPATIBLE_API_KEY = 'shared-openai-key'

    const calls: FetchCall[] = []
    const client = await getAnthropicClientForTaskRoute({
      route: 'main',
      maxRetries: 0,
      model: 'gemini-2.5-pro',
      source: 'route_helper_test',
      fetchOverride: (async (input, init) => {
        const url = input instanceof Request ? input.url : String(input)
        const headers = new Headers(init?.headers)
        calls.push({
          url,
          authorization: headers.get('authorization'),
          googleClient: headers.get('x-goog-api-client'),
        })

        return createJsonResponse({
          id: 'msg_main_direct',
          model: 'gemini-2.5-pro',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'ok',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 2,
            completion_tokens: 1,
          },
        })
      }) as typeof fetch,
    })

    await client.beta.messages.create({
      model: 'gemini-2.5-pro',
      max_tokens: 32,
      messages: [{ role: 'user', content: 'ping main direct route' }],
      stream: false,
    } as any)

    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      authorization: 'Bearer gemini-direct-key',
      googleClient: 'neko-code',
    })
  })

  test('getTaskRouteAnthropicClient resolves review route from querySource hints', async () => {
    const { getTaskRouteAnthropicClient } = await import('./client.js')
    process.env.NEKO_CODE_REVIEW_PROVIDER = 'gemini'
    process.env.NEKO_CODE_REVIEW_API_STYLE = 'openai-compatible'
    process.env.NEKO_CODE_REVIEW_BASE_URL = 'https://review-gateway.example.com/v1'
    process.env.NEKO_CODE_OPENAI_COMPATIBLE_API_KEY = 'review-gateway-key'

    const calls: FetchCall[] = []
    const client = await getTaskRouteAnthropicClient({
      maxRetries: 0,
      model: 'gemini-2.5-pro',
      source: 'route_helper_test',
      querySource: 'agent:builtin:general-purpose:route:review',
      fetchOverride: (async (input, init) => {
        const url = input instanceof Request ? input.url : String(input)
        const headers = new Headers(init?.headers)
        calls.push({
          url,
          authorization: headers.get('authorization'),
          googleClient: headers.get('x-goog-api-client'),
        })

        return createJsonResponse({
          id: 'msg_review_route',
          model: 'gemini-2.5-pro',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'reviewed',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 2,
            completion_tokens: 1,
          },
        })
      }) as typeof fetch,
    })

    await client.beta.messages.create({
      model: 'gemini-2.5-pro',
      max_tokens: 32,
      messages: [{ role: 'user', content: 'ping review route' }],
      stream: false,
    } as any)

    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      url: 'https://review-gateway.example.com/v1/chat/completions',
      authorization: 'Bearer review-gateway-key',
      googleClient: 'neko-code',
    })
  })
})
