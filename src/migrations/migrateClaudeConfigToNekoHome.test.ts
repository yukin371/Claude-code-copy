import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

const tempPaths: string[] = []

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempPaths.push(dir)
  return dir
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2))
}

function writeText(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

afterEach(() => {
  for (const path of tempPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true })
  }
})

describe('migrateClaudeConfigDirectory', () => {
  beforeEach(() => {
    mock.module('src/services/analytics/index.js', () => ({
      logEvent: () => {},
    }))
    mock.module('../services/analytics/index.js', () => ({
      logEvent: () => {},
    }))
    mock.module('../utils/config.js', () => ({
      saveGlobalConfig: () => {},
    }))
    mock.module('../utils/debug.js', () => ({
      logForDebugging: () => {},
    }))
    mock.module('../utils/env.js', () => ({
      getGlobalClaudeFile: () => '.neko-code.json',
    }))
    mock.module('../utils/envUtils.js', () => ({
      getClaudeConfigHomeDir: () => '.neko-code',
      isEnvTruthy: () => false,
    }))
    mock.module('../utils/log.js', () => ({
      logError: () => {},
    }))
    mock.module('../utils/fsOperations.js', () => ({
      getFsImplementation: () => ({
        existsSync,
        readFileSync,
        copyFileSync,
        mkdirSync: (path: string) => mkdirSync(path, { recursive: true }),
        readdirSync: (path: string) => readdirSync(path, { withFileTypes: true }),
      }),
    }))
    mock.module('../utils/json.js', () => ({
      safeParseJSON: (value: string) => JSON.parse(value),
    }))
    mock.module('../utils/jsonRead.js', () => ({
      stripBOM: (value: string) => value,
    }))
  })

  test('copies missing Claude config artifacts into the Neko config home', async () => {
    const { migrateClaudeConfigDirectory } = await import(
      './migrateClaudeConfigToNekoHome.js'
    )
    const sourceDir = createTempDir('claude-legacy-')
    const targetDir = createTempDir('neko-home-')
    const mergedConfigs: Array<Record<string, unknown>> = []

    writeJson(join(sourceDir, '.config.json'), {
      theme: 'light',
      autoCompactEnabled: false,
    })
    writeJson(join(sourceDir, 'settings.json'), {
      env: { OPENAI_API_KEY: 'legacy-key' },
    })
    writeText(join(sourceDir, '.credentials.json'), '{"token":"legacy"}')
    writeText(join(sourceDir, 'CLAUDE.md'), '# legacy memory')
    writeText(join(sourceDir, 'rules', 'team.md'), 'team rule')
    writeText(join(sourceDir, 'rules', 'nested', 'lint.md'), 'nested rule')

    const result = migrateClaudeConfigDirectory({
      sourceDir,
      targetDir,
      targetGlobalConfigPath: join(targetDir, '.neko-code.json'),
      mergeGlobalConfig: legacyConfig => {
        mergedConfigs.push(legacyConfig)
      },
    })

    expect(result.mergedGlobalConfig).toBe(true)
    expect(mergedConfigs).toHaveLength(1)
    expect(mergedConfigs[0]?.theme).toBe('light')
    expect(result.copiedFiles.slice().sort()).toEqual([
      'settings.json',
      '.credentials.json',
      'CLAUDE.md',
      join('rules', 'nested', 'lint.md'),
      join('rules', 'team.md'),
    ].sort())
    expect(readFileSync(join(targetDir, 'settings.json'), 'utf-8')).toContain(
      'legacy-key',
    )
    expect(readFileSync(join(targetDir, '.credentials.json'), 'utf-8')).toContain(
      'legacy',
    )
    expect(readFileSync(join(targetDir, 'CLAUDE.md'), 'utf-8')).toBe(
      '# legacy memory',
    )
    expect(readFileSync(join(targetDir, 'rules', 'team.md'), 'utf-8')).toBe(
      'team rule',
    )
    expect(
      readFileSync(join(targetDir, 'rules', 'nested', 'lint.md'), 'utf-8'),
    ).toBe('nested rule')
  })

  test('does not overwrite existing Neko config artifacts', async () => {
    const { migrateClaudeConfigDirectory } = await import(
      './migrateClaudeConfigToNekoHome.js'
    )
    const sourceDir = createTempDir('claude-legacy-')
    const targetDir = createTempDir('neko-home-')
    let mergeCalls = 0

    writeJson(join(sourceDir, '.config.json'), {
      theme: 'light',
    })
    writeJson(join(sourceDir, 'settings.json'), {
      env: { OPENAI_API_KEY: 'legacy-key' },
    })
    writeText(join(sourceDir, 'CLAUDE.md'), '# legacy memory')
    writeText(join(sourceDir, 'rules', 'legacy.md'), 'legacy rule')
    writeText(join(sourceDir, 'rules', 'new.md'), 'new rule')

    writeJson(join(targetDir, '.neko-code.json'), {
      theme: 'dark',
    })
    writeJson(join(targetDir, 'settings.json'), {
      env: { OPENAI_API_KEY: 'current-key' },
    })
    writeText(join(targetDir, 'CLAUDE.md'), '# current memory')
    writeText(join(targetDir, 'rules', 'legacy.md'), 'current rule')

    const result = migrateClaudeConfigDirectory({
      sourceDir,
      targetDir,
      targetGlobalConfigPath: join(targetDir, '.neko-code.json'),
      mergeGlobalConfig: () => {
        mergeCalls += 1
      },
    })

    expect(result.mergedGlobalConfig).toBe(false)
    expect(mergeCalls).toBe(0)
    expect(readFileSync(join(targetDir, 'settings.json'), 'utf-8')).toContain(
      'current-key',
    )
    expect(readFileSync(join(targetDir, 'CLAUDE.md'), 'utf-8')).toBe(
      '# current memory',
    )
    expect(readFileSync(join(targetDir, 'rules', 'legacy.md'), 'utf-8')).toBe(
      'current rule',
    )
    expect(readFileSync(join(targetDir, 'rules', 'new.md'), 'utf-8')).toBe(
      'new rule',
    )
  })
})
