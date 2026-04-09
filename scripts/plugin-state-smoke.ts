#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setCwdState, setOriginalCwd } from '../src/bootstrap/state.js'
import { fileSuffixForOauthConfig } from '../src/constants/oauth.js'
import { GLOBAL_CONFIG_BASENAME } from '../src/constants/product.js'
import { migrateClaudeConfigDirectory } from '../src/migrations/migrateClaudeConfigToNekoHome.js'
import {
  getDefaultAppState,
  type AppState,
} from '../src/state/AppStateStore.js'
import type { LoadedPlugin } from '../src/types/plugin.js'
import { refreshActivePlugins } from '../src/utils/plugins/refresh.js'

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

type PluginCapabilitySnapshot = {
  enabledPluginSources: string[]
  pluginCommandNames: string[]
  pluginSkillNames: string[]
  pluginAgentNames: string[]
  pluginMcpServerNames: string[]
  pluginLspServerNames: string[]
}

type RefreshSnapshot = PluginCapabilitySnapshot & {
  appEnabledCount: number
  appCommandCount: number
  appAgentCount: number
  appHookCount: number
  appMcpCount: number
  appLspCount: number
  pluginReconnectKey: number
}

type CandidatePlugin = {
  source: string
  name: string
  commandNames: string[]
  skillNames: string[]
  agentNames: string[]
  hookCommandCount: number
  mcpServerNames: string[]
  lspServerNames: string[]
}

type RefreshHarness = {
  appState: AppState
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
  const tempRoot = await mkdtemp(join(tmpdir(), 'neko-plugin-state-smoke-'))
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

async function captureSnapshot(): Promise<PluginCapabilitySnapshot> {
  const [
    { loadAllPluginsCacheOnly },
    { getPluginCommands, getPluginSkills },
    { loadPluginAgents },
  ] = await Promise.all([
    import('../src/utils/plugins/pluginLoader.js'),
    import('../src/utils/plugins/loadPluginCommands.js'),
    import('../src/utils/plugins/loadPluginAgents.js'),
  ])

  const [plugins, commands, skills, agents] = await Promise.all([
    loadAllPluginsCacheOnly(),
    getPluginCommands(),
    getPluginSkills(),
    loadPluginAgents(),
  ])

  const pluginMcpServerNames = new Set<string>()
  const pluginLspServerNames = new Set<string>()

  for (const plugin of plugins.enabled) {
    if (plugin.mcpServers) {
      for (const serverName of Object.keys(plugin.mcpServers)) {
        pluginMcpServerNames.add(serverName)
      }
    }
    if (plugin.lspServers) {
      for (const serverName of Object.keys(plugin.lspServers)) {
        pluginLspServerNames.add(serverName)
      }
    }
  }

  return {
    enabledPluginSources: plugins.enabled
      .map(plugin => plugin.source || plugin.name)
      .sort((left, right) => left.localeCompare(right)),
    pluginCommandNames: commands
      .map(command => command.name)
      .sort((left, right) => left.localeCompare(right)),
    pluginSkillNames: skills
      .map(skill => skill.name)
      .sort((left, right) => left.localeCompare(right)),
    pluginAgentNames: agents
      .map(agent => agent.agentType)
      .sort((left, right) => left.localeCompare(right)),
    pluginMcpServerNames: [...pluginMcpServerNames].sort((left, right) =>
      left.localeCompare(right),
    ),
    pluginLspServerNames: [...pluginLspServerNames].sort((left, right) =>
      left.localeCompare(right),
    ),
  }
}

async function runRefresh(harness: RefreshHarness): Promise<RefreshSnapshot> {
  const result = await refreshActivePlugins(updater => {
    harness.appState = updater(harness.appState)
  })
  const snapshot = await captureSnapshot()

  return {
    ...snapshot,
    appEnabledCount: result.enabled_count,
    appCommandCount: result.command_count,
    appAgentCount: result.agent_count,
    appHookCount: result.hook_count,
    appMcpCount: result.mcp_count,
    appLspCount: result.lsp_count,
    pluginReconnectKey: harness.appState.mcp.pluginReconnectKey,
  }
}

function countHookCommands(plugin: LoadedPlugin): number {
  if (!plugin.hooksConfig) {
    return 0
  }

  return Object.values(plugin.hooksConfig).reduce(
    (sum, matchers) =>
      sum + (matchers?.reduce((hookSum, matcher) => hookSum + matcher.hooks.length, 0) ?? 0),
    0,
  )
}

function buildCandidatePlugin(
  enabledPlugins: LoadedPlugin[],
  snapshot: PluginCapabilitySnapshot,
): CandidatePlugin | null {
  const candidates = enabledPlugins
    .map(plugin => {
      const prefix = `${plugin.name}:`
      const commandNames = snapshot.pluginCommandNames.filter(name =>
        name.startsWith(prefix),
      )
      const skillNames = snapshot.pluginSkillNames.filter(name =>
        name.startsWith(prefix),
      )
      const agentNames = snapshot.pluginAgentNames.filter(name =>
        name.startsWith(prefix),
      )
      const hookCommandCount = countHookCommands(plugin)
      const mcpServerNames = plugin.mcpServers ? Object.keys(plugin.mcpServers) : []
      const lspServerNames = plugin.lspServers ? Object.keys(plugin.lspServers) : []

      return {
        source: plugin.source || plugin.name,
        name: plugin.name,
        commandNames,
        skillNames,
        agentNames,
        hookCommandCount,
        mcpServerNames,
        lspServerNames,
        score:
          commandNames.length +
          skillNames.length +
          agentNames.length +
          hookCommandCount +
          mcpServerNames.length +
          lspServerNames.length,
      }
    })
    .filter(candidate => candidate.score > 0)
    .sort((left, right) => right.score - left.score)

  return candidates[0] ?? null
}

function printSnapshot(label: string, snapshot: RefreshSnapshot): void {
  console.log(`[PASS] ${label}`)
  console.log(
    `  enabled=${snapshot.appEnabledCount} commands=${snapshot.appCommandCount} agents=${snapshot.appAgentCount} hooks=${snapshot.appHookCount} mcp=${snapshot.appMcpCount} lsp=${snapshot.appLspCount}`,
  )
  console.log(
    `  pluginReconnectKey=${snapshot.pluginReconnectKey} enabledPlugins=${formatListPreview(snapshot.enabledPluginSources)}`,
  )
  console.log(
    `  pluginCommands=${formatListPreview(snapshot.pluginCommandNames)}`,
  )
  console.log(`  pluginSkills=${formatListPreview(snapshot.pluginSkillNames)}`)
  console.log(`  pluginAgents=${formatListPreview(snapshot.pluginAgentNames)}`)
  console.log(
    `  pluginMcp=${formatListPreview(snapshot.pluginMcpServerNames)} pluginLsp=${formatListPreview(snapshot.pluginLspServerNames)}`,
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

  process.chdir(environment.workspaceDir)
  setOriginalCwd(environment.workspaceDir)
  setCwdState(environment.workspaceDir)
  const harness: RefreshHarness = {
    appState: getDefaultAppState(),
  }

  const { loadAllPluginsCacheOnly, clearPluginCache } = await import(
    '../src/utils/plugins/pluginLoader.js'
  )
  const { disablePluginOp, enablePluginOp } = await import(
    '../src/services/plugins/pluginOperations.js'
  )

  clearPluginCache('plugin-state-smoke:baseline')
  const baseline = await runRefresh(harness)
  const pluginResult = await loadAllPluginsCacheOnly()
  const candidate = buildCandidatePlugin(pluginResult.enabled, baseline)

  assert(
    candidate,
    'No enabled plugin with commands, skills, agents, MCP, or LSP capabilities was found in migrated config',
  )

  const disableResult = await disablePluginOp(candidate.source)
  assert(disableResult.success, `Disable plugin failed: ${disableResult.message}`)

  clearPluginCache('plugin-state-smoke:after-disable')
  const disabled = await runRefresh(harness)

  assert(
    !disabled.enabledPluginSources.includes(candidate.source),
    `Disabled snapshot still includes plugin ${candidate.source}`,
  )
  assert(
    disabled.appEnabledCount === baseline.appEnabledCount - 1,
    `Expected enabled count to drop by 1 after disabling ${candidate.source}, got ${baseline.appEnabledCount} -> ${disabled.appEnabledCount}`,
  )
  assert(
    disabled.appCommandCount === baseline.appCommandCount - candidate.commandNames.length,
    `Expected command count to drop by ${candidate.commandNames.length} after disabling ${candidate.source}, got ${baseline.appCommandCount} -> ${disabled.appCommandCount}`,
  )
  assert(
    disabled.appAgentCount === baseline.appAgentCount - candidate.agentNames.length,
    `Expected agent count to drop by ${candidate.agentNames.length} after disabling ${candidate.source}, got ${baseline.appAgentCount} -> ${disabled.appAgentCount}`,
  )
  assert(
    disabled.pluginReconnectKey === baseline.pluginReconnectKey + 1,
    `Expected pluginReconnectKey to increment after disable refresh, got ${baseline.pluginReconnectKey} -> ${disabled.pluginReconnectKey}`,
  )
  for (const commandName of candidate.commandNames) {
    assert(
      !disabled.pluginCommandNames.includes(commandName),
      `Disabled snapshot still includes plugin command ${commandName}`,
    )
  }
  for (const skillName of candidate.skillNames) {
    assert(
      !disabled.pluginSkillNames.includes(skillName),
      `Disabled snapshot still includes plugin skill ${skillName}`,
    )
  }
  for (const agentName of candidate.agentNames) {
    assert(
      !disabled.pluginAgentNames.includes(agentName),
      `Disabled snapshot still includes plugin agent ${agentName}`,
    )
  }
  if (candidate.hookCommandCount > 0) {
    assert(
      disabled.appHookCount === baseline.appHookCount - candidate.hookCommandCount,
      `Expected hook count to drop by ${candidate.hookCommandCount} after disabling ${candidate.source}, got ${baseline.appHookCount} -> ${disabled.appHookCount}`,
    )
  }
  if (candidate.mcpServerNames.length > 0) {
    assert(
      disabled.appMcpCount === baseline.appMcpCount - candidate.mcpServerNames.length,
      `Expected MCP count to drop by ${candidate.mcpServerNames.length} after disabling ${candidate.source}, got ${baseline.appMcpCount} -> ${disabled.appMcpCount}`,
    )
    for (const serverName of candidate.mcpServerNames) {
      assert(
        !disabled.pluginMcpServerNames.includes(serverName),
        `Disabled snapshot still includes plugin MCP server ${serverName}`,
      )
    }
  }
  if (candidate.lspServerNames.length > 0) {
    assert(
      disabled.appLspCount === baseline.appLspCount - candidate.lspServerNames.length,
      `Expected LSP count to drop by ${candidate.lspServerNames.length} after disabling ${candidate.source}, got ${baseline.appLspCount} -> ${disabled.appLspCount}`,
    )
    for (const serverName of candidate.lspServerNames) {
      assert(
        !disabled.pluginLspServerNames.includes(serverName),
        `Disabled snapshot still includes plugin LSP server ${serverName}`,
      )
    }
  }

  const enableResult = await enablePluginOp(candidate.source)
  assert(enableResult.success, `Enable plugin failed: ${enableResult.message}`)

  clearPluginCache('plugin-state-smoke:after-enable')
  const reenabled = await runRefresh(harness)

  assert(
    reenabled.enabledPluginSources.includes(candidate.source),
    `Re-enabled snapshot does not include plugin ${candidate.source}`,
  )
  assert(
    reenabled.appEnabledCount === baseline.appEnabledCount,
    `Expected enabled count to return to baseline after re-enabling ${candidate.source}, got ${reenabled.appEnabledCount} vs ${baseline.appEnabledCount}`,
  )
  assert(
    reenabled.appCommandCount === baseline.appCommandCount,
    `Expected command count to return to baseline after re-enabling ${candidate.source}, got ${reenabled.appCommandCount} vs ${baseline.appCommandCount}`,
  )
  assert(
    reenabled.appAgentCount === baseline.appAgentCount,
    `Expected agent count to return to baseline after re-enabling ${candidate.source}, got ${reenabled.appAgentCount} vs ${baseline.appAgentCount}`,
  )
  assert(
    reenabled.pluginReconnectKey === disabled.pluginReconnectKey + 1,
    `Expected pluginReconnectKey to increment after re-enable refresh, got ${disabled.pluginReconnectKey} -> ${reenabled.pluginReconnectKey}`,
  )
  for (const commandName of candidate.commandNames) {
    assert(
      reenabled.pluginCommandNames.includes(commandName),
      `Re-enabled snapshot missing plugin command ${commandName}`,
    )
  }
  for (const skillName of candidate.skillNames) {
    assert(
      reenabled.pluginSkillNames.includes(skillName),
      `Re-enabled snapshot missing plugin skill ${skillName}`,
    )
  }
  for (const agentName of candidate.agentNames) {
    assert(
      reenabled.pluginAgentNames.includes(agentName),
      `Re-enabled snapshot missing plugin agent ${agentName}`,
    )
  }
  if (candidate.hookCommandCount > 0) {
    assert(
      reenabled.appHookCount === baseline.appHookCount,
      `Expected hook count to return to baseline after re-enabling ${candidate.source}, got ${reenabled.appHookCount} vs ${baseline.appHookCount}`,
    )
  }
  if (candidate.mcpServerNames.length > 0) {
    assert(
      reenabled.appMcpCount === baseline.appMcpCount,
      `Expected MCP count to return to baseline after re-enabling ${candidate.source}, got ${reenabled.appMcpCount} vs ${baseline.appMcpCount}`,
    )
    for (const serverName of candidate.mcpServerNames) {
      assert(
        reenabled.pluginMcpServerNames.includes(serverName),
        `Re-enabled snapshot missing plugin MCP server ${serverName}`,
      )
    }
  }
  if (candidate.lspServerNames.length > 0) {
    assert(
      reenabled.appLspCount === baseline.appLspCount,
      `Expected LSP count to return to baseline after re-enabling ${candidate.source}, got ${reenabled.appLspCount} vs ${baseline.appLspCount}`,
    )
    for (const serverName of candidate.lspServerNames) {
      assert(
        reenabled.pluginLspServerNames.includes(serverName),
        `Re-enabled snapshot missing plugin LSP server ${serverName}`,
      )
    }
  }

  console.log(`Source dir: ${sourceDir}`)
  console.log(`Temp root: ${environment.tempRoot}`)
  console.log(`Workspace: ${environment.workspaceDir}`)
  console.log(`Config dir: ${environment.configDir}`)
  console.log(`Plugin cache dir: ${environment.pluginCacheDir}`)
  console.log(`Merged global config: ${migrationResult.mergedGlobalConfig}`)
  console.log(
    `Candidate plugin: ${candidate.source} | commands=${candidate.commandNames.length} skills=${candidate.skillNames.length} agents=${candidate.agentNames.length} hooks=${candidate.hookCommandCount} mcp=${candidate.mcpServerNames.length} lsp=${candidate.lspServerNames.length}`,
  )
  console.log('')
  printSnapshot('baseline', baseline)
  console.log('')
  printSnapshot('after-disable', disabled)
  console.log('')
  printSnapshot('after-reenable', reenabled)
  console.log('')
  console.log(
    `[PASS] toggled plugin ${candidate.source} and observed runtime capability changes`,
  )
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
