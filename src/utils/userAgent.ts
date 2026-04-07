/**
 * User-Agent string helpers.
 *
 * Kept dependency-free so SDK-bundled code (bridge, cli/transports) can
 * import without pulling in auth.ts and its transitive dependency tree.
 */

export function getClaudeCodeUserAgent(): string {
  return `claude-code/${getSafeMacroVersion()}`
}

export function getSafeMacroVersion(): string {
  if (typeof MACRO !== 'undefined' && MACRO.VERSION) {
    return MACRO.VERSION
  }
  return 'unknown'
}
