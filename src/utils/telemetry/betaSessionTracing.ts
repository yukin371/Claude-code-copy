import type { Span } from '@opentelemetry/api'

export type LLMRequestNewContext = {
  systemPrompt?: string
  querySource?: string
  tools?: string
}

export function clearBetaTracingState(): void {}

export function isBetaTracingEnabled(): boolean {
  return false
}

export function truncateContent(
  content: string,
): { content: string; truncated: boolean } {
  return { content, truncated: false }
}

export function addBetaInteractionAttributes(_span: Span, _userPrompt: string): void {}

export function addBetaLLMRequestAttributes(
  _span: Span,
  _newContext?: LLMRequestNewContext,
  _messagesForAPI?: unknown[],
): void {}

export function addBetaLLMResponseAttributes(
  _span: Span,
  _response: unknown,
): void {}

export function addBetaToolInputAttributes(
  _span: Span,
  _toolName: string,
  _input: unknown,
): void {}

export function addBetaToolResultAttributes(
  _span: Span,
  _toolName: string,
  _result: unknown,
): void {}
