import { randomUUID } from 'src/utils/crypto.js'
import type { SessionId } from 'src/types/ids.js'

let currentSessionId = randomUUID() as SessionId

export function getSessionId(): SessionId {
  return currentSessionId
}

export function setSessionId(sessionId: SessionId): void {
  currentSessionId = sessionId
}

export function resetSessionIdForTests(): void {
  currentSessionId = randomUUID() as SessionId
}
