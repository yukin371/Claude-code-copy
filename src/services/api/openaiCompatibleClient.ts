import type Anthropic from '@anthropic-ai/sdk'
import {
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from '@anthropic-ai/sdk/error'
import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageStreamParams,
  BetaToolUnion,
  BetaUsage,
  MessageParam,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { Stream } from '@anthropic-ai/sdk/streaming.mjs'
import { randomUUID } from 'crypto'
import { getSessionId } from 'src/bootstrap/sessionId.js'
import { createCombinedAbortSignal } from 'src/utils/combinedAbortSignal.js'
import { logForDebugging } from 'src/utils/debug.js'
import { getHttpUserAgent } from 'src/utils/httpUserAgent.js'
import { jsonStringify } from 'src/utils/slowOperations.js'
import { normalizeModelStringForAPI } from 'src/utils/model/modelNormalization.js'
import type { TaskRouteTransportConfig } from 'src/utils/model/taskRouting.js'
import {
  buildProviderEndpointCandidates,
  markProviderEndpointFailure,
  markProviderEndpointSuccess,
  selectProviderEndpointCandidates,
} from 'src/utils/model/providerBalancer.js'

type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | OpenAIChatContentPart[] | null
  tool_call_id?: string
  tool_calls?: OpenAIToolCall[]
}

type OpenAIChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

type OpenAIToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

type OpenAIUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
  completion_tokens_details?: { reasoning_tokens?: number }
}

type OpenAIChatCompletionChoice = {
  index: number
  message: {
    role: 'assistant'
    content?: string | OpenAIChatContentPart[] | null
    tool_calls?: OpenAIToolCall[]
    reasoning_content?: string | null
    reasoning_details?: unknown
    refusal?: string | null
  }
  finish_reason?: string | null
}

type OpenAIChatCompletion = {
  id: string
  object?: string
  created?: number
  model: string
  choices: OpenAIChatCompletionChoice[]
  usage?: OpenAIUsage
}

type OpenAIChatChunkChoice = {
  index: number
  delta: {
    role?: 'assistant'
    content?: string
    tool_calls?: Array<{
      index: number
      id?: string
      type?: 'function'
      function?: {
        name?: string
        arguments?: string
      }
    }>
    reasoning_content?: string
    reasoning_details?: unknown
    refusal?: string
  }
  finish_reason?: string | null
}

type OpenAIChatChunk = {
  id: string
  object?: string
  created?: number
  model: string
  choices: OpenAIChatChunkChoice[]
  usage?: OpenAIUsage
}

type OpenAICompatibleOptions = {
  transport: TaskRouteTransportConfig
  apiKey?: string
  maxRetries: number
  model?: string
  fetchOverride?: typeof fetch
  source?: string
}

type OpenAICompatibleStream = Stream<any> & {
  controller: AbortController
}

type OpenAIRequestResult = {
  response: Response
  requestId: string
  data: OpenAICompatibleStream
}

export async function createOpenAICompatibleAnthropicClient({
  transport,
  apiKey,
  maxRetries,
  model,
  fetchOverride,
  source,
}: OpenAICompatibleOptions): Promise<Anthropic> {
  const create = async (
    params: BetaMessageStreamParams,
    requestOptions?: { signal?: AbortSignal; timeout?: number },
  ) => {
    if (params.stream) {
      return {
        withResponse: async () => {
          const request = await executeOpenAICompatibleRequest({
            transport,
            apiKey,
            maxRetries,
            model: model ?? params.model,
            fetchOverride,
            source,
            params,
            requestOptions,
          })
          return {
            data: request.data,
            response: request.response,
            request_id: request.requestId,
          }
        },
      }
    }

    const request = await executeOpenAICompatibleRequest({
      transport,
      apiKey,
      maxRetries,
      model: model ?? params.model,
      fetchOverride,
      source,
      params,
      requestOptions,
      stream: false,
    })
    return request.data as unknown as BetaMessage
  }

  return {
    beta: {
      messages: {
        create,
      },
    },
  } as Anthropic
}

async function executeOpenAICompatibleRequest({
  transport,
  apiKey,
  maxRetries,
  model,
  fetchOverride,
  source,
  params,
  requestOptions,
  stream = true,
}: OpenAICompatibleOptions & {
  params: BetaMessageStreamParams
  requestOptions?: { signal?: AbortSignal; timeout?: number }
  stream?: boolean
}): Promise<OpenAIRequestResult | { data: BetaMessage }> {
  const fetchFn = fetchOverride ?? globalThis.fetch
  const transportForBalancing = apiKey
    ? { ...transport, apiKey }
    : transport
  const candidates = buildProviderEndpointCandidates(transportForBalancing)
  const orderedCandidates = selectProviderEndpointCandidates(
    transportForBalancing,
    candidates,
  )
  const resolvedModel = normalizeModelStringForAPI(
    model ?? transport.model ?? params.model,
  )
  const requestBody = buildOpenAIRequestBody(params, resolvedModel, stream)

  let lastError: unknown
  const attempts = Math.max(1, maxRetries + 1, orderedCandidates.length)
  if (orderedCandidates.length === 0) {
    throw new Error(`No OpenAI-compatible endpoints configured for ${transport.provider}`)
  }

  for (let attempt = 0; attempt < attempts; attempt++) {
    const candidate = orderedCandidates[attempt % orderedCandidates.length]
    const endpoint = `${candidate.baseUrl.replace(/\/+$/, '')}/chat/completions`
    const requestHeaders = buildHeaders(candidate.apiKey, candidate.provider)
    const controller = new AbortController()
    const { signal, clear } = attachAbortSignals(controller, requestOptions)

    try {
      logForDebugging(
        `[OpenAICompat] POST ${endpoint} model=${resolvedModel} source=${source ?? 'unknown'} attempt=${attempt + 1}/${attempts}`,
      )
      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers: requestHeaders,
        body: jsonStringify(requestBody),
        signal,
      })

      if (!response.ok) {
        const body = await readErrorBody(response)
        const message = extractOpenAIErrorMessage(body) || response.statusText
        const apiError = new APIError(
          response.status,
          body ?? { error: { type: 'api_error', message } },
          message || 'OpenAI-compatible request failed',
          response.headers,
        )

        if (shouldFailover(response.status, body) && attempt < attempts - 1) {
          lastError = apiError
          markProviderEndpointFailure(
            candidate,
            `http_${response.status}:${message || 'openai-compatible failure'}`,
          )
          clear()
          continue
        }

        markProviderEndpointFailure(
          candidate,
          `http_${response.status}:${message || 'openai-compatible failure'}`,
        )
        throw apiError
      }

      if (!stream) {
        const data = (await response.json()) as OpenAIChatCompletion
        const message = convertChatCompletionToBetaMessage(data, resolvedModel)
        markProviderEndpointSuccess(candidate)
        clear()
        return { data: message }
      }

      const requestId = getRequestId(response.headers) ?? randomUUID()
      const data = createOpenAICompatibleStream({
        response,
        requestId,
        controller,
        fetchSignal: signal,
        cleanup: clear,
        resolvedModel,
      })
      markProviderEndpointSuccess(candidate)
      return {
        response,
        requestId,
        data,
      }
    } catch (error) {
      clear()
      if (isAbortError(error)) {
        if (requestOptions?.signal?.aborted) {
          throw new APIUserAbortError()
        }
        throw new APIConnectionTimeoutError({ message: 'Request timed out' })
      }

      lastError = error
      markProviderEndpointFailure(
        candidate,
        error instanceof Error ? error.message : 'transport_error',
      )
      if (attempt < attempts - 1 && isRetryableOpenAITransportError(error)) {
        continue
      }
      break
    }
  }

  throw wrapOpenAITransportError(lastError)
}

function createOpenAICompatibleStream({
  response,
  requestId,
  controller,
  fetchSignal,
  cleanup,
  resolvedModel,
}: {
  response: Response
  requestId: string
  controller: AbortController
  fetchSignal: AbortSignal
  cleanup: () => void
  resolvedModel: string
}): OpenAICompatibleStream {
  const stream = {
    controller,
    async *[Symbol.asyncIterator]() {
      if (!response.body) {
        cleanup()
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const state = createStreamState(resolvedModel, requestId)

      try {
        while (true) {
          if (fetchSignal.aborted) {
            throw new APIUserAbortError()
          }

          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          buffer = buffer.replace(/\r\n/g, '\n')

          while (true) {
            const frame = parseNextSSEFrame(buffer)
            if (!frame) break
            buffer = frame.remaining
            if (!frame.data) continue
            if (frame.data === '[DONE]') {
              yield* finalizeOpenAIStreamState(state)
              return
            }

            let chunk: OpenAIChatChunk | undefined
            try {
              chunk = JSON.parse(frame.data) as OpenAIChatChunk
            } catch {
              continue
            }
            yield* emitOpenAIChunkEvents(chunk, state)
          }
        }

        yield* finalizeOpenAIStreamState(state)
      } finally {
        try {
          reader.releaseLock()
        } catch {
          // ignore
        }
        cleanup()
      }
    },
  } as OpenAICompatibleStream

  return stream
}

type StreamState = ReturnType<typeof createStreamState>

function createStreamState(model: string, requestId: string) {
  return {
    model,
    requestId,
    started: false,
    stopReason: null as string | null,
    usage: zeroUsage(),
    lastUsage: zeroUsage(),
    blocks: [] as Array<BetaContentBlockParam & { _openaiBlockIndex?: number }>,
    blockOrder: [] as number[],
    textBlockIndex: undefined as number | undefined,
    thinkingBlockIndex: undefined as number | undefined,
    toolCallBlockIndexes: new Map<number, number>(),
    toolCallIds: new Map<number, string>(),
    toolCallNames: new Map<number, string>(),
    toolCallInputs: new Map<number, string>(),
    hasContent: false,
  }
}

function* emitOpenAIChunkEvents(
  chunk: OpenAIChatChunk,
  state: StreamState,
): Generator<any> {
  const choice = chunk.choices[0]
  if (!choice) return

  if (!state.started) {
    state.started = true
    yield {
      type: 'message_start',
      message: {
        id: chunk.id,
        type: 'message',
        role: 'assistant',
        model: chunk.model,
        content: [],
        stop_reason: null,
        usage: state.usage,
      },
    }
  }

  const delta = choice.delta ?? {}

  if (delta.reasoning_content) {
    yield* ensureThinkingBlock(state)
    const index = state.thinkingBlockIndex!
    state.blocks[index] = {
      type: 'thinking',
      thinking:
        (state.blocks[index] as { thinking?: string } | undefined)?.thinking ??
        '',
      signature: '',
    } as BetaContentBlockParam
    yield {
      type: 'content_block_delta',
      index,
      delta: {
        type: 'thinking_delta',
        thinking: delta.reasoning_content,
      },
    }
  }

  if (delta.content) {
    yield* ensureTextBlock(state)
    const index = state.textBlockIndex!
    state.blocks[index] = {
      type: 'text',
      text: ((state.blocks[index] as { text?: string } | undefined)?.text ?? '') + delta.content,
    } as BetaContentBlockParam
    yield {
      type: 'content_block_delta',
      index,
      delta: {
        type: 'text_delta',
        text: delta.content,
      },
    }
  }

  if (delta.tool_calls) {
    for (const toolCall of delta.tool_calls) {
      const openAIIndex = toolCall.index
      if (!state.toolCallBlockIndexes.has(openAIIndex)) {
        const blockIndex = state.blocks.length
        state.toolCallBlockIndexes.set(openAIIndex, blockIndex)
        state.toolCallIds.set(openAIIndex, toolCall.id ?? randomUUID())
        state.toolCallNames.set(openAIIndex, toolCall.function?.name ?? '')
        state.toolCallInputs.set(openAIIndex, '')
        state.blocks.push({
          type: 'tool_use',
          id: state.toolCallIds.get(openAIIndex)!,
          name: state.toolCallNames.get(openAIIndex)!,
          input: '',
        } as BetaContentBlockParam)
        state.blockOrder.push(blockIndex)
        yield {
          type: 'content_block_start',
          index: blockIndex,
          content_block: {
            type: 'tool_use',
            id: state.toolCallIds.get(openAIIndex)!,
            name: state.toolCallNames.get(openAIIndex)!,
            input: '',
          },
        }
      }

      const blockIndex = state.toolCallBlockIndexes.get(openAIIndex)!
      if (toolCall.function?.name) {
        state.toolCallNames.set(openAIIndex, toolCall.function.name)
        const block = state.blocks[blockIndex] as { name?: string }
        block.name = toolCall.function.name
      }
      if (toolCall.function?.arguments) {
        const existing = state.toolCallInputs.get(openAIIndex) ?? ''
        state.toolCallInputs.set(
          openAIIndex,
          `${existing}${toolCall.function.arguments}`,
        )
        const block = state.blocks[blockIndex] as { input?: string }
        block.input = state.toolCallInputs.get(openAIIndex)!
        yield {
          type: 'content_block_delta',
          index: blockIndex,
          delta: {
            type: 'input_json_delta',
            partial_json: toolCall.function.arguments,
          },
        }
      }
    }
  }

  if (choice.finish_reason) {
    state.stopReason = mapFinishReason(choice.finish_reason)
    if (chunk.usage) {
      state.usage = mapUsage(chunk.usage)
    }
    yield* emitContentBlockStops(state)
    yield {
      type: 'message_delta',
      delta: {
        stop_reason: state.stopReason,
      },
      usage: mapUsage(chunk.usage),
    }
    yield { type: 'message_stop' }
  } else if (chunk.usage) {
    state.lastUsage = mapUsage(chunk.usage)
  }
}

function* finalizeOpenAIStreamState(state: StreamState): Generator<any> {
  if (!state.started) {
    return
  }
  if (!state.stopReason) {
    state.stopReason = state.toolCallBlockIndexes.size > 0 ? 'tool_use' : 'end_turn'
  }
  yield* emitContentBlockStops(state)
  yield {
    type: 'message_delta',
    delta: {
      stop_reason: state.stopReason,
    },
    usage: state.lastUsage,
  }
  yield { type: 'message_stop' }
}

function* emitContentBlockStops(state: StreamState): Generator<any> {
  const orderedIndexes = [
    ...(state.thinkingBlockIndex !== undefined ? [state.thinkingBlockIndex] : []),
    ...(state.textBlockIndex !== undefined ? [state.textBlockIndex] : []),
    ...state.blockOrder,
  ].filter((value, index, array) => array.indexOf(value) === index)

  for (const index of orderedIndexes) {
    const contentBlock = state.blocks[index]
    if (!contentBlock) continue
    yield {
      type: 'content_block_stop',
      index,
      content_block: contentBlock,
    }
  }
}

function* ensureTextBlock(state: StreamState): Generator<any> {
  if (state.textBlockIndex !== undefined) return
  const index = state.blocks.length
  state.textBlockIndex = index
  state.blocks.push({ type: 'text', text: '' } as BetaContentBlockParam)
  state.blockOrder.push(index)
  yield {
    type: 'content_block_start',
    index,
    content_block: { type: 'text', text: '' },
  }
}

function* ensureThinkingBlock(state: StreamState): Generator<any> {
  if (state.thinkingBlockIndex !== undefined) return
  const index = state.blocks.length
  state.thinkingBlockIndex = index
  state.blocks.push({
    type: 'thinking',
    thinking: '',
    signature: '',
  } as BetaContentBlockParam)
  state.blockOrder.push(index)
  yield {
    type: 'content_block_start',
    index,
    content_block: { type: 'thinking', thinking: '', signature: '' },
  }
}

function buildOpenAIRequestBody(
  params: BetaMessageStreamParams,
  model: string,
  stream: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: convertMessagesToOpenAI(params.messages),
    stream,
    max_tokens: params.max_tokens,
    ...(params.temperature !== undefined && { temperature: params.temperature }),
    ...(params.top_p !== undefined && { top_p: params.top_p }),
    ...(params.tool_choice && { tool_choice: convertToolChoice(params.tool_choice) }),
    ...(params.tools && params.tools.length > 0 && { tools: convertTools(params.tools) }),
    ...(params.metadata && { metadata: params.metadata }),
    ...(params.system && params.system.length > 0
      ? { system: params.system.map(block => block.text).join('\n\n') }
      : {}),
    ...(params.output_config && typeof params.output_config === 'object'
      ? convertOutputConfig(params.output_config)
      : {}),
    ...(params.thinking && { reasoning: params.thinking }),
    ...(params.speed && { reasoning_effort: params.speed }),
    ...(stream && { stream_options: { include_usage: true } }),
  }
  return body
}

function convertOutputConfig(outputConfig: Record<string, unknown>): Record<string, unknown> {
  const responseFormat = outputConfig.format
  if (responseFormat && typeof responseFormat === 'object') {
    return { response_format: responseFormat }
  }
  return {}
}

function convertToolChoice(choice: unknown): unknown {
  if (!choice || typeof choice !== 'object') {
    return choice
  }
  const maybe = choice as { type?: string; name?: string }
  if (maybe.name) {
    return { type: 'function', function: { name: maybe.name } }
  }
  return choice
}

function convertTools(tools: BetaToolUnion[]): Array<Record<string, unknown>> {
  return tools.map(tool => {
    const base = tool as unknown as {
      name: string
      description?: string
      input_schema?: Record<string, unknown>
      strict?: boolean
    }
    return {
      type: 'function',
      function: {
        name: base.name,
        description: base.description,
        parameters: base.input_schema,
        ...(base.strict !== undefined && { strict: base.strict }),
      },
    }
  })
}

function convertMessagesToOpenAI(messages: MessageParam[]): OpenAIChatMessage[] {
  const out: OpenAIChatMessage[] = []
  for (const message of messages) {
    if (message.role === 'system') {
      out.push({ role: 'system', content: convertAnthropicContentToString(message.content) })
      continue
    }

    if (message.role === 'assistant') {
      out.push(convertAssistantMessage(message))
      continue
    }

    out.push(...convertUserMessage(message))
  }
  return out
}

function convertUserMessage(message: MessageParam): OpenAIChatMessage[] {
  if (typeof message.content === 'string') {
    return [{ role: 'user', content: message.content }]
  }

  const result: OpenAIChatMessage[] = []
  let pendingUserParts: OpenAIChatContentPart[] = []
  const flushUser = () => {
    if (pendingUserParts.length === 0) return
    const content =
      pendingUserParts.length === 1 && pendingUserParts[0]?.type === 'text'
        ? pendingUserParts[0]!.text
        : pendingUserParts
    result.push({ role: 'user', content })
    pendingUserParts = []
  }

  for (const block of message.content) {
    if (block.type === 'tool_result') {
      flushUser()
      result.push({
        role: 'tool',
        tool_call_id: block.tool_use_id,
        content: toolResultContentToString(block.content),
      })
      continue
    }

    const part = convertContentBlockToOpenAI(block)
    if (!part) continue
    pendingUserParts.push(part)
  }

  flushUser()
  return result
}

function convertAssistantMessage(message: MessageParam): OpenAIChatMessage {
  if (typeof message.content === 'string') {
    return { role: 'assistant', content: message.content }
  }

  const toolCalls: OpenAIToolCall[] = []
  const textParts: string[] = []
  const reasoningParts: string[] = []

  for (const block of message.content) {
    if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments:
            typeof block.input === 'string' ? block.input : jsonStringify(block.input),
        },
      })
      continue
    }
    if (block.type === 'thinking' || block.type === 'redacted_thinking') {
      reasoningParts.push(block.type === 'thinking' ? block.thinking : '')
      continue
    }
    const part = convertContentBlockToOpenAI(block)
    if (part?.type === 'text') {
      textParts.push(part.text)
    }
  }

  const content = textParts.length > 0 ? textParts.join('\n') : null
  return {
    role: 'assistant',
    content,
    ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
    ...(reasoningParts.length > 0 && {
      reasoning_content: reasoningParts.join('\n'),
    }),
  }
}

function convertContentBlockToOpenAI(
  block: Exclude<BetaContentBlockParam, { type: 'tool_result' }>,
): OpenAIChatContentPart | null {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text }
    case 'image':
      return {
        type: 'image_url',
        image_url: { url: toDataUrl(block.source) },
      }
    case 'document':
      return {
        type: 'text',
        text: documentBlockToText(block),
      }
    case 'thinking':
    case 'redacted_thinking':
      return { type: 'text', text: block.type === 'thinking' ? block.thinking : '' }
    default:
      return null
  }
}

function documentBlockToText(block: Extract<BetaContentBlockParam, { type: 'document' }>): string {
  const maybeText = (block as unknown as { text?: string }).text
  if (maybeText) return maybeText
  return '[document]'
}

function toDataUrl(source: unknown): string {
  if (!source || typeof source !== 'object') return ''
  const typed = source as { type?: string; media_type?: string; data?: string; url?: string }
  if (typed.type === 'base64' && typed.media_type && typed.data) {
    return `data:${typed.media_type};base64,${typed.data}`
  }
  if (typed.url) return typed.url
  return ''
}

function toolResultContentToString(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(block => {
        if (!block || typeof block !== 'object') return ''
        const typed = block as { type?: string; text?: string; content?: unknown }
        if (typed.type === 'text' && typeof typed.text === 'string') return typed.text
        if (typeof typed.content === 'string') return typed.content
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (content && typeof content === 'object') {
    return jsonStringify(content)
  }
  return ''
}

function convertAnthropicContentToString(content: MessageParam['content']): string {
  if (typeof content === 'string') {
    return content
  }
  return content
    .map(block => {
      const converted = convertContentBlockToOpenAI(block as Exclude<
        BetaContentBlockParam,
        { type: 'tool_result' }
      >)
      return converted && converted.type === 'text' ? converted.text : ''
    })
    .filter(Boolean)
    .join('\n')
}

function convertChatCompletionToBetaMessage(
  completion: OpenAIChatCompletion,
  requestedModel: string,
): BetaMessage {
  const choice = completion.choices[0]
  const message = choice?.message
  const content = message ? convertOpenAIMessageToBetaContent(message) : []
  return {
    id: completion.id,
    type: 'message',
    role: 'assistant',
    model: completion.model || requestedModel,
    content,
    stop_reason: mapFinishReason(choice?.finish_reason ?? null),
    usage: mapUsage(completion.usage),
  } as BetaMessage
}

function convertOpenAIMessageToBetaContent(message: OpenAIChatCompletionChoice['message']): BetaContentBlockParam[] {
  const blocks: BetaContentBlockParam[] = []
  const text = convertOpenAIMessageContentToString(message.content)
  if (text) {
    blocks.push({ type: 'text', text } as BetaContentBlockParam)
  }
  if (message.reasoning_content) {
    blocks.push({
      type: 'thinking',
      thinking: message.reasoning_content,
      signature: '',
    } as BetaContentBlockParam)
  } else if (message.reasoning_details) {
    const details = stringifyReasoningDetails(message.reasoning_details)
    if (details) {
      blocks.push({
        type: 'thinking',
        thinking: details,
        signature: '',
      } as BetaContentBlockParam)
    }
  }
  for (const toolCall of message.tool_calls ?? []) {
    blocks.push({
      type: 'tool_use',
      id: toolCall.id,
      name: toolCall.function.name,
      input: toolCall.function.arguments,
    } as BetaContentBlockParam)
  }
  return blocks
}

function convertOpenAIMessageContentToString(
  content: string | OpenAIChatContentPart[] | null | undefined,
): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  return content
    .map(part => {
      if (part.type === 'text') return part.text
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function stringifyReasoningDetails(details: unknown): string {
  if (!details) return ''
  if (typeof details === 'string') return details
  if (Array.isArray(details)) {
    return details
      .map(item => {
        if (!item || typeof item !== 'object') return ''
        const maybe = item as { text?: string; content?: string }
        return maybe.text ?? maybe.content ?? ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return jsonStringify(details)
}

function mapFinishReason(reason: string | null): BetaMessage['stop_reason'] {
  switch (reason) {
    case 'tool_calls':
      return 'tool_use'
    case 'length':
      return 'max_tokens'
    case 'stop':
    case 'content_filter':
    case null:
    case undefined:
      return 'end_turn'
    default:
      return 'end_turn'
  }
}

function mapUsage(usage: OpenAIUsage | undefined): BetaUsage {
  return {
    input_tokens: usage?.prompt_tokens ?? 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
    output_tokens: usage?.completion_tokens ?? 0,
    server_tool_use: {
      web_search_requests: 0,
      web_fetch_requests: 0,
    },
    service_tier: undefined,
    cache_creation: {
      ephemeral_1h_input_tokens: 0,
      ephemeral_5m_input_tokens: 0,
    },
    inference_geo: undefined,
    iterations: 0,
    speed: undefined,
  }
}

function zeroUsage(): BetaUsage {
  return mapUsage(undefined)
}

function getRequestId(headers: Headers): string | undefined {
  return (
    headers.get('x-request-id') ||
    headers.get('x-openai-request-id') ||
    headers.get('request-id') ||
    headers.get('x-amzn-requestid') ||
    undefined
  )
}

function buildHeaders(apiKey: string | undefined, provider: string): Headers {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'User-Agent': getHttpUserAgent(),
    'X-Claude-Code-Session-Id': getSessionId(),
  })
  if (apiKey) {
    headers.set('Authorization', `Bearer ${apiKey}`)
  }
  if (provider === 'gemini') {
    headers.set('x-goog-api-client', 'neko-code')
  }
  return headers
}

function attachAbortSignals(
  controller: AbortController,
  requestOptions?: { signal?: AbortSignal; timeout?: number },
): { signal: AbortSignal; clear: () => void } {
  const { signal, cleanup } = createCombinedAbortSignal(controller.signal, {
    signalB: requestOptions?.signal,
    timeoutMs: requestOptions?.timeout,
  })
  return {
    signal,
    clear: cleanup,
  }
}

function parseNextSSEFrame(buffer: string): { data: string; remaining: string } | null {
  const separatorIndex = buffer.indexOf('\n\n')
  if (separatorIndex === -1) return null
  const frame = buffer.slice(0, separatorIndex)
  const remaining = buffer.slice(separatorIndex + 2)
  const data = frame
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trimStart())
    .join('\n')
  return {
    data,
    remaining,
  }
}

function readErrorBody(response: Response): Promise<unknown> {
  return response
    .json()
    .catch(async () => {
      try {
        return { error: { message: await response.text() } }
      } catch {
        return null
      }
    })
}

function extractOpenAIErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const error = body as {
    error?: { message?: string; type?: string; code?: string }
    message?: string
  }
  return error.error?.message ?? error.message ?? undefined
}

function shouldFailover(status: number, body: unknown): boolean {
  if (status >= 500 || status === 429 || status === 408) return true
  if (status === 404) return true
  if (status === 401 || status === 403) return true
  const message = extractOpenAIErrorMessage(body)?.toLowerCase() ?? ''
  return (
    message.includes('model not found') ||
    message.includes('unsupported model') ||
    message.includes('does not exist') ||
    message.includes('unavailable')
  )
}

function isRetryableOpenAITransportError(error: unknown): boolean {
  if (error instanceof APIError) {
    return shouldFailover(error.status, error.error)
  }
  return error instanceof Error
}

function wrapOpenAITransportError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }
  return new Error(String(error))
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.name === 'TimeoutError' ||
      error.message.includes('aborted'))
  )
}
