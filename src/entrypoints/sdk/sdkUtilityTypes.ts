import type { BetaUsage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

type BetaUsageServerToolUse = NonNullable<BetaUsage['server_tool_use']>
type BetaUsageCacheCreation = NonNullable<BetaUsage['cache_creation']>

export type NonNullableUsage = Omit<
  BetaUsage,
  | 'server_tool_use'
  | 'cache_creation'
  | 'input_tokens'
  | 'cache_creation_input_tokens'
  | 'cache_read_input_tokens'
  | 'output_tokens'
  | 'inference_geo'
  | 'iterations'
  | 'speed'
> & {
  input_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  output_tokens: number
  server_tool_use: {
    web_search_requests: NonNullable<
      BetaUsageServerToolUse['web_search_requests']
    >
    web_fetch_requests: NonNullable<
      BetaUsageServerToolUse['web_fetch_requests']
    >
  }
  cache_creation: {
    ephemeral_1h_input_tokens: NonNullable<
      BetaUsageCacheCreation['ephemeral_1h_input_tokens']
    >
    ephemeral_5m_input_tokens: NonNullable<
      BetaUsageCacheCreation['ephemeral_5m_input_tokens']
    >
  }
  inference_geo: NonNullable<BetaUsage['inference_geo']>
  iterations: NonNullable<BetaUsage['iterations']>
  speed: NonNullable<BetaUsage['speed']>
}
