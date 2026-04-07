import type { Message, SystemMessage } from '../../types/message.js'

const SNIP_MARKER_SUBTYPE = 'snip_marker'

export type SnipCompactResult = {
  messages: Message[]
  tokensFreed: number
  boundaryMessage?: SystemMessage
}

export function isSnipMarkerMessage(message: Message): boolean {
  return message.type === 'system' && message.subtype === SNIP_MARKER_SUBTYPE
}

export function snipCompactIfNeeded(
  messages: Message[],
  _options?: { force?: boolean },
): SnipCompactResult {
  return {
    messages,
    tokensFreed: 0,
  }
}
