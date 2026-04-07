import type { CompactionResult } from './compact.js'
import type { Message } from '../../types/message.js'

type ReactiveCompactArgs = {
  customInstructions: string
  trigger: string
}

type ReactiveCompactSuccess = {
  ok: true
  reason?: never
  result: CompactionResult
}

type ReactiveCompactFailure = {
  ok: false
  reason: 'too_few_groups' | 'aborted' | 'exhausted' | 'error' | 'media_unstrippable'
  result?: never
}

export function isReactiveOnlyMode(): boolean {
  return false
}

export function isReactiveCompactEnabled(): boolean {
  return false
}

export function isWithheldPromptTooLong(_message: unknown): boolean {
  return false
}

export function isWithheldMediaSizeError(_message: unknown): boolean {
  return false
}

export async function reactiveCompactOnPromptTooLong(
  _messages: Message[],
  _cacheSafeParams: unknown,
  _args: ReactiveCompactArgs,
): Promise<ReactiveCompactSuccess | ReactiveCompactFailure> {
  return { ok: false, reason: 'error' }
}

export async function tryReactiveCompact(
  _args: Record<string, unknown>,
): Promise<CompactionResult | null> {
  return null
}
