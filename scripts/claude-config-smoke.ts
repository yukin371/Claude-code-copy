#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileSuffixForOauthConfig } from '../src/constants/oauth.js'
import { GLOBAL_CONFIG_BASENAME } from '../src/constants/product.js'
import { migrateClaudeConfigDirectory } from '../src/migrations/migrateClaudeConfigToNekoHome.js'

type EnvKey =
  | 'NEKO_CODE_CONFIG_DIR'
  | 'CLAUDE_CODE_PLUGIN_CACHE_DIR'
  | 'CLAUDE_CODE_SIMPLE'
  | 'NEKO_CODE_DISABLED_MCP_SERVERS'

type SmokeCase = {
  name: string
  expectedExitCodes: number[]
  commandLabel: string
  entrypoint: 'cli' | 'bun-tools'
  args: string[]
  notes: string
  env?: Record<string, string | undefined>
  expectedOutputContains?: string[]
}

type SmokeResult = {
  name: string
  passed: boolean
  exitCode: number
  durationMs: number
  preview: string[]
  commandPreview: string
  notes: string
  failureReason?: string
}

type SmokeEnvironment = {
  tempRoot: string
  workspaceDir: string
  configDir: string
  pluginCacheDir: string
}

type CapabilitySnapshot = {
  userAgentNames: string[]
  userSkillNames: string[]
  userCommandPaths: string[]
  enabledPluginSources: string[]
  pluginCommandNames: string[]
  pluginSkillNames: string[]
  pluginAgentNames: string[]
  pluginMcpServerNames: string[]
}

type SmokeOptions = {
  keepTemp: boolean
  listOnly: boolean
  maxPreviewLines: number
  sourceDir: string
  disableMcpServers?: string
  allowMissingSource: boolean
}

const repoRoot = process.cwd()
const cliEntrypoint = join(repoRoot, 'src/entrypoints/cli.tsx')
const bunToolsEntrypoint = join(repoRoot, 'scripts/bun-tools.ts')

function parseArgs(argv: string[]): SmokeOptions {
  let keepTemp = false
  let listOnly = false
  let maxPreviewLines = 4
  let sourceDir = join(homedir(), '.claude')
  let disableMcpServers: string | undefined
  let allowMissingSource = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--keep-temp') {
      keepTemp = true
      continue
    }

    if (arg === '--list-only') {
      listOnly = true
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

    if (arg === '--max-preview-lines') {
      const value = Number(argv[index + 1])
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error('--max-preview-lines requires a positive integer')
      }
      maxPreviewLines = value
      index += 1
      continue
    }

    if (arg === '--disable-mcp-servers') {
      const value = argv[index + 1]?.trim()
      if (!value) {
        throw new Error('--disable-mcp-servers requires a comma-separated value')
      }
      disableMcpServers = value
      index += 1
      continue
    }

    if (arg === '--disable-serena') {
      disableMcpServers = 'serena'
      continue
    }

    if (arg === '--allow-missing-source') {
      allowMissingSource = true
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  return {
    keepTemp,
    listOnly,
    maxPreviewLines,
    sourceDir,
    disableMcpServers,
    allowMissingSource,
  }
}

function getSmokeCases(): SmokeCase[] {
  return [
    {
      name: 'version',
      expectedExitCodes: [0],
      commandLabel: 'cli --version',
      entrypoint: 'cli',
      args: ['--version'],
      notes: 'Validate CLI startup against migrated config',
    },
    {
      name: 'help',
      expectedExitCodes: [0],
      commandLabel: 'cli --help',
      entrypoint: 'cli',
      args: ['--help'],
      notes: 'Validate top-level command registration',
    },
    {
      name: 'auth-status',
      expectedExitCodes: [0, 1],
      commandLabel: 'cli auth status',
      entrypoint: 'cli',
      args: ['auth', 'status'],
      notes:
        'Validate migrated credentials/config can be read; exit 1 can mean logged-out state',
    },
    {
      name: 'agents',
      expectedExitCodes: [0],
      commandLabel: 'cli agents',
      entrypoint: 'cli',
      args: ['agents'],
      notes: 'Validate agent inventory loading from migrated config home',
    },
    {
      name: 'plugin-list',
      expectedExitCodes: [0],
      commandLabel: 'cli plugin list',
      entrypoint: 'cli',
      args: ['plugin', 'list'],
      notes: 'Validate plugin inventory path with isolated plugin cache',
    },
    {
      name: 'mcp-list',
      expectedExitCodes: [0],
      commandLabel: 'cli mcp list',
      entrypoint: 'cli',
      args: ['mcp', 'list'],
      notes: 'Validate MCP config loading from migrated config home',
    },
    {
      name: 'doctor-help',
      expectedExitCodes: [0],
      commandLabel: 'cli doctor --help',
      entrypoint: 'cli',
      args: ['doctor', '--help'],
      notes:
        'Validate doctor command registration without entering interactive health checks',
    },
    {
      name: 'routes',
      expectedExitCodes: [0],
      commandLabel: 'bun-tools routes',
      entrypoint: 'bun-tools',
      args: ['routes'],
      notes: 'Dump effective task-routing snapshot',
    },
    {
      name: 'providers',
      expectedExitCodes: [0],
      commandLabel: 'bun-tools providers',
      entrypoint: 'bun-tools',
      args: ['providers'],
      notes: 'Dump provider metadata and routing weights',
    },
    {
      name: 'route-compact-direct-provider',
      expectedExitCodes: [0],
      commandLabel:
        'NEKO_CODE_OPENAI_COMPATIBLE_API_KEY=shared-openai-key bun-tools route compact',
      entrypoint: 'bun-tools',
      args: ['route', 'compact'],
      notes:
        'Assert that a shared compatible API key alone keeps the default main route in direct-provider mode after config migration',
      env: {
        NEKO_CODE_OPENAI_COMPATIBLE_API_KEY: 'shared-openai-key',
        ANTHROPIC_BASE_URL: undefined,
      },
      expectedOutputContains: [
        '"provider": "glm"',
        '"transportMode": "direct-provider"',
        '"baseUrl": null',
        '"apiKey": null',
      ],
    },
    {
      name: 'route-session-search-direct-provider',
      expectedExitCodes: [0],
      commandLabel:
        'NEKO_CODE_OPENAI_COMPATIBLE_API_KEY=shared-openai-key bun-tools route session_search',
      entrypoint: 'bun-tools',
      args: ['route', 'session_search'],
      notes:
        'Assert that helper sideQuery session_search stays on the main direct-provider route after config migration',
      env: {
        NEKO_CODE_OPENAI_COMPATIBLE_API_KEY: 'shared-openai-key',
        ANTHROPIC_BASE_URL: undefined,
      },
      expectedOutputContains: [
        '"querySource": "session_search"',
        '"provider": "glm"',
        '"transportMode": "direct-provider"',
        '"baseUrl": null',
      ],
    },
    {
      name: 'route-compact-gateway',
      expectedExitCodes: [0],
      commandLabel:
        'ANTHROPIC_BASE_URL=https://gateway.example.com/v1/messages bun-tools route compact',
      entrypoint: 'bun-tools',
      args: ['route', 'compact'],
      notes:
        'Assert that a global Anthropic gateway pins the default main route to a single-upstream transport after config migration',
      env: {
        ANTHROPIC_BASE_URL: 'https://gateway.example.com/v1/messages',
        NEKO_CODE_OPENAI_COMPATIBLE_API_KEY: undefined,
      },
      expectedOutputContains: [
        '"provider": "anthropic"',
        '"apiStyle": "anthropic"',
        '"transportMode": "single-upstream"',
        '"baseUrl": "https://gateway.example.com/v1/messages"',
      ],
    },
    {
      name: 'route-permission-explainer-gateway',
      expectedExitCodes: [0],
      commandLabel:
        'ANTHROPIC_BASE_URL=https://gateway.example.com/v1/messages bun-tools route permission_explainer',
      entrypoint: 'bun-tools',
      args: ['route', 'permission_explainer'],
      notes:
        'Assert that helper sideQuery permission_explainer inherits the main single-upstream gateway route after config migration',
      env: {
        ANTHROPIC_BASE_URL: 'https://gateway.example.com/v1/messages',
        NEKO_CODE_OPENAI_COMPATIBLE_API_KEY: undefined,
      },
      expectedOutputContains: [
        '"querySource": "permission_explainer"',
        '"provider": "anthropic"',
        '"transportMode": "single-upstream"',
        '"baseUrl": "https://gateway.example.com/v1/messages"',
      ],
    },
    {
      name: 'route-mcp-datetime-parse-gateway',
      expectedExitCodes: [0],
      commandLabel:
        'ANTHROPIC_BASE_URL=https://gateway.example.com/v1/messages bun-tools route mcp_datetime_parse',
      entrypoint: 'bun-tools',
      args: ['route', 'mcp_datetime_parse'],
      notes:
        'Assert that queryHaiku-based helper mcp_datetime_parse inherits the main single-upstream gateway route after config migration',
      env: {
        ANTHROPIC_BASE_URL: 'https://gateway.example.com/v1/messages',
        NEKO_CODE_OPENAI_COMPATIBLE_API_KEY: undefined,
      },
      expectedOutputContains: [
        '"querySource": "mcp_datetime_parse"',
        '"provider": "anthropic"',
        '"transportMode": "single-upstream"',
        '"baseUrl": "https://gateway.example.com/v1/messages"',
      ],
    },
  ]
}

function truncate(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) {
    return text
  }

  const headLength = Math.max(maxWidth - 24, 16)
  return `${text.slice(0, headLength)} ... [${text.length - headLength} more chars]`
}

function formatPreview(output: string, maxLines: number): string[] {
  const normalized = output.replace(/\r/g, '').trim()
  if (!normalized) {
    return ['[no output]']
  }

  return normalized
    .split('\n')
    .slice(0, maxLines)
    .map(line => truncate(line, 140))
}

function formatCommand(command: string[]): string {
  return command
    .map(part => (part.includes(' ') ? `"${part}"` : part))
    .join(' ')
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

async function listFilesRecursive(rootDir: string): Promise<string[]> {
  if (!existsSync(rootDir)) {
    return []
  }

  const entries = await readdir(rootDir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const absolutePath = join(rootDir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(absolutePath)))
      continue
    }

    if (entry.isFile()) {
      files.push(absolutePath)
    }
  }

  return files
}

async function createEnvironment(): Promise<SmokeEnvironment> {
  const tempRoot = await mkdtemp(join(tmpdir(), 'neko-claude-config-smoke-'))
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

async function inspectMigratedCapabilities(
  environment: SmokeEnvironment,
): Promise<CapabilitySnapshot> {
  const envBackup = new Map<EnvKey, string | undefined>()
  for (const key of trackedEnvVars) {
    envBackup.set(key, process.env[key])
  }

  process.env.NEKO_CODE_CONFIG_DIR = environment.configDir
  process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR = environment.pluginCacheDir
  delete process.env.CLAUDE_CODE_SIMPLE

  try {
    const [
      { getAgentDefinitionsWithOverrides },
      { getSkillDirCommands },
      { loadMarkdownFilesForSubdir },
      { loadAllPluginsCacheOnly },
      { getPluginCommands, getPluginSkills },
      { loadPluginAgents },
    ] = await Promise.all([
      import('../src/tools/AgentTool/loadAgentsDir.js'),
      import('../src/skills/loadSkillsDir.js'),
      import('../src/utils/markdownConfigLoader.js'),
      import('../src/utils/plugins/pluginLoader.js'),
      import('../src/utils/plugins/loadPluginCommands.js'),
      import('../src/utils/plugins/loadPluginAgents.js'),
    ])

    const [agentsResult, skills, commands, plugins, pluginCommands, pluginSkills, pluginAgents] = await Promise.all([
      getAgentDefinitionsWithOverrides(environment.workspaceDir),
      getSkillDirCommands(environment.workspaceDir),
      loadMarkdownFilesForSubdir('commands', environment.workspaceDir),
      loadAllPluginsCacheOnly(),
      getPluginCommands(),
      getPluginSkills(),
      loadPluginAgents(),
    ])

    const pluginMcpServerNames = new Set<string>()
    for (const plugin of plugins.enabled) {
      if (!plugin.mcpServers) {
        continue
      }
      for (const serverName of Object.keys(plugin.mcpServers)) {
        pluginMcpServerNames.add(serverName)
      }
    }

    return {
      userAgentNames: agentsResult.allAgents
        .filter(agent => agent.source === 'userSettings')
        .map(agent => agent.agentType)
        .sort((left, right) => left.localeCompare(right)),
      userSkillNames: skills
        .filter(skill => skill.source === 'userSettings')
        .map(skill => skill.name)
        .sort((left, right) => left.localeCompare(right)),
      userCommandPaths: commands
        .filter(file => file.source === 'userSettings')
        .map(file => relative(environment.configDir, file.filePath))
        .sort((left, right) => left.localeCompare(right)),
      enabledPluginSources: plugins.enabled
        .map(plugin => plugin.source || plugin.name)
        .sort((left, right) => left.localeCompare(right)),
      pluginCommandNames: pluginCommands
        .map(command => command.name)
        .sort((left, right) => left.localeCompare(right)),
      pluginSkillNames: pluginSkills
        .map(command => command.name)
        .sort((left, right) => left.localeCompare(right)),
      pluginAgentNames: pluginAgents
        .map(agent => agent.agentType)
        .sort((left, right) => left.localeCompare(right)),
      pluginMcpServerNames: [...pluginMcpServerNames].sort((left, right) =>
        left.localeCompare(right),
      ),
    }
  } finally {
    for (const key of trackedEnvVars) {
      const value = envBackup.get(key)
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

async function runSmokeCase(
  smokeCase: SmokeCase,
  environment: SmokeEnvironment,
  maxPreviewLines: number,
  disableMcpServers?: string,
): Promise<SmokeResult> {
  const bunPath = Bun.which('bun') ?? process.execPath
  const entrypoint =
    smokeCase.entrypoint === 'cli' ? cliEntrypoint : bunToolsEntrypoint
  const command = [bunPath, entrypoint, ...smokeCase.args]
  const env = {
    ...process.env,
    NEKO_CODE_CONFIG_DIR: environment.configDir,
    CLAUDE_CODE_PLUGIN_CACHE_DIR: environment.pluginCacheDir,
    ...(disableMcpServers
      ? { NEKO_CODE_DISABLED_MCP_SERVERS: disableMcpServers }
      : {}),
  } as Record<string, string | undefined>

  for (const [key, value] of Object.entries(smokeCase.env ?? {})) {
    if (value === undefined) {
      delete env[key]
      continue
    }
    env[key] = value
  }

  const startedAt = Date.now()
  const proc = Bun.spawn(command, {
    cwd: environment.workspaceDir,
    stdout: 'pipe',
    stderr: 'pipe',
    env,
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  const combinedOutput = [stdout.trim(), stderr.trim()]
    .filter(Boolean)
    .join('\n')
  let failureReason: string | undefined
  let passed = smokeCase.expectedExitCodes.includes(exitCode)

  if (passed) {
    for (const expectedSnippet of smokeCase.expectedOutputContains ?? []) {
      if (!combinedOutput.includes(expectedSnippet)) {
        passed = false
        failureReason = `missing output snippet: ${expectedSnippet}`
        break
      }
    }
  }

  return {
    name: smokeCase.name,
    passed,
    exitCode,
    durationMs: Date.now() - startedAt,
    preview: formatPreview(combinedOutput, maxPreviewLines),
    commandPreview: formatCommand(command),
    notes: smokeCase.notes,
    failureReason,
  }
}

function printResult(result: SmokeResult, smokeCase: SmokeCase): void {
  const status = result.passed ? 'PASS' : 'FAIL'
  console.log(
    `[${status}] ${result.name} exit=${result.exitCode} expected=${smokeCase.expectedExitCodes.join(',')} durationMs=${result.durationMs}`,
  )
  console.log(`  label: ${smokeCase.commandLabel}`)
  console.log(`  notes: ${result.notes}`)
  if (result.failureReason) {
    console.log(`  failure: ${result.failureReason}`)
  }
  console.log(`  command: ${result.commandPreview}`)
  for (const line of result.preview) {
    console.log(`  preview: ${line}`)
  }
  console.log('')
}

function printUsage(): void {
  console.log('Usage: bun run scripts/claude-config-smoke.ts [options]')
  console.log('')
  console.log('Options:')
  console.log(
    '  --source-dir <path>        Override the legacy Claude config source dir',
  )
  console.log(
    '  --max-preview-lines <n>    Limit preview lines per command (default: 4)',
  )
  console.log(
    '  --disable-mcp-servers <v>  Temporarily disable MCP servers by name (comma-separated)',
  )
  console.log(
    '  --disable-serena           Shortcut for --disable-mcp-servers serena',
  )
  console.log(
    '  --list-only                Print the smoke command matrix without executing it',
  )
  console.log(
    '  --keep-temp                Keep the temp workspace/config dirs after the run',
  )
}

async function removeTempDirectoryWithRetry(tempRoot: string): Promise<void> {
  const delaysMs = [0, 250, 1000, 2500]

  let lastError: unknown
  for (const delayMs of delaysMs) {
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }

    try {
      await rm(tempRoot, { recursive: true, force: true })
      return
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

const trackedEnvVars: EnvKey[] = [
  'NEKO_CODE_CONFIG_DIR',
  'CLAUDE_CODE_PLUGIN_CACHE_DIR',
  'CLAUDE_CODE_SIMPLE',
]

const options = (() => {
  try {
    if (process.argv.includes('--help')) {
      printUsage()
      process.exit(0)
    }
    return parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    printUsage()
    process.exit(1)
  }
})()

const sourceDir = resolve(options.sourceDir)
if (!existsSync(sourceDir)) {
  if (options.allowMissingSource) {
    console.log(`[SKIP] Claude config source dir not found: ${sourceDir}`)
    process.exit(0)
  }
  console.error(`Claude config source dir not found: ${sourceDir}`)
  process.exit(1)
}

const smokeCases = getSmokeCases()
if (options.listOnly) {
  for (const smokeCase of smokeCases) {
    const entrypoint =
      smokeCase.entrypoint === 'cli' ? cliEntrypoint : bunToolsEntrypoint
    console.log(
      `${smokeCase.name} expected=${smokeCase.expectedExitCodes.join(',')}`,
    )
    console.log(
      `  label: ${smokeCase.commandLabel}`,
    )
    console.log(
      `  command: ${formatCommand([Bun.which('bun') ?? process.execPath, entrypoint, ...smokeCase.args])}`,
    )
    console.log(`  notes: ${smokeCase.notes}`)
    console.log('')
  }
  process.exit(0)
}

const oldEnv = new Map<EnvKey, string | undefined>()
for (const key of trackedEnvVars) {
  oldEnv.set(key, process.env[key])
}

const environment = await createEnvironment()

try {
  const targetGlobalConfigPath = getTargetGlobalConfigPath(environment.configDir)
  const migrationResult = migrateClaudeConfigDirectory({
    sourceDir,
    targetDir: environment.configDir,
    targetPluginsDir: environment.pluginCacheDir,
    targetGlobalConfigPath,
    mergeGlobalConfig: legacyConfig => {
      return writeMergedGlobalConfig(targetGlobalConfigPath, legacyConfig)
    },
  })

  const migratedFiles = await listFilesRecursive(environment.configDir)
  const migratedRelativeFiles = migratedFiles
    .map(filePath => relative(environment.configDir, filePath))
    .sort((left, right) => left.localeCompare(right))
  const migratedPluginFiles = await listFilesRecursive(environment.pluginCacheDir)
  const migratedRelativePluginFiles = migratedPluginFiles
    .map(filePath => relative(environment.pluginCacheDir, filePath))
    .sort((left, right) => left.localeCompare(right))
  const capabilitySnapshot = await inspectMigratedCapabilities(environment)

  console.log(`Source dir: ${sourceDir}`)
  console.log(`Temp root: ${environment.tempRoot}`)
  console.log(`Workspace: ${environment.workspaceDir}`)
  console.log(`Config dir: ${environment.configDir}`)
  console.log(`Plugin cache dir: ${environment.pluginCacheDir}`)
  console.log(`Merged global config: ${migrationResult.mergedGlobalConfig}`)
  console.log(
    `Copied artifacts: ${migrationResult.copiedFiles.length} (${formatListPreview(migrationResult.copiedFiles, 12)})`,
  )
  console.log(
    `Config dir snapshot: ${migratedRelativeFiles.length} (${formatListPreview(migratedRelativeFiles, 12)})`,
  )
  console.log(
    `Plugin dir snapshot: ${migratedRelativePluginFiles.length} (${formatListPreview(migratedRelativePluginFiles, 12)})`,
  )
  console.log(
    `Loaded user agents: ${capabilitySnapshot.userAgentNames.length} (${formatListPreview(capabilitySnapshot.userAgentNames)})`,
  )
  console.log(
    `Loaded user skills: ${capabilitySnapshot.userSkillNames.length} (${formatListPreview(capabilitySnapshot.userSkillNames)})`,
  )
  console.log(
    `Loaded user commands: ${capabilitySnapshot.userCommandPaths.length} (${formatListPreview(capabilitySnapshot.userCommandPaths)})`,
  )
  console.log(
    `Enabled plugins: ${capabilitySnapshot.enabledPluginSources.length} (${formatListPreview(capabilitySnapshot.enabledPluginSources)})`,
  )
  console.log(
    `Loaded plugin commands: ${capabilitySnapshot.pluginCommandNames.length} (${formatListPreview(capabilitySnapshot.pluginCommandNames)})`,
  )
  console.log(
    `Loaded plugin skills: ${capabilitySnapshot.pluginSkillNames.length} (${formatListPreview(capabilitySnapshot.pluginSkillNames)})`,
  )
  console.log(
    `Loaded plugin agents: ${capabilitySnapshot.pluginAgentNames.length} (${formatListPreview(capabilitySnapshot.pluginAgentNames)})`,
  )
  console.log(
    `Loaded plugin MCP servers: ${capabilitySnapshot.pluginMcpServerNames.length} (${formatListPreview(capabilitySnapshot.pluginMcpServerNames)})`,
  )
  console.log('')

  let failureCount = 0
  for (const smokeCase of smokeCases) {
      const result = await runSmokeCase(
        smokeCase,
        environment,
        options.maxPreviewLines,
        options.disableMcpServers,
      )
    if (!result.passed) {
      failureCount += 1
    }
    printResult(result, smokeCase)
  }

  const finalConfigFiles = await listFilesRecursive(environment.configDir)
  const finalPluginCacheFiles = await listFilesRecursive(
    environment.pluginCacheDir,
  )
  console.log(
    `Final config file count: ${finalConfigFiles.length} | Final plugin cache file count: ${finalPluginCacheFiles.length}`,
  )
  console.log(
    `Summary: ${smokeCases.length - failureCount} passed, ${failureCount} failed, total ${smokeCases.length}`,
  )

  if (failureCount > 0) {
    process.exit(1)
  }
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
    try {
      await removeTempDirectoryWithRetry(environment.tempRoot)
    } catch (error) {
      console.warn(
        `Warning: failed to remove temp directory ${environment.tempRoot}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }
}
