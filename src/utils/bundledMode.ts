/**
 * Detects if the current runtime is Bun.
 * Returns true when:
 * - Running a JS file via the `bun` command
 * - Running a Bun-compiled standalone executable
 */
export function isRunningWithBun(): boolean {
  // https://bun.com/guides/util/detect-bun
  return process.versions.bun !== undefined
}

function normalizeRuntimePath(path: string | undefined): string {
  return (path ?? '').replace(/\\/g, '/').toLowerCase()
}

function hasCompiledEntrypointMarker(path: string | undefined): boolean {
  const normalized = normalizeRuntimePath(path)

  // Bun standalone executables expose the bundled entrypoint through an
  // internal virtual path instead of a real script path. In practice this is
  // `$bunfs/root/...` on Unix-like systems and `B:/~BUN/root/...` on Windows.
  return (
    normalized.includes('/$bunfs/root/') ||
    normalized.includes('/~bun/root/')
  )
}

/**
 * Detects if running as a Bun-compiled standalone executable.
 * Embedded source code is not listed in `Bun.embeddedFiles`, so standalone
 * executables without extra embedded assets still need an argv-based fallback.
 */
export function isInBundledMode(): boolean {
  if (!isRunningWithBun()) {
    return false
  }

  if (
    Array.isArray(Bun.embeddedFiles) &&
    Bun.embeddedFiles.length > 0
  ) {
    return true
  }

  return (
    hasCompiledEntrypointMarker(process.argv[1]) ||
    hasCompiledEntrypointMarker(process.argv[0])
  )
}
