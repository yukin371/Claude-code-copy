import { afterEach, describe, expect, test } from 'bun:test'

const ORIGINAL_ARGV = [...process.argv]
const ORIGINAL_VERSIONS = { ...process.versions }

function setBunVersion(version: string | undefined): void {
  Object.defineProperty(process.versions, 'bun', {
    configurable: true,
    enumerable: true,
    value: version,
    writable: true,
  })
}

afterEach(() => {
  process.argv = [...ORIGINAL_ARGV]
  setBunVersion(ORIGINAL_VERSIONS.bun)
})

describe('isInBundledMode', () => {
  test('detects standalone executables from Bun virtual entrypoint paths', async () => {
    setBunVersion('1.3.10')
    process.argv = ['bun', 'B:/~BUN/root/neko-code.exe', 'update']

    const { isInBundledMode } = await import('./bundledMode.js')

    expect(isInBundledMode()).toBe(true)
  })

  test('does not treat bun run source execution as bundled mode', async () => {
    setBunVersion('1.3.10')
    process.argv = ['bun', 'E:/Github/claude-code/src/entrypoints/cli.tsx']

    const { isInBundledMode } = await import('./bundledMode.js')

    expect(isInBundledMode()).toBe(false)
  })
})
