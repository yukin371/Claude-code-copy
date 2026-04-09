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
  nestedWorkspaceDir: string
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
  const nestedWorkspaceDir = join(workspaceDir, 'nested', 'child')
  const configDir = join(tempRoot, 'config')
  const pluginCacheDir = join(tempRoot, 'plugin-cache')

  mkdirSync(workspaceDir, { recursive: true })
  mkdirSync(nestedWorkspaceDir, { recursive: true })
  mkdirSync(configDir, { recursive: true })
  mkdirSync(pluginCacheDir, { recursive: true })

  return {
    tempRoot,
    workspaceDir,
    nestedWorkspaceDir,
    configDir,
    pluginCacheDir,
  }
}

function readJsonFile(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

function createCommandServer(marker: string) {
  return {
    command: 'node',
    args: ['-e', `process.stdout.write("${marker}")`],
    env: {},
  }
}

function writeProjectMcpFile(
  path: string,
  servers: Record<
    string,
    {
      command: string
      args: string[]
      env: Record<string, string>
    }
  >,
): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(
    path,
    `${JSON.stringify({ mcpServers: servers }, null, 2)}\n`,
    'utf8',
  )
}

function getServerMarker(
  server:
    | {
        args?: string[]
        command?: string
      }
    | null
    | undefined,
): string {
  if (!server) {
    return '(missing)'
  }
  return server.args?.join(' ') ?? server.command ?? '[no-command]'
}

function assertResolvedServer(
  label: string,
  server:
    | {
        scope?: string
        args?: string[]
        command?: string
      }
    | null,
  expectedScope: 'user' | 'project' | 'local',
  expectedMarker: string,
): void {
  assert(server, `Expected ${label} server to resolve, but it was missing`)
  assert(
    server.scope === expectedScope,
    `Expected ${label} scope ${expectedScope}, got ${server.scope ?? '(none)'}`,
  )
  assert(
    getServerMarker(server).includes(expectedMarker),
    `Expected ${label} marker ${expectedMarker}, got ${getServerMarker(server)}`,
  )
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

  process.chdir(environment.nestedWorkspaceDir)
  setOriginalCwd(environment.nestedWorkspaceDir)
  setCwdState(environment.nestedWorkspaceDir)

  const { enableConfigs, getProjectPathForConfig } = await import(
    '../src/utils/config.js'
  )
  enableConfigs()

  const {
    addMcpConfig,
    getMcpConfigByName,
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
  const fallbackServerName = 'smoke_scope_shadow_server'
  const userFallbackConfig = createCommandServer('user')
  const projectFallbackConfig = createCommandServer('project')
  const localFallbackConfig = createCommandServer('local')
  const projectMcpJsonPath = join(environment.nestedWorkspaceDir, '.mcp.json')
  const parentProjectServerName = 'smoke_project_parent_fallback_server'
  const parentMcpJsonPath = join(environment.workspaceDir, '.mcp.json')
  const parentProjectConfig = createCommandServer('parent')
  const childProjectConfig = createCommandServer('child')

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

  await addMcpConfig(fallbackServerName, userFallbackConfig, 'user')
  assert(
    getMcpConfigByName(fallbackServerName)?.scope === 'user',
    'Expected user scope to provide the effective MCP config before narrower overrides are added',
  )

  await addMcpConfig(fallbackServerName, projectFallbackConfig, 'project')
  const projectScoped = getMcpConfigsByScope('project')
  assert(
    projectScoped.servers[fallbackServerName]?.scope === 'project',
    'Expected project-scoped MCP server to be readable after add',
  )
  assert(
    getMcpConfigByName(fallbackServerName)?.scope === 'project',
    'Expected project scope to override the user-scoped MCP config',
  )

  const projectFile = readJsonFile(projectMcpJsonPath)
  const projectMcpServers =
    projectFile.mcpServers &&
    typeof projectFile.mcpServers === 'object' &&
    !Array.isArray(projectFile.mcpServers)
      ? (projectFile.mcpServers as Record<string, Record<string, unknown>>)
      : null
  assert(projectMcpServers, 'Expected .mcp.json to contain an mcpServers object')
  assert(
    projectMcpServers[fallbackServerName]?.command === 'node',
    'Expected project-scoped MCP server to be written into .mcp.json',
  )
  assert(
    !('scope' in projectMcpServers[fallbackServerName]!),
    'Expected .mcp.json to persist raw MCP config without scope metadata',
  )

  await addMcpConfig(fallbackServerName, localFallbackConfig, 'local')
  const localScoped = getMcpConfigsByScope('local')
  assert(
    localScoped.servers[fallbackServerName]?.scope === 'local',
    'Expected local-scoped MCP server to be readable after add',
  )
  assert(
    getMcpConfigByName(fallbackServerName)?.scope === 'local',
    'Expected local scope to override project/user MCP configs of the same name',
  )

  const globalConfigAfterLocalAdd = readJsonFile(targetGlobalConfigPath)
  const currentProjectConfigKey = getProjectPathForConfig()
  const projectEntries =
    globalConfigAfterLocalAdd.projects &&
    typeof globalConfigAfterLocalAdd.projects === 'object' &&
    !Array.isArray(globalConfigAfterLocalAdd.projects)
      ? (globalConfigAfterLocalAdd.projects as Record<string, Record<string, unknown>>)
      : {}
  const projectEntry =
    projectEntries[currentProjectConfigKey] ??
    Object.values(projectEntries).find(entry => {
      const servers =
        entry?.mcpServers &&
        typeof entry.mcpServers === 'object' &&
        !Array.isArray(entry.mcpServers)
          ? (entry.mcpServers as Record<string, unknown>)
          : null
      return Boolean(servers?.[fallbackServerName])
    }) ??
    null
  const localMcpServers =
    projectEntry?.mcpServers &&
    typeof projectEntry.mcpServers === 'object' &&
    !Array.isArray(projectEntry.mcpServers)
      ? (projectEntry.mcpServers as Record<string, Record<string, unknown>>)
      : null
  assert(
    localMcpServers?.[fallbackServerName]?.command === 'node',
    'Expected local-scoped MCP server to be persisted under the current project config',
  )
  assert(
    !('scope' in (localMcpServers?.[fallbackServerName] ?? {})),
    'Expected local-scoped MCP server persistence to omit scope metadata',
  )

  await removeMcpConfig(fallbackServerName, 'local')
  assert(
    !getMcpConfigsByScope('local').servers[fallbackServerName],
    'Expected local-scoped MCP server to be removed from project-local config',
  )
  assert(
    getMcpConfigByName(fallbackServerName)?.scope === 'project',
    'Expected project scope to take over after removing the local override',
  )

  await removeMcpConfig(fallbackServerName, 'project')
  const afterProjectRemove = getMcpConfigsByScope('project')
  assert(
    !afterProjectRemove.servers[fallbackServerName],
    'Expected project-scoped MCP server to be removed from .mcp.json',
  )
  const projectFileAfterRemove = readJsonFile(projectMcpJsonPath)
  const projectServersAfterRemove =
    projectFileAfterRemove.mcpServers &&
    typeof projectFileAfterRemove.mcpServers === 'object' &&
    !Array.isArray(projectFileAfterRemove.mcpServers)
      ? (projectFileAfterRemove.mcpServers as Record<string, unknown>)
      : {}
  assert(
    projectServersAfterRemove[fallbackServerName] === undefined,
    'Expected .mcp.json removal to drop the project-scoped server entry',
  )
  assert(
    getMcpConfigByName(fallbackServerName)?.scope === 'user',
    'Expected user scope to take over after removing the project override',
  )

  await removeMcpConfig(fallbackServerName, 'user')
  assert(
    getMcpConfigByName(fallbackServerName) === null,
    'Expected no effective MCP config to remain after removing all scope overrides',
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

  writeFileSync(
    parentMcpJsonPath,
    `${JSON.stringify(
      {
        mcpServers: {
          [parentProjectServerName]: parentProjectConfig,
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  const inheritedParent = getMcpConfigByName(parentProjectServerName)
  assert(
    inheritedParent?.scope === 'project' &&
      'args' in inheritedParent &&
      JSON.stringify(inheritedParent.args) ===
        JSON.stringify(parentProjectConfig.args),
    `Expected parent project config to be visible from nested cwd, got ${JSON.stringify(inheritedParent)}`,
  )

  await addMcpConfig(parentProjectServerName, childProjectConfig, 'project')
  const overriddenProject = getMcpConfigByName(parentProjectServerName)
  assert(
    overriddenProject?.scope === 'project' &&
      'args' in overriddenProject &&
      JSON.stringify(overriddenProject.args) ===
        JSON.stringify(childProjectConfig.args),
    `Expected child .mcp.json to override parent config, got ${JSON.stringify(overriddenProject)}`,
  )

  await removeMcpConfig(parentProjectServerName, 'project')
  const fallbackParentAgain = getMcpConfigByName(parentProjectServerName)
  assert(
    fallbackParentAgain?.scope === 'project' &&
      'args' in fallbackParentAgain &&
      JSON.stringify(fallbackParentAgain.args) ===
        JSON.stringify(parentProjectConfig.args),
    `Expected removing child override to fall back to parent .mcp.json, got ${JSON.stringify(fallbackParentAgain)}`,
  )

  console.log(`Source dir: ${sourceDir}`)
  console.log(`Temp root: ${environment.tempRoot}`)
  console.log(`Workspace: ${environment.workspaceDir}`)
  console.log(`Nested workspace: ${environment.nestedWorkspaceDir}`)
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
  console.log('[PASS] same-name MCP config falls back user -> project -> local')
  console.log('[PASS] removing overrides falls back local -> project -> user')
  console.log('[PASS] .mcp.json stores project-scoped MCP config without scope metadata')
  console.log('[PASS] local MCP config persists under the current project settings entry')
  console.log(
    `[PASS] remove user MCP server -> ${afterRemoveNames.length} (${formatListPreview(afterRemoveNames)})`,
  )
  console.log('[PASS] multi-scope MCP add/remove matches migrated baseline')
  console.log('[PASS] parent project .mcp.json fallback restores after child override removal')
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
