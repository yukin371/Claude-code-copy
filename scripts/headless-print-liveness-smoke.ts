#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileSuffixForOauthConfig } from '../src/constants/oauth.js'
import { GLOBAL_CONFIG_BASENAME } from '../src/constants/product.js'
import { migrateClaudeConfigDirectory } from '../src/migrations/migrateClaudeConfigToNekoHome.js'

type EnvKey =
  | 'NEKO_CODE_CONFIG_DIR'
  | 'CLAUDE_CODE_PLUGIN_CACHE_DIR'
  | 'CLAUDE_CODE_SIMPLE'

type SmokeEnvironment = {
  tempRoot: string
  workspaceDir: string
  configDir: string
  pluginCacheDir: string
}

type SmokeOptions = {
  keepTemp: boolean
  sourceDir: string
  livenessMs: number
  prompt: string
}

const trackedEnvVars: EnvKey[] = [
  'NEKO_CODE_CONFIG_DIR',
  'CLAUDE_CODE_PLUGIN_CACHE_DIR',
  'CLAUDE_CODE_SIMPLE',
]

const repoRoot = process.cwd()
const cliEntrypoint = join(repoRoot, 'src/entrypoints/cli.tsx')

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function parseArgs(argv: string[]): SmokeOptions {
  let keepTemp = false
  let sourceDir = join(homedir(), '.claude')
  let livenessMs = 5000
  let prompt = 'Reply with exactly OK'

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--keep-temp') {
      keepTemp = true
      continue
    }

    if (arg === '--source-dir') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('--source-dir requires a path value')
      }
      sourceDir = resolve(value)
      index += 1
      continue
    }

    if (arg === '--liveness-ms') {
      const value = Number(argv[index + 1])
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error('--liveness-ms requires a positive integer')
      }
      livenessMs = value
      index += 1
      continue
    }

    if (arg === '--prompt') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('--prompt requires a value')
      }
      prompt = value
      index += 1
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  return {
    keepTemp,
    sourceDir,
    livenessMs,
    prompt,
  }
}

function getTargetGlobalConfigPath(configDir: string): string {
  return join(
    configDir,
    `${GLOBAL_CONFIG_BASENAME}${fileSuffixForOauthConfig()}.json`,
  )
}

function writeMergedGlobalConfig(
  targetGlobalConfigPath: string,
  legacyConfig: Record<string, unknown>,
): boolean {
  const { migrationVersion: _ignoredMigrationVersion, ...rest } = legacyConfig
  const currentConfig =
    existsSync(targetGlobalConfigPath)
      ? (JSON.parse(readFileSync(targetGlobalConfigPath, 'utf8')) as Record<
          string,
          unknown
        >)
      : {}
  const mergedConfig: Record<string, unknown> = { ...currentConfig }
  let changed = false

  for (const [key, value] of Object.entries(rest)) {
    if (
      key === 'mcpServers' &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      const currentServers =
        currentConfig.mcpServers &&
        typeof currentConfig.mcpServers === 'object' &&
        !Array.isArray(currentConfig.mcpServers)
          ? (currentConfig.mcpServers as Record<string, unknown>)
          : undefined
      const legacyServers = value as Record<string, unknown>

      if (!currentServers) {
        mergedConfig.mcpServers = { ...legacyServers }
        changed = true
        continue
      }

      const missingEntries = Object.entries(legacyServers).filter(
        ([serverName]) => currentServers[serverName] === undefined,
      )
      if (missingEntries.length > 0) {
        mergedConfig.mcpServers = {
          ...legacyServers,
          ...currentServers,
        }
        changed = true
      }
      continue
    }

    if (mergedConfig[key] === undefined) {
      mergedConfig[key] = value
      changed = true
    }
  }

  if (!changed) {
    return false
  }

  mkdirSync(dirname(targetGlobalConfigPath), { recursive: true })
  writeFileSync(
    targetGlobalConfigPath,
    `${JSON.stringify(mergedConfig, null, 2)}\n`,
    'utf8',
  )
  return true
}

async function createEnvironment(): Promise<SmokeEnvironment> {
  const tempRoot = await mkdtemp(join(tmpdir(), 'neko-headless-print-smoke-'))
  const workspaceDir = join(tempRoot, 'workspace')
  const configDir = join(tempRoot, 'config')
  const pluginCacheDir = join(tempRoot, 'plugin-cache')

  mkdirSync(workspaceDir, { recursive: true })
  mkdirSync(configDir, { recursive: true })
  mkdirSync(pluginCacheDir, { recursive: true })

  return {
    tempRoot,
    workspaceDir,
    configDir,
    pluginCacheDir,
  }
}

function formatPreview(text: string): string[] {
  const normalized = text.replace(/\r/g, '').trim()
  if (!normalized) {
    return ['[no output]']
  }

  return normalized
    .split('\n')
    .slice(0, 6)
    .map(line => (line.length > 180 ? `${line.slice(0, 180)} ...` : line))
}

function printPreview(label: string, text: string): void {
  for (const line of formatPreview(text)) {
    console.log(`  ${label}: ${line}`)
  }
}

function printDebugTail(debugFilePath: string): void {
  if (!existsSync(debugFilePath)) {
    console.log('  debug: [missing debug log]')
    return
  }

  const content = readFileSync(debugFilePath, 'utf8')
  const lines = content
    .replace(/\r/g, '')
    .trim()
    .split('\n')
    .slice(-20)

  if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
    console.log('  debug: [empty debug log]')
    return
  }

  for (const line of lines) {
    console.log(`  debug: ${line}`)
  }
}

const options = parseArgs(process.argv.slice(2))
assert(
  existsSync(options.sourceDir),
  `Claude config source dir not found: ${options.sourceDir}`,
)

const oldEnv = new Map<EnvKey, string | undefined>()
for (const key of trackedEnvVars) {
  oldEnv.set(key, process.env[key])
}

const environment = await createEnvironment()

try {
  const targetGlobalConfigPath = getTargetGlobalConfigPath(environment.configDir)
  migrateClaudeConfigDirectory({
    sourceDir: options.sourceDir,
    targetDir: environment.configDir,
    targetPluginsDir: environment.pluginCacheDir,
    targetGlobalConfigPath,
    mergeGlobalConfig: legacyConfig =>
      writeMergedGlobalConfig(targetGlobalConfigPath, legacyConfig),
  })

  const bunPath = Bun.which('bun') ?? process.execPath
  const debugFilePath = join(environment.tempRoot, 'headless-print-debug.log')
  const proc = Bun.spawn(
    [
      bunPath,
      cliEntrypoint,
      '-p',
      '--debug-file',
      debugFilePath,
      '--max-turns',
      '1',
      '--max-budget-usd',
      '0.05',
      options.prompt,
    ],
    {
      cwd: environment.workspaceDir,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        NEKO_CODE_CONFIG_DIR: environment.configDir,
        CLAUDE_CODE_PLUGIN_CACHE_DIR: environment.pluginCacheDir,
      },
    },
  )

  const startedAt = Date.now()
  const status = await Promise.race([
    proc.exited.then(exitCode => ({ kind: 'exited' as const, exitCode })),
    new Promise<{ kind: 'alive' }>(resolve => {
      setTimeout(() => resolve({ kind: 'alive' }), options.livenessMs)
    }),
  ])

  if (status.kind === 'alive') {
    console.log('[PASS] headless print liveness')
    console.log(`  tempRoot: ${environment.tempRoot}`)
    console.log(`  workspace: ${environment.workspaceDir}`)
    console.log(`  configDir: ${environment.configDir}`)
    console.log(`  pluginCacheDir: ${environment.pluginCacheDir}`)
    console.log(`  debugFile: ${debugFilePath}`)
    console.log(`  prompt: ${options.prompt}`)
    console.log(
      `  result: process stayed alive for ${options.livenessMs}ms; no silent early exit detected`,
    )
    proc.kill()
    await proc.exited
    process.exit(0)
  }

  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const hasOutput = stdout.trim().length > 0 || stderr.trim().length > 0
  const durationMs = Date.now() - startedAt

  console.log(`tempRoot: ${environment.tempRoot}`)
  console.log(`workspace: ${environment.workspaceDir}`)
  console.log(`configDir: ${environment.configDir}`)
  console.log(`pluginCacheDir: ${environment.pluginCacheDir}`)
  console.log(`debugFile: ${debugFilePath}`)
  console.log(`prompt: ${options.prompt}`)
  console.log(`durationMs: ${durationMs}`)
  console.log(`exitCode: ${status.exitCode}`)
  printPreview('stdout', stdout)
  printPreview('stderr', stderr)
  printDebugTail(debugFilePath)

  if (status.exitCode === 0 && !hasOutput) {
    console.error('')
    console.error(
      '[FAIL] headless print exited 0 with empty stdout/stderr before the liveness window; this matches the silent early-exit regression',
    )
    process.exit(1)
  }

  console.log('')
  console.log(
    '[PASS] headless print did not reproduce the silent early-exit regression',
  )
} finally {
  for (const key of trackedEnvVars) {
    const value = oldEnv.get(key)
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  if (!options.keepTemp) {
    await rm(environment.tempRoot, { recursive: true, force: true })
  }
}
