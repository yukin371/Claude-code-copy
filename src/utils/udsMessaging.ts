import { tmpdir } from 'os'
import { join } from 'path'

let udsSocketPath: string | undefined
let onEnqueue: (() => void) | undefined

export function getDefaultUdsSocketPath(): string {
  return join(tmpdir(), 'claude-code-messaging.sock')
}

export function getUdsMessagingSocketPath(): string | undefined {
  return udsSocketPath
}

export async function startUdsMessaging(
  socketPath: string,
  _options?: { isExplicit?: boolean },
): Promise<void> {
  udsSocketPath = socketPath
}

export function setOnEnqueue(callback: (() => void) | undefined): void {
  onEnqueue = callback
}

export function notifyUdsMessageEnqueued(): void {
  onEnqueue?.()
}
