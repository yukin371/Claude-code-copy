export type Span = {
  end(): void
}

export type LLMRequestNewContext = {
  systemPrompt?: string
  querySource?: string
  tools?: string
}

export function isEnhancedTelemetryEnabled(): boolean {
  return false
}

export function startInteractionSpan(_userPrompt: string): Span {
  return { end() {} }
}

export function endInteractionSpan(): void {}

export function startLLMRequestSpan(_newContext?: LLMRequestNewContext): Span {
  return { end() {} }
}

export function endLLMRequestSpan(_span?: Span, _response?: unknown): void {}

export function startToolSpan(_toolName: string, _input?: unknown): Span {
  return { end() {} }
}

export function endToolSpan(_toolResult?: string, _resultTokens?: number): void {}

export function startUserInputSpan(_userInput: string): Span {
  return { end() {} }
}

export function endUserInputSpan(): void {}
