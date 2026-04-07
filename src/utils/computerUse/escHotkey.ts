import { logForDebugging } from '../debug.js'
import { releasePump, retainPump } from './drainRunLoop.js'
import { requireComputerUseSwift } from './swiftLoader.js'

/**
 * Global Escape → abort. Mirrors Cowork's `escAbort.ts` but without Electron:
 * CGEventTap via `@ant/computer-use-swift`. While registered, Escape is
 * consumed system-wide (PI defense — a prompt-injected action can't dismiss
 * a dialog with Escape).
 *
 * Lifecycle: register on fresh lock acquire (`wrapper.tsx` `acquireCuLock`),
 * unregister on lock release (`cleanup.ts`). The tap's CFRunLoopSource sits
 * in .defaultMode on CFRunLoopGetMain(), so we hold a drainRunLoop pump
 * retain for the registration's lifetime — same refcounted setInterval as
 * the `@MainActor` methods.
 *
 * `notifyExpectedEscape()` punches a hole for model-synthesized Escapes: the
 * executor's `key("escape")` calls it before posting the CGEvent. Swift
 * schedules a 100ms decay so a CGEvent that never reaches the tap callback
 * doesn't eat the next user ESC.
 */

let registered = false

type ComputerUseHotkeyAPI = ReturnType<typeof requireComputerUseSwift> & {
  hotkey: {
    registerEscape: (onEscape: () => void) => boolean
    unregister: () => void
    notifyExpectedEscape: () => void
  }
}

function getComputerUseHotkeyApi(): ComputerUseHotkeyAPI | null {
  const cu = requireComputerUseSwift()
  const maybeHotkey = (cu as { hotkey?: unknown }).hotkey
  if (
    maybeHotkey &&
    typeof maybeHotkey === 'object' &&
    typeof (maybeHotkey as { registerEscape?: unknown }).registerEscape === 'function' &&
    typeof (maybeHotkey as { unregister?: unknown }).unregister === 'function' &&
    typeof (maybeHotkey as { notifyExpectedEscape?: unknown }).notifyExpectedEscape === 'function'
  ) {
    return cu as ComputerUseHotkeyAPI
  }
  return null
}

export function registerEscHotkey(onEscape: () => void): boolean {
  if (registered) return true
  const cu = getComputerUseHotkeyApi()
  if (!cu) {
    logForDebugging('[cu-esc] hotkey API unavailable', { level: 'warn' })
    return false
  }
  if (!cu.hotkey.registerEscape(onEscape)) {
    // CGEvent.tapCreate failed — typically missing Accessibility permission.
    // CU still works, just without ESC abort. Mirrors Cowork's escAbort.ts:81.
    logForDebugging('[cu-esc] registerEscape returned false', { level: 'warn' })
    return false
  }
  retainPump()
  registered = true
  logForDebugging('[cu-esc] registered')
  return true
}

export function unregisterEscHotkey(): void {
  if (!registered) return
  try {
    const cu = getComputerUseHotkeyApi()
    cu?.hotkey.unregister()
  } finally {
    releasePump()
    registered = false
    logForDebugging('[cu-esc] unregistered')
  }
}

export function notifyExpectedEscape(): void {
  if (!registered) return
  const cu = getComputerUseHotkeyApi()
  cu?.hotkey.notifyExpectedEscape()
}
