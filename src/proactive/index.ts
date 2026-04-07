type Listener = () => void

const listeners = new Set<Listener>()
let proactiveActive = false
let proactivePaused = false
let contextBlocked = false

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function activateProactive(_source?: string): void {
  proactiveActive = true
  proactivePaused = false
  notify()
}

export function deactivateProactive(): void {
  proactiveActive = false
  proactivePaused = false
  contextBlocked = false
  notify()
}

export function pauseProactive(): void {
  proactivePaused = true
  notify()
}

export function resumeProactive(): void {
  proactivePaused = false
  notify()
}

export function isProactiveActive(): boolean {
  return proactiveActive
}

export function isProactivePaused(): boolean {
  return proactivePaused || contextBlocked
}

export function setContextBlocked(blocked: boolean): void {
  contextBlocked = blocked
  notify()
}

export function subscribeToProactiveChanges(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getNextTickAt(): number | null {
  return null
}
