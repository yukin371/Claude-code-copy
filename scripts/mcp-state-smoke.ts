#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setCwdState, setOriginalCwd } from '../src/bootstrap/state.js'
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function formatListPreview(items: string[], maxItems = 6): string {
  if (items.length === 0) {
    return '(none)'
  }

  if (items.length <= maxItems) {
    return items.join(', ')
  }

  return `${items.slice(0, maxItems).join(', ')} ... (+${items.length - maxItems})`
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
    if (key === 'mcpServers' && value && typeof value === 'object' && !Array.isArray(value)) {
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
  const tempRoot = await mkdtemp(join(tmpdir(), 'neko-mcp-state-smoke-'))
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

const keepTemp = process.argv.includes('--keep-temp')
const sourceDirArgIndex = process.argv.indexOf('--source-dir')
const sourceDir =
  sourceDirArgIndex >= 0 && process.argv[sourceDirArgIndex + 1]
    ? resolve(process.argv[sourceDirArgIndex + 1]!)
    : join(homedir(), '.claude')

assert(existsSync(sourceDir), `Claude config source dir not found: ${sourceDir}`)

const trackedEnvVars: EnvKey[] = [
  'NEKO_CODE_CONFIG_DIR',
  'CLAUDE_CODE_PLUGIN_CACHE_DIR',
  'CLAUDE_CODE_SIMPLE',
]
const oldEnv = new Map<EnvKey, string | undefined>()
const previousCwd = process.cwd()
const environment = await createEnvironment()

try {
  for (const key of trackedEnvVars) {
    oldEnv.set(key, process.env[key])
  }

  const targetGlobalConfigPath = getTargetGlobalConfigPath(environment.configDir)
  const migrationResult = migrateClaudeConfigDirectory({
    sourceDir,
    targetDir: environment.configDir,
    targetPluginsDir: environment.pluginCacheDir,
    targetGlobalConfigPath,
    mergeGlobalConfig: legacyConfig =>
      writeMergedGlobalConfig(targetGlobalConfigPath, legacyConfig),
  })

  process.env.NEKO_CODE_CONFIG_DIR = environment.configDir
  process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR = environment.pluginCacheDir
  delete process.env.CLAUDE_CODE_SIMPLE

  process.chdir(environment.workspaceDir)
  setOriginalCwd(environment.workspaceDir)
  setCwdState(environment.workspaceDir)

  const { enableConfigs } = await import('../src/utils/config.js')
  enableConfigs()

  const {
    addMcpConfig,
    removeMcpConfig,
    getMcpConfigsByScope,
  } = await import('../src/services/mcp/config.js')

  const baseline = getMcpConfigsByScope('user')
  const baselineNames = Object.keys(baseline.servers).sort((left, right) =>
    left.localeCompare(right),
  )
  assert(
    baselineNames.length > 0,
    'No migrated user-scoped MCP servers found in temporary config',
  )

  const tempServerName = 'smoke_temp_user_server'
  const tempServerConfig = {
    command: 'node',
    args: ['-e', 'process.stdout.write("smoke")'],
    env: {},
  }

  await addMcpConfig(tempServerName, tempServerConfig, 'user')
  const afterAdd = getMcpConfigsByScope('user')
  const afterAddNames = Object.keys(afterAdd.servers).sort((left, right) =>
    left.localeCompare(right),
  )

  assert(
    afterAddNames.includes(tempServerName),
    `Expected ${tempServerName} to appear in user MCP config after add`,
  )
  assert(
    'command' in afterAdd.servers[tempServerName] &&
      afterAdd.servers[tempServerName].command === 'node',
    `Expected ${tempServerName} command to be preserved after add`,
  )

  await removeMcpConfig(tempServerName, 'user')
  const afterRemove = getMcpConfigsByScope('user')
  const afterRemoveNames = Object.keys(afterRemove.servers).sort((left, right) =>
    left.localeCompare(right),
  )

  assert(
    !afterRemoveNames.includes(tempServerName),
    `Expected ${tempServerName} to be removed from user MCP config`,
  )
  assert(
    JSON.stringify(afterRemoveNames) === JSON.stringify(baselineNames),
    'Expected user MCP server set after remove to match migrated baseline',
  )

  console.log(`Source dir: ${sourceDir}`)
  console.log(`Temp root: ${environment.tempRoot}`)
  console.log(`Workspace: ${environment.workspaceDir}`)
  console.log(`Config dir: ${environment.configDir}`)
  console.log(`Plugin cache dir: ${environment.pluginCacheDir}`)
  console.log(`Merged global config: ${migrationResult.mergedGlobalConfig}`)
  console.log(
    `Baseline migrated user MCP servers: ${baselineNames.length} (${formatListPreview(baselineNames)})`,
  )
  console.log(
    `Baseline command preview: ${formatListPreview(
      baselineNames.map(name => {
        const server = baseline.servers[name]
        if ('command' in server) {
          return `${name}: ${server.command}`
        }
        if ('url' in server) {
          return `${name}: ${server.url}`
        }
        return `${name}: [sdk]`
      }),
    )}`,
  )
  console.log(
    `[PASS] add user MCP server -> ${afterAddNames.length} (${formatListPreview(afterAddNames)})`,
  )
  console.log(
    `[PASS] remove user MCP server -> ${afterRemoveNames.length} (${formatListPreview(afterRemoveNames)})`,
  )
  console.log('[PASS] user-scoped MCP add/remove matches migrated baseline')
} finally {
  process.chdir(previousCwd)

  for (const key of trackedEnvVars) {
    const value = oldEnv.get(key)
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  if (!keepTemp) {
    await rm(environment.tempRoot, { recursive: true, force: true })
  }
}
