export { getSafeMacroVersion } from './macroAccess.js'
import { getSafeMacroVersion } from './macroAccess.js'

/**
 * User-Agent string helpers.
 *
 * Kept dependency-free so SDK-bundled code (bridge, cli/transports) can
 * import without pulling in auth.ts and its transitive dependency tree.
 */

export function getNekoCodeUserAgent(): string {
  return `neko-code/${getSafeMacroVersion()}`
}

// Backwards-compatible export name: callers still import this in several places.
export function getClaudeCodeUserAgent(): string {
  return getNekoCodeUserAgent()
}
