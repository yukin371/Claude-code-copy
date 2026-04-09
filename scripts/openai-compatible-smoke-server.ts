type MockChatCompletionRequest = {
  messages?: Array<{
    role?: string
    content?: string | Array<{ type?: string; text?: string }>
  }>
  model?: string
  stream?: boolean
}

type MockServerOptions = {
  defaultReply?: string
  replyForPrompt?: (prompt: string) => string
}

function extractPromptText(
  content: MockChatCompletionRequest['messages'][number]['content'],
): string {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .map(block => (typeof block?.text === 'string' ? block.text : ''))
    .join('\n')
}

function extractPrompt(body: MockChatCompletionRequest): string {
  return (body.messages ?? [])
    .filter(message => message.role === 'user')
    .map(message => extractPromptText(message.content))
    .join('\n')
}

function createMockOpenAIResponse(
  body: MockChatCompletionRequest,
  content: string,
): Response {
  const model = body.model ?? 'smoke-model'
  if (body.stream) {
    const encoder = new TextEncoder()
    const frames = [
      `data: ${JSON.stringify({
        id: 'chatcmpl-smoke',
        model,
        choices: [{ index: 0, delta: { role: 'assistant', content } }],
      })}\n\n`,
      `data: ${JSON.stringify({
        id: 'chatcmpl-smoke',
        model,
        choices: [{ index: 0, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 8,
          completion_tokens: 1,
          total_tokens: 9,
        },
      })}\n\n`,
      'data: [DONE]\n\n',
    ]

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
          'request-id': 'req_openai_compatible_smoke',
        },
      },
    )
  }

  return Response.json(
    {
      id: 'chatcmpl-smoke',
      model,
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content,
          },
        },
      ],
      usage: {
        prompt_tokens: 8,
        completion_tokens: 1,
        total_tokens: 9,
      },
    },
    {
      status: 200,
      headers: {
        'request-id': 'req_openai_compatible_smoke',
      },
    },
  )
}

export function startOpenAICompatibleSmokeServer(
  options: MockServerOptions = {},
): {
  baseUrl: string
  stop: () => void
} {
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
        const body = (await request.json()) as MockChatCompletionRequest
        const prompt = extractPrompt(body)
        const content = options.replyForPrompt?.(prompt) ?? options.defaultReply ?? 'OK'
        return createMockOpenAIResponse(body, content)
      }
      return new Response('not found', { status: 404 })
    },
  })

  return {
    baseUrl: `http://127.0.0.1:${server.port}/v1`,
    stop: () => server.stop(true),
  }
}

export function createOpenAICompatibleSmokeEnv(
  env: NodeJS.ProcessEnv,
  baseUrl: string,
): NodeJS.ProcessEnv {
  return {
    ...env,
    OPENAI_API_KEY: 'smoke-key',
    OPENAI_BASE_URL: baseUrl,
    NEKO_CODE_OPENAI_COMPATIBLE_API_KEY: 'smoke-key',
    NEKO_CODE_OPENAI_COMPATIBLE_BASE_URL: baseUrl,
    NEKO_CODE_MAIN_PROVIDER: 'openai-compatible',
    NEKO_CODE_MAIN_API_STYLE: 'openai-compatible',
    NEKO_CODE_MAIN_API_KEY: 'smoke-key',
    NEKO_CODE_MAIN_BASE_URL: baseUrl,
  }
}
