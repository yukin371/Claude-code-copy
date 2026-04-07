#!/usr/bin/env bun

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setCwdState, setOriginalCwd } from '../src/bootstrap/state.js'
import { enableConfigs } from '../src/utils/config.js'
import {
  getClaudeCodeMcpConfigs,
  parseMcpConfigFromFilePath,
} from '../src/services/mcp/config.js'
import type {
  McpServerConfig,
  ScopedMcpServerConfig,
} from '../src/services/mcp/types.js'

type EnvKey =
  | 'NEKO_CODE_CONFIG_DIR'
  | 'CLAUDE_CODE_PLUGIN_CACHE_DIR'
  | 'CLAUDE_CODE_SIMPLE'

type CliRun = {
  label: string
  exitCode: number
  outputPreview: string
}

type SemanticRun = {
  label: string
  nonStrictNames: string[]
  strictNames: string[]
  localScope?: string
  dynamicScope?: string
}

const keepTemp = process.argv.includes('--keep-temp')

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function formatCliRun(run: CliRun): string[] {
  return [
    `[PASS] ${run.label}`,
    `  exitCode=${run.exitCode}`,
    `  output=${run.outputPreview || '[no output]'}`,
  ]
}

function formatSemanticRun(run: SemanticRun): string[] {
  return [
    `[PASS] ${run.label}`,
    `  nonStrict=${run.nonStrictNames.join(', ') || '(none)'}`,
    `  strict=${run.strictNames.join(', ') || '(none)'}`,
    ...(run.localScope ? [`  localScope=${run.localScope}`] : []),
    ...(run.dynamicScope ? [`  dynamicScope=${run.dynamicScope}`] : []),
  ]
}

function getOutputPreview(output: string): string {
  const normalized = output.replace(/\r/g, '').trim()
  if (!normalized) {
    return ''
  }

  const firstLine = normalized.split('\n')[0] ?? ''
  return firstLine.length <= 140
    ? firstLine
    : `${firstLine.slice(0, 116)} ... [truncated]`
}

async function runCliCase({
  label,
  configPath,
  cwd,
}: {
  label: string
  configPath: string
  cwd: string
}): Promise<CliRun> {
  const proc = Bun.spawn(
    [
      Bun.which('bun') ?? 'bun',
      'src/entrypoints/cli.tsx',
      '--bare',
      '--init-only',
      '--strict-mcp-config',
      '--mcp-config',
      configPath,
    ],
    {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
      },
    },
  )

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  return {
    label,
    exitCode,
    outputPreview: getOutputPreview(stderr || stdout),
  }
}

async function loadDynamicConfig(
  configPath: string,
): Promise<Record<string, ScopedMcpServerConfig>> {
  const result = parseMcpConfigFromFilePath({
    filePath: configPath,
    expandVars: true,
    scope: 'dynamic',
  })

  assert(result.errors.length === 0, 'Expected valid explicit MCP config')
  assert(result.config, 'Expected valid explicit MCP config to parse')

  const scopedEntries = Object.entries(result.config.mcpServers).map(
    ([name, config]) => [
      name,
      {
        ...config,
        scope: 'dynamic' as const,
      },
    ],
  )

  return Object.fromEntries(scopedEntries)
}

async function runStrictSemanticCase(
  dynamicMcpConfig: Record<string, ScopedMcpServerConfig>,
): Promise<SemanticRun> {
  const existing = await getClaudeCodeMcpConfigs(dynamicMcpConfig)
  const nonStrict = {
    ...existing.servers,
    ...dynamicMcpConfig,
  }
  const strict = dynamicMcpConfig

  const nonStrictNames = Object.keys(nonStrict).sort()
  const strictNames = Object.keys(strict).sort()

  assert(
    nonStrictNames.includes('local') && nonStrictNames.includes('dynamic'),
    `Expected non-strict config resolution to include local,dynamic, got ${nonStrictNames.join(', ') || '(none)'}`,
  )
  assert(
    strictNames.length === 1 && strictNames[0] === 'dynamic',
    `Expected strict config resolution to keep only explicit dynamic config, got ${strictNames.join(', ') || '(none)'}`,
  )

  return {
    label: 'strict-suppresses-local-configs',
    nonStrictNames,
    strictNames,
    localScope: nonStrict.local?.scope,
    dynamicScope: nonStrict.dynamic?.scope,
  }
}

const tempRoot = await mkdtemp(join(tmpdir(), 'neko-mcp-strict-config-smoke-'))
const workspaceDir = join(tempRoot, 'workspace')
const configDir = join(tempRoot, 'config')
const pluginCacheDir = join(tempRoot, 'plugin-cache')
const validConfigPath = join(tempRoot, 'valid-mcp.json')
const invalidConfigPath = join(tempRoot, 'invalid-mcp.json')
const localConfigPath = join(workspaceDir, '.mcp.json')

const trackedEnvVars: EnvKey[] = [
  'NEKO_CODE_CONFIG_DIR',
  'CLAUDE_CODE_PLUGIN_CACHE_DIR',
  'CLAUDE_CODE_SIMPLE',
]
const oldEnv = new Map<EnvKey, string | undefined>()
const previousCwd = process.cwd()

try {
  await mkdir(workspaceDir, { recursive: true })
  await mkdir(configDir, { recursive: true })
  await mkdir(pluginCacheDir, { recursive: true })

  await writeFile(
    validConfigPath,
    `${JSON.stringify(
      {
        mcpServers: {
          dynamic: {
            command: 'cmd',
            args: ['/c', 'exit', '0'],
          } satisfies McpServerConfig,
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  await writeFile(
    invalidConfigPath,
    `${JSON.stringify(
      {
        mcpServers: {
          broken: {
            command: 123,
          },
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  await writeFile(
    localConfigPath,
    `${JSON.stringify(
      {
        mcpServers: {
          local: {
            command: 'cmd',
            args: ['/c', 'exit', '0'],
          } satisfies McpServerConfig,
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  for (const key of trackedEnvVars) {
    oldEnv.set(key, process.env[key])
  }

  process.env.NEKO_CODE_CONFIG_DIR = configDir
  process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR = pluginCacheDir
  delete process.env.CLAUDE_CODE_SIMPLE

  process.chdir(workspaceDir)
  setOriginalCwd(workspaceDir)
  setCwdState(workspaceDir)
  enableConfigs()

  const dynamicMcpConfig = await loadDynamicConfig(validConfigPath)

  const validCli = await runCliCase({
    label: 'cli-valid-strict-config',
    configPath: validConfigPath,
    cwd: previousCwd,
  })
  assert(
    validCli.exitCode === 0,
    `Expected valid strict MCP CLI case to exit 0, got ${validCli.exitCode}`,
  )

  const invalidCli = await runCliCase({
    label: 'cli-invalid-strict-config',
    configPath: invalidConfigPath,
    cwd: previousCwd,
  })
  assert(
    invalidCli.exitCode === 1,
    `Expected invalid strict MCP CLI case to exit 1, got ${invalidCli.exitCode}`,
  )
  assert(
    invalidCli.outputPreview.includes('Invalid MCP configuration'),
    `Expected invalid strict MCP CLI case to mention invalid configuration, got ${invalidCli.outputPreview || '[no output]'}`,
  )

  const semanticRun = await runStrictSemanticCase(dynamicMcpConfig)

  console.log(`Temp root: ${tempRoot}`)
  console.log(`Workspace: ${workspaceDir}`)
  console.log(`Config dir: ${configDir}`)
  console.log(`Plugin cache dir: ${pluginCacheDir}`)
  console.log(`Local config: ${localConfigPath}`)
  console.log(`Explicit valid config: ${validConfigPath}`)
  console.log(`Explicit invalid config: ${invalidConfigPath}`)
  console.log('')

  for (const line of formatCliRun(validCli)) {
    console.log(line)
  }
  console.log('')
  for (const line of formatCliRun(invalidCli)) {
    console.log(line)
  }
  console.log('')
  for (const line of formatSemanticRun(semanticRun)) {
    console.log(line)
  }
} finally {
  process.chdir(previousCwd)
  setOriginalCwd(previousCwd)
  setCwdState(previousCwd)

  for (const key of trackedEnvVars) {
    const value = oldEnv.get(key)
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  if (!keepTemp) {
    await rm(tempRoot, { recursive: true, force: true })
  }
}
