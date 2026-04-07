#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setCwdState, setOriginalCwd } from '../src/bootstrap/state.js'
import { fileSuffixForOauthConfig } from '../src/constants/oauth.js'
import { GLOBAL_CONFIG_BASENAME } from '../src/constants/product.js'
import { migrateClaudeConfigDirectory } from '../src/migrations/migrateClaudeConfigToNekoHome.js'
import { getDefaultAppState } from '../src/state/AppStateStore.js'
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
  mcpServerNames: string[]
  lspServerNames: string[]
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

async function runRefresh(workspaceDir: string): Promise<RefreshSnapshot> {
  let appState = getDefaultAppState()
  const result = await refreshActivePlugins(updater => {
    appState = updater(appState)
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
    pluginReconnectKey: appState.mcp.pluginReconnectKey,
  }
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
      const mcpServerNames = plugin.mcpServers ? Object.keys(plugin.mcpServers) : []
      const lspServerNames = plugin.lspServers ? Object.keys(plugin.lspServers) : []

      return {
        source: plugin.source || plugin.name,
        name: plugin.name,
        commandNames,
        skillNames,
        agentNames,
        mcpServerNames,
        lspServerNames,
        score:
          commandNames.length +
          skillNames.length +
          agentNames.length +
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

  const { loadAllPluginsCacheOnly, clearPluginCache } = await import(
    '../src/utils/plugins/pluginLoader.js'
  )
  const { disablePluginOp, enablePluginOp } = await import(
    '../src/services/plugins/pluginOperations.js'
  )

  clearPluginCache('plugin-state-smoke:baseline')
  const baseline = await runRefresh(environment.workspaceDir)
  const pluginResult = await loadAllPluginsCacheOnly()
  const candidate = buildCandidatePlugin(pluginResult.enabled, baseline)

  assert(
    candidate,
    'No enabled plugin with commands, skills, agents, MCP, or LSP capabilities was found in migrated config',
  )

  const disableResult = await disablePluginOp(candidate.source)
  assert(disableResult.success, `Disable plugin failed: ${disableResult.message}`)

  clearPluginCache('plugin-state-smoke:after-disable')
  const disabled = await runRefresh(environment.workspaceDir)

  assert(
    !disabled.enabledPluginSources.includes(candidate.source),
    `Disabled snapshot still includes plugin ${candidate.source}`,
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

  const enableResult = await enablePluginOp(candidate.source)
  assert(enableResult.success, `Enable plugin failed: ${enableResult.message}`)

  clearPluginCache('plugin-state-smoke:after-enable')
  const reenabled = await runRefresh(environment.workspaceDir)

  assert(
    reenabled.enabledPluginSources.includes(candidate.source),
    `Re-enabled snapshot does not include plugin ${candidate.source}`,
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

  console.log(`Source dir: ${sourceDir}`)
  console.log(`Temp root: ${environment.tempRoot}`)
  console.log(`Workspace: ${environment.workspaceDir}`)
  console.log(`Config dir: ${environment.configDir}`)
  console.log(`Plugin cache dir: ${environment.pluginCacheDir}`)
  console.log(`Merged global config: ${migrationResult.mergedGlobalConfig}`)
  console.log(
    `Candidate plugin: ${candidate.source} | commands=${candidate.commandNames.length} skills=${candidate.skillNames.length} agents=${candidate.agentNames.length} mcp=${candidate.mcpServerNames.length} lsp=${candidate.lspServerNames.length}`,
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
