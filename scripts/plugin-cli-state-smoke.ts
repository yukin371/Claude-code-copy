#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
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
  | 'NEKO_CODE_DISABLED_MCP_SERVERS'

type SmokeEnvironment = {
  tempRoot: string
  workspaceDir: string
  configDir: string
  pluginCacheDir: string
  marketplaceDir: string
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

type RefreshedPluginState = {
  enabledPluginSources: string[]
  pluginCommandNames: string[]
  pluginReconnectKey: number
  enabledCount: number
  commandCount: number
}

const trackedEnvVars: EnvKey[] = [
  'NEKO_CODE_CONFIG_DIR',
  'CLAUDE_CODE_PLUGIN_CACHE_DIR',
  'CLAUDE_CODE_SIMPLE',
  'NEKO_CODE_DISABLED_MCP_SERVERS',
]

const repoRoot = process.cwd()
const cliEntrypoint = join(repoRoot, 'src/entrypoints/cli.tsx')
const marketplaceName = 'smoke-marketplace'
const pluginName = 'smoke-cli-plugin'
const pluginId = `${pluginName}@${marketplaceName}`
const commandName = `${pluginName}:smoke-cli`

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function normalizeOutput(text: string): string {
  return text.replace(/\r/g, '').trim()
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
  const tempRoot = await mkdtemp(join(tmpdir(), 'neko-plugin-cli-state-smoke-'))
  const workspaceDir = join(tempRoot, 'workspace')
  const configDir = join(tempRoot, 'config')
  const pluginCacheDir = join(tempRoot, 'plugin-cache')
  const marketplaceDir = join(tempRoot, 'local-marketplace')

  mkdirSync(workspaceDir, { recursive: true })
  mkdirSync(configDir, { recursive: true })
  mkdirSync(pluginCacheDir, { recursive: true })
  mkdirSync(marketplaceDir, { recursive: true })

  return {
    tempRoot,
    workspaceDir,
    configDir,
    pluginCacheDir,
    marketplaceDir,
  }
}

async function createLocalMarketplaceFixture(marketplaceDir: string): Promise<void> {
  const manifestDir = join(marketplaceDir, '.claude-plugin')
  const pluginDir = join(marketplaceDir, 'plugins', pluginName)
  const pluginManifestDir = join(pluginDir, '.claude-plugin')
  const commandsDir = join(pluginDir, 'commands')

  await mkdir(manifestDir, { recursive: true })
  await mkdir(pluginManifestDir, { recursive: true })
  await mkdir(commandsDir, { recursive: true })

  await writeFile(
    join(manifestDir, 'marketplace.json'),
    `${JSON.stringify(
      {
        name: marketplaceName,
        owner: {
          name: 'Smoke Harness',
        },
        plugins: [
          {
            name: pluginName,
            source: `./plugins/${pluginName}`,
            description: 'Local CLI smoke plugin',
          },
        ],
        metadata: {
          description: 'Local marketplace for isolated plugin CLI smoke',
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  await writeFile(
    join(pluginManifestDir, 'plugin.json'),
    `${JSON.stringify(
      {
        name: pluginName,
        version: '1.0.0',
        description: 'Plugin used by isolated CLI state smoke',
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  await writeFile(
    join(commandsDir, 'smoke-cli.md'),
    [
      '---',
      'description: Local CLI smoke command',
      '---',
      '',
      'Reply with a short confirmation that the local CLI smoke plugin command is loaded.',
      '',
    ].join('\n'),
    'utf8',
  )
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

function printCommandResult(label: string, result: CommandResult): void {
  console.log(`[${label}] exit=${result.exitCode}`)
  console.log(`  args=${result.args.join(' ')}`)
  console.log(`  stdout=${normalizeOutput(result.stdout) || '[empty]'}`)
  if (normalizeOutput(result.stderr)) {
    console.log(`  stderr=${normalizeOutput(result.stderr)}`)
  }
}

function parseJsonStdout<T>(label: string, result: CommandResult): T {
  try {
    return JSON.parse(result.stdout) as T
  } catch (error) {
    throw new Error(
      `${label} did not produce valid JSON stdout: ${normalizeOutput(result.stdout) || '[empty]'} (${error})`,
    )
  }
}

async function captureRefreshedPluginState(): Promise<RefreshedPluginState> {
  const [
    { clearAllCaches },
    { clearInstalledPluginsCache },
    { resetSettingsCache },
    { clearSessionCaches },
  ] = await Promise.all([
    import('../src/utils/plugins/cacheUtils.js'),
    import('../src/utils/plugins/installedPluginsManager.js'),
    import('../src/utils/settings/settingsCache.js'),
    import('../src/commands/clear/caches.js'),
  ])

  resetSettingsCache()
  clearSessionCaches()
  clearAllCaches()
  clearInstalledPluginsCache()

  let appState = getDefaultAppState()
  const result = await refreshActivePlugins(updater => {
    appState = updater(appState)
  })

  return {
    enabledPluginSources: appState.plugins.enabled
      .map(plugin => plugin.source)
      .sort((left, right) => left.localeCompare(right)),
    pluginCommandNames: result.pluginCommands
      .map(command => command.name)
      .sort((left, right) => left.localeCompare(right)),
    pluginReconnectKey: appState.mcp.pluginReconnectKey,
    enabledCount: result.enabled_count,
    commandCount: result.command_count,
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

const previousCwd = process.cwd()
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
  await createLocalMarketplaceFixture(environment.marketplaceDir)

  process.env.NEKO_CODE_CONFIG_DIR = environment.configDir
  process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR = environment.pluginCacheDir
  delete process.env.CLAUDE_CODE_SIMPLE
  if (options.disableMcpServers) {
    process.env.NEKO_CODE_DISABLED_MCP_SERVERS = options.disableMcpServers
  } else {
    delete process.env.NEKO_CODE_DISABLED_MCP_SERVERS
  }

  process.chdir(environment.workspaceDir)
  setOriginalCwd(environment.workspaceDir)
  setCwdState(environment.workspaceDir)

  const childEnv = { ...process.env }

  const addMarketplace = await runCommand(
    [
      cliEntrypoint,
      'plugin',
      'marketplace',
      'add',
      environment.marketplaceDir,
      '--scope',
      'user',
    ],
    childEnv,
    environment.workspaceDir,
  )
  printCommandResult('marketplace-add', addMarketplace)
  assert(addMarketplace.exitCode === 0, 'Marketplace add command failed')

  const marketplaceListAfterAdd = await runCommand(
    [cliEntrypoint, 'plugin', 'marketplace', 'list', '--json'],
    childEnv,
    environment.workspaceDir,
  )
  printCommandResult('marketplace-list-after-add', marketplaceListAfterAdd)
  assert(marketplaceListAfterAdd.exitCode === 0, 'Marketplace list command failed after add')
  const marketplacesAfterAdd = parseJsonStdout<
    Array<{ name: string; source?: string; path?: string }>
  >('marketplace-list-after-add', marketplaceListAfterAdd)
  assert(
    marketplacesAfterAdd.some(entry => entry.name === marketplaceName),
    `Expected marketplace list to include ${marketplaceName} after add`,
  )

  const installPlugin = await runCommand(
    [cliEntrypoint, 'plugin', 'install', pluginId, '--scope', 'user'],
    childEnv,
    environment.workspaceDir,
  )
  printCommandResult('plugin-install', installPlugin)
  assert(installPlugin.exitCode === 0, 'Plugin install command failed')

  const pluginListAfterInstall = await runCommand(
    [cliEntrypoint, 'plugin', 'list', '--json'],
    childEnv,
    environment.workspaceDir,
  )
  printCommandResult('plugin-list-after-install', pluginListAfterInstall)
  assert(pluginListAfterInstall.exitCode === 0, 'Plugin list command failed after install')
  const pluginsAfterInstall = parseJsonStdout<
    Array<{ id: string; enabled: boolean; scope: string }>
  >('plugin-list-after-install', pluginListAfterInstall)
  const installedPlugin = pluginsAfterInstall.find(entry => entry.id === pluginId)
  assert(installedPlugin, `Expected plugin list to include ${pluginId} after install`)
  assert(installedPlugin.enabled, `Expected ${pluginId} to be enabled after install`)
  assert(installedPlugin.scope === 'user', `Expected ${pluginId} scope user after install, got ${installedPlugin.scope}`)

  const refreshedAfterInstall = await captureRefreshedPluginState()
  assert(
    refreshedAfterInstall.enabledPluginSources.includes(pluginId),
    `Expected refresh result to include enabled plugin ${pluginId} after install`,
  )
  assert(
    refreshedAfterInstall.pluginCommandNames.includes(commandName),
    `Expected refresh result to include ${commandName} after install`,
  )
  assert(
    refreshedAfterInstall.pluginReconnectKey === 1,
    `Expected pluginReconnectKey to be 1 after install refresh, got ${refreshedAfterInstall.pluginReconnectKey}`,
  )

  const disablePlugin = await runCommand(
    [cliEntrypoint, 'plugin', 'disable', pluginId, '--scope', 'user'],
    childEnv,
    environment.workspaceDir,
  )
  printCommandResult('plugin-disable', disablePlugin)
  assert(disablePlugin.exitCode === 0, 'Plugin disable command failed')

  const pluginListAfterDisable = await runCommand(
    [cliEntrypoint, 'plugin', 'list', '--json'],
    childEnv,
    environment.workspaceDir,
  )
  printCommandResult('plugin-list-after-disable', pluginListAfterDisable)
  assert(pluginListAfterDisable.exitCode === 0, 'Plugin list command failed after disable')
  const pluginsAfterDisable = parseJsonStdout<
    Array<{ id: string; enabled: boolean }>
  >('plugin-list-after-disable', pluginListAfterDisable)
  const disabledPlugin = pluginsAfterDisable.find(entry => entry.id === pluginId)
  assert(disabledPlugin, `Expected plugin list to include ${pluginId} after disable`)
  assert(!disabledPlugin.enabled, `Expected ${pluginId} to be disabled after disable`)

  const refreshedAfterDisable = await captureRefreshedPluginState()
  assert(
    !refreshedAfterDisable.enabledPluginSources.includes(pluginId),
    `Expected refresh result to exclude ${pluginId} after disable`,
  )
  assert(
    !refreshedAfterDisable.pluginCommandNames.includes(commandName),
    `Expected refresh result to drop ${commandName} after disable`,
  )
  assert(
    refreshedAfterDisable.pluginReconnectKey === 1,
    `Expected pluginReconnectKey to be 1 after disable refresh, got ${refreshedAfterDisable.pluginReconnectKey}`,
  )

  const enablePlugin = await runCommand(
    [cliEntrypoint, 'plugin', 'enable', pluginId, '--scope', 'user'],
    childEnv,
    environment.workspaceDir,
  )
  printCommandResult('plugin-enable', enablePlugin)
  assert(enablePlugin.exitCode === 0, 'Plugin enable command failed')

  const pluginListAfterEnable = await runCommand(
    [cliEntrypoint, 'plugin', 'list', '--json'],
    childEnv,
    environment.workspaceDir,
  )
  printCommandResult('plugin-list-after-enable', pluginListAfterEnable)
  assert(pluginListAfterEnable.exitCode === 0, 'Plugin list command failed after enable')
  const pluginsAfterEnable = parseJsonStdout<
    Array<{ id: string; enabled: boolean }>
  >('plugin-list-after-enable', pluginListAfterEnable)
  const enabledPlugin = pluginsAfterEnable.find(entry => entry.id === pluginId)
  assert(enabledPlugin, `Expected plugin list to include ${pluginId} after enable`)
  assert(enabledPlugin.enabled, `Expected ${pluginId} to be enabled after enable`)

  const refreshedAfterEnable = await captureRefreshedPluginState()
  assert(
    refreshedAfterEnable.enabledPluginSources.includes(pluginId),
    `Expected refresh result to include ${pluginId} after enable`,
  )
  assert(
    refreshedAfterEnable.pluginCommandNames.includes(commandName),
    `Expected refresh result to restore ${commandName} after enable`,
  )
  assert(
    refreshedAfterEnable.pluginReconnectKey === 1,
    `Expected pluginReconnectKey to be 1 after enable refresh, got ${refreshedAfterEnable.pluginReconnectKey}`,
  )

  const uninstallPlugin = await runCommand(
    [cliEntrypoint, 'plugin', 'uninstall', pluginId, '--scope', 'user'],
    childEnv,
    environment.workspaceDir,
  )
  printCommandResult('plugin-uninstall', uninstallPlugin)
  assert(uninstallPlugin.exitCode === 0, 'Plugin uninstall command failed')

  const pluginListAfterUninstall = await runCommand(
    [cliEntrypoint, 'plugin', 'list', '--json'],
    childEnv,
    environment.workspaceDir,
  )
  printCommandResult('plugin-list-after-uninstall', pluginListAfterUninstall)
  assert(pluginListAfterUninstall.exitCode === 0, 'Plugin list command failed after uninstall')
  const pluginsAfterUninstall = parseJsonStdout<Array<{ id: string }>>(
    'plugin-list-after-uninstall',
    pluginListAfterUninstall,
  )
  assert(
    !pluginsAfterUninstall.some(entry => entry.id === pluginId),
    `Expected ${pluginId} to be absent after uninstall`,
  )

  const refreshedAfterUninstall = await captureRefreshedPluginState()
  assert(
    !refreshedAfterUninstall.enabledPluginSources.includes(pluginId),
    `Expected refresh result to exclude ${pluginId} after uninstall`,
  )
  assert(
    !refreshedAfterUninstall.pluginCommandNames.includes(commandName),
    `Expected refresh result to exclude ${commandName} after uninstall`,
  )

  const removeMarketplace = await runCommand(
    [cliEntrypoint, 'plugin', 'marketplace', 'remove', marketplaceName],
    childEnv,
    environment.workspaceDir,
  )
  printCommandResult('marketplace-remove', removeMarketplace)
  assert(removeMarketplace.exitCode === 0, 'Marketplace remove command failed')

  const marketplaceListAfterRemove = await runCommand(
    [cliEntrypoint, 'plugin', 'marketplace', 'list', '--json'],
    childEnv,
    environment.workspaceDir,
  )
  printCommandResult('marketplace-list-after-remove', marketplaceListAfterRemove)
  assert(marketplaceListAfterRemove.exitCode === 0, 'Marketplace list command failed after remove')
  const marketplacesAfterRemove = parseJsonStdout<Array<{ name: string }>>(
    'marketplace-list-after-remove',
    marketplaceListAfterRemove,
  )
  assert(
    !marketplacesAfterRemove.some(entry => entry.name === marketplaceName),
    `Expected marketplace list to exclude ${marketplaceName} after remove`,
  )

  console.log('')
  console.log('[PASS] plugin-cli-state-smoke')
  console.log(`  tempRoot=${environment.tempRoot}`)
  console.log(`  workspace=${environment.workspaceDir}`)
  console.log(`  marketplaceDir=${environment.marketplaceDir}`)
  console.log(`  pluginId=${pluginId}`)
  console.log(`  commandName=${commandName}`)
  console.log(
    `  refreshCounts install/disable/enable/uninstall=${refreshedAfterInstall.commandCount}/${refreshedAfterDisable.commandCount}/${refreshedAfterEnable.commandCount}/${refreshedAfterUninstall.commandCount}`,
  )
  console.log(`  disabledMcpServers=${options.disableMcpServers ?? '(none)'}`)
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

  if (!options.keepTemp) {
    await rm(environment.tempRoot, { recursive: true, force: true })
  }
}
