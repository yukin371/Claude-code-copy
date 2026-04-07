export type Span = {
  end(): void
}

export type LLMRequestNewContext = {
  systemPrompt?: string
  querySource?: string
  tools?: string
}

export function isBetaTracingEnabled(): boolean {
  return false
}

export function isEnhancedTelemetryEnabled(): boolean {
  return false
}

export function startInteractionSpan(_userPrompt: string): Span {
  return { end() {} }
}

export function endInteractionSpan(): void {}

export function startLLMRequestSpan(
  _model?: string,
  _newContext?: LLMRequestNewContext,
  _messages?: unknown,
  _isFastMode?: boolean,
): Span {
  return { end() {} }
}

export function endLLMRequestSpan(_span?: Span, _response?: unknown): void {}

export function startToolSpan(..._args: unknown[]): Span {
  return { end() {} }
}

export function endToolSpan(..._args: unknown[]): void {}

export function startToolExecutionSpan(..._args: unknown[]): Span {
  return { end() {} }
}

export function endToolExecutionSpan(..._args: unknown[]): void {}

export function startToolBlockedOnUserSpan(..._args: unknown[]): Span {
  return { end() {} }
}

export function endToolBlockedOnUserSpan(..._args: unknown[]): void {}

export function startHookSpan(..._args: unknown[]): Span {
  return { end() {} }
}

export function endHookSpan(..._args: unknown[]): void {}

export function addToolContentEvent(..._args: unknown[]): void {}

export function startUserInputSpan(_userInput: string): Span {
  return { end() {} }
}

export function endUserInputSpan(): void {}
