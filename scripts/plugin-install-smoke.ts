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

type RefreshSnapshot = {
  enabledPluginSources: string[]
  pluginCommandNames: string[]
  pluginAgentNames: string[]
  appEnabledCount: number
  appCommandCount: number
  appAgentCount: number
}

const CANDIDATE_PLUGIN_IDS = [
  'code-simplifier@claude-plugins-official',
  'claude-md-management@claude-plugins-official',
  'frontend-design@claude-plugins-official',
  'claude-hud@claude-hud',
] as const

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
  const tempRoot = await mkdtemp(join(tmpdir(), 'neko-plugin-install-smoke-'))
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

async function captureRefreshSnapshot(): Promise<RefreshSnapshot> {
  const [
    { getPluginCommands },
    { loadPluginAgents },
  ] = await Promise.all([
    import('../src/utils/plugins/loadPluginCommands.js'),
    import('../src/utils/plugins/loadPluginAgents.js'),
  ])

  let appState = getDefaultAppState()
  const result = await refreshActivePlugins(updater => {
    appState = updater(appState)
  })
  const [pluginCommands, pluginAgents] = await Promise.all([
    getPluginCommands(),
    loadPluginAgents(),
  ])

  return {
    enabledPluginSources: appState.plugins.enabled
      .map(plugin => plugin.source)
      .sort((left, right) => left.localeCompare(right)),
    pluginCommandNames: pluginCommands
      .map(command => command.name)
      .sort((left, right) => left.localeCompare(right)),
    pluginAgentNames: pluginAgents
      .map(agent => agent.agentType)
      .sort((left, right) => left.localeCompare(right)),
    appEnabledCount: result.enabled_count,
    appCommandCount: result.command_count,
    appAgentCount: result.agent_count,
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

  const { installPluginOp, uninstallPluginOp } = await import(
    '../src/services/plugins/pluginOperations.js'
  )
  const { clearPluginCache } = await import('../src/utils/plugins/pluginLoader.js')

  clearPluginCache('plugin-install-smoke:baseline')
  const baseline = await captureRefreshSnapshot()

  const candidatePluginId = CANDIDATE_PLUGIN_IDS.find(
    pluginId => !baseline.enabledPluginSources.includes(pluginId),
  )
  assert(
    candidatePluginId,
    'No install candidate plugin available outside the current enabled plugin set',
  )

  const installResult = await installPluginOp(candidatePluginId, 'user')
  assert(installResult.success, `Install plugin failed: ${installResult.message}`)

  clearPluginCache('plugin-install-smoke:after-install')
  const afterInstall = await captureRefreshSnapshot()
  assert(
    afterInstall.enabledPluginSources.includes(candidatePluginId),
    `Installed snapshot missing plugin ${candidatePluginId}`,
  )

  const uninstallResult = await uninstallPluginOp(candidatePluginId, 'user', false)
  assert(
    uninstallResult.success,
    `Uninstall plugin failed: ${uninstallResult.message}`,
  )

  clearPluginCache('plugin-install-smoke:after-uninstall')
  const afterUninstall = await captureRefreshSnapshot()
  assert(
    !afterUninstall.enabledPluginSources.includes(candidatePluginId),
    `Uninstall snapshot still includes plugin ${candidatePluginId}`,
  )
  assert(
    JSON.stringify(afterUninstall.enabledPluginSources) ===
      JSON.stringify(baseline.enabledPluginSources),
    'Expected enabled plugin set after uninstall to match baseline',
  )

  console.log(`Source dir: ${sourceDir}`)
  console.log(`Temp root: ${environment.tempRoot}`)
  console.log(`Workspace: ${environment.workspaceDir}`)
  console.log(`Config dir: ${environment.configDir}`)
  console.log(`Plugin cache dir: ${environment.pluginCacheDir}`)
  console.log(`Merged global config: ${migrationResult.mergedGlobalConfig}`)
  console.log(`Candidate plugin: ${candidatePluginId}`)
  console.log(
    `Baseline enabled plugins: ${baseline.appEnabledCount} (${formatListPreview(baseline.enabledPluginSources)})`,
  )
  console.log(
    `After install enabled plugins: ${afterInstall.appEnabledCount} (${formatListPreview(afterInstall.enabledPluginSources)})`,
  )
  console.log(
    `After uninstall enabled plugins: ${afterUninstall.appEnabledCount} (${formatListPreview(afterUninstall.enabledPluginSources)})`,
  )
  console.log(
    `Command counts baseline/install/uninstall: ${baseline.appCommandCount}/${afterInstall.appCommandCount}/${afterUninstall.appCommandCount}`,
  )
  console.log(
    `Agent counts baseline/install/uninstall: ${baseline.appAgentCount}/${afterInstall.appAgentCount}/${afterUninstall.appAgentCount}`,
  )
  console.log('[PASS] plugin install/uninstall roundtrip succeeded')
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
