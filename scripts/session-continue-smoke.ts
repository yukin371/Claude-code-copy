#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileSuffixForOauthConfig } from '../src/constants/oauth.js'
import { GLOBAL_CONFIG_BASENAME } from '../src/constants/product.js'
import { migrateClaudeConfigDirectory } from '../src/migrations/migrateClaudeConfigToNekoHome.js'
import { getProjectDir } from '../src/utils/sessionStorage.js'

type EnvKey =
  | 'NEKO_CODE_CONFIG_DIR'
  | 'CLAUDE_CODE_PLUGIN_CACHE_DIR'
  | 'CLAUDE_CODE_SIMPLE'
  | 'NEKO_CODE_DISABLED_MCP_SERVERS'

type SmokeEnvironment = {
  tempRoot: string
  workspaceDir: string
  configDir: string
  pluginCacheDir: string
}

type SmokeOptions = {
  keepTemp: boolean
  sourceDir: string
  disableMcpServers?: string
}

type CommandResult = {
  args: string[]
  exitCode: number
  stdout: string
  stderr: string
}

const trackedEnvVars: EnvKey[] = [
  'NEKO_CODE_CONFIG_DIR',
  'CLAUDE_CODE_PLUGIN_CACHE_DIR',
  'CLAUDE_CODE_SIMPLE',
  'NEKO_CODE_DISABLED_MCP_SERVERS',
]

const repoRoot = process.cwd()
const cliEntrypoint = join(repoRoot, 'src/entrypoints/cli.tsx')
const firstPrompt = 'Reply with exactly FIRST'
const secondPrompt = 'Reply with exactly SECOND'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function parseArgs(argv: string[]): SmokeOptions {
  let keepTemp = false
  let sourceDir = join(homedir(), '.claude')
  let disableMcpServers: string | undefined

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

    if (arg === '--disable-mcp-servers') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('--disable-mcp-servers requires a csv value')
      }
      disableMcpServers = value
      index += 1
      continue
    }

    if (arg === '--disable-serena') {
      disableMcpServers = disableMcpServers
        ? `${disableMcpServers},serena`
        : 'serena'
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  return {
    keepTemp,
    sourceDir,
    disableMcpServers,
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
  const tempRoot = await mkdtemp(join(tmpdir(), 'neko-session-continue-smoke-'))
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

async function listTranscriptFiles(projectDir: string): Promise<string[]> {
  const files: string[] = []

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
        continue
      }
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        files.push(fullPath)
      }
    }
  }

  await walk(projectDir)
  return files.sort((left, right) => left.localeCompare(right))
}

async function countTranscriptLines(path: string): Promise<number> {
  const content = await readFile(path, 'utf8')
  return content
    .split('\n')
    .filter(line => line.trim().length > 0).length
}

function normalizeOutput(text: string): string {
  return text.replace(/\r/g, '').trim()
}

function printCommandResult(label: string, result: CommandResult): void {
  console.log(`[${label}] exit=${result.exitCode}`)
  console.log(`  args=${result.args.join(' ')}`)
  console.log(`  stdout=${normalizeOutput(result.stdout) || '[empty]'}`)
  if (normalizeOutput(result.stderr)) {
    console.log(`  stderr=${normalizeOutput(result.stderr)}`)
  }
}

async function runCommand(
  args: string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
): Promise<CommandResult> {
  const bunPath = Bun.which('bun') ?? process.execPath
  const proc = Bun.spawn([bunPath, ...args], {
    cwd,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  return {
    args,
    exitCode,
    stdout,
    stderr,
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

  process.env.NEKO_CODE_CONFIG_DIR = environment.configDir
  process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR = environment.pluginCacheDir
  process.env.CLAUDE_CODE_SIMPLE = '1'
  if (options.disableMcpServers) {
    process.env.NEKO_CODE_DISABLED_MCP_SERVERS = options.disableMcpServers
  } else {
    delete process.env.NEKO_CODE_DISABLED_MCP_SERVERS
  }

  const childEnv = { ...process.env }
  const projectDir = getProjectDir(environment.workspaceDir)

  const firstRun = await runCommand(
    [cliEntrypoint, '-p', '--max-turns', '1', firstPrompt],
    childEnv,
    environment.workspaceDir,
  )
  printCommandResult('first-run', firstRun)
  assert(firstRun.exitCode === 0, 'First print run failed')
  assert(
    normalizeOutput(firstRun.stdout) === 'FIRST',
    `Expected first run stdout FIRST, got ${normalizeOutput(firstRun.stdout) || '[empty]'}`,
  )

  const transcriptsAfterFirst = await listTranscriptFiles(projectDir)
  assert(
    transcriptsAfterFirst.length === 1,
    `Expected exactly one transcript after first run, found ${transcriptsAfterFirst.length}`,
  )
  const transcriptPath = transcriptsAfterFirst[0]!
  const firstLineCount = await countTranscriptLines(transcriptPath)

  const secondRun = await runCommand(
    [cliEntrypoint, '-p', '--continue', '--max-turns', '1', secondPrompt],
    childEnv,
    environment.workspaceDir,
  )
  printCommandResult('continue-run', secondRun)
  assert(secondRun.exitCode === 0, 'Continue print run failed')
  assert(
    normalizeOutput(secondRun.stdout) === 'SECOND',
    `Expected continue run stdout SECOND, got ${normalizeOutput(secondRun.stdout) || '[empty]'}`,
  )

  const transcriptsAfterSecond = await listTranscriptFiles(projectDir)
  assert(
    transcriptsAfterSecond.length === 1,
    `Expected exactly one transcript after continue run, found ${transcriptsAfterSecond.length}`,
  )
  assert(
    transcriptsAfterSecond[0] === transcriptPath,
    'Expected --continue to append to the existing transcript instead of creating a new one',
  )

  const secondLineCount = await countTranscriptLines(transcriptPath)
  assert(
    secondLineCount > firstLineCount,
    `Expected transcript line count to increase after --continue (${firstLineCount} -> ${secondLineCount})`,
  )

  console.log('')
  console.log(`[PASS] session-continue-smoke`)
  console.log(`  tempRoot=${environment.tempRoot}`)
  console.log(`  projectDir=${projectDir}`)
  console.log(`  transcript=${relative(environment.tempRoot, transcriptPath)}`)
  console.log(`  transcriptLines=${firstLineCount} -> ${secondLineCount}`)
  console.log(
    `  disabledMcpServers=${options.disableMcpServers ?? '(none)'}`,
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
