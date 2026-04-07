#!/usr/bin/env bun

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setCwdState, setInlinePlugins, setOriginalCwd } from '../src/bootstrap/state.js'
import { getDefaultAppState } from '../src/state/AppStateStore.js'
import { refreshActivePlugins } from '../src/utils/plugins/refresh.js'

type EnvKey =
  | 'NEKO_CODE_CONFIG_DIR'
  | 'CLAUDE_CODE_PLUGIN_CACHE_DIR'
  | 'CLAUDE_CODE_SIMPLE'

type SmokeRun = {
  label: string
  enabledCount: number
  commandCount: number
  agentCount: number
  hookCount: number
  mcpCount: number
  lspCount: number
  errorCount: number
  pluginReconnectKey: number
  enabledPluginNames: string[]
}

const keepTemp = process.argv.includes('--keep-temp')

function formatRun(run: SmokeRun): string[] {
  return [
    `[PASS] ${run.label}`,
    `  enabled=${run.enabledCount} commands=${run.commandCount} agents=${run.agentCount} hooks=${run.hookCount} mcp=${run.mcpCount} lsp=${run.lspCount} errors=${run.errorCount}`,
    `  pluginReconnectKey=${run.pluginReconnectKey}`,
    `  enabledPlugins=${run.enabledPluginNames.join(', ') || '(none)'}`,
  ]
}

async function createInlinePlugin(pluginDir: string, pluginName: string): Promise<void> {
  await mkdir(join(pluginDir, '.claude-plugin'), { recursive: true })
  await mkdir(join(pluginDir, 'commands'), { recursive: true })

  await writeFile(
    join(pluginDir, '.claude-plugin', 'plugin.json'),
    `${JSON.stringify({ name: pluginName }, null, 2)}\n`,
    'utf8',
  )

  await writeFile(
    join(pluginDir, 'commands', 'smoke-refresh.md'),
    [
      '---',
      'description: Validate isolated plugin refresh smoke',
      '---',
      '',
      'Reply with a short confirmation that the isolated plugin refresh smoke is loaded.',
      '',
    ].join('\n'),
    'utf8',
  )
}

async function runRefresh(label: string, inlinePlugins: string[]): Promise<SmokeRun> {
  setInlinePlugins(inlinePlugins)

  let appState = getDefaultAppState()
  const result = await refreshActivePlugins(updater => {
    appState = updater(appState)
  })

  return {
    label,
    enabledCount: result.enabled_count,
    commandCount: result.command_count,
    agentCount: result.agent_count,
    hookCount: result.hook_count,
    mcpCount: result.mcp_count,
    lspCount: result.lsp_count,
    errorCount: result.error_count,
    pluginReconnectKey: appState.mcp.pluginReconnectKey,
    enabledPluginNames: appState.plugins.enabled.map(plugin => plugin.name).sort(),
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

const tempRoot = await mkdtemp(join(tmpdir(), 'neko-plugin-refresh-smoke-'))
const workspaceDir = join(tempRoot, 'workspace')
const configDir = join(tempRoot, 'config')
const pluginCacheDir = join(tempRoot, 'plugin-cache')
const inlinePluginDir = join(tempRoot, 'inline-plugin')
const inlinePluginName = 'smoke-inline-plugin'

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
  await createInlinePlugin(inlinePluginDir, inlinePluginName)

  for (const key of trackedEnvVars) {
    oldEnv.set(key, process.env[key])
  }

  process.env.NEKO_CODE_CONFIG_DIR = configDir
  process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR = pluginCacheDir
  process.env.CLAUDE_CODE_SIMPLE = '1'

  process.chdir(workspaceDir)
  setOriginalCwd(workspaceDir)
  setCwdState(workspaceDir)

  const baseline = await runRefresh('baseline-no-inline-plugin', [])
  const refreshed = await runRefresh('refresh-with-inline-plugin', [inlinePluginDir])

  assert(
    refreshed.enabledCount >= baseline.enabledCount + 1,
    `Expected enabled plugin count to increase by at least 1 (baseline=${baseline.enabledCount}, refreshed=${refreshed.enabledCount})`,
  )
  assert(
    refreshed.commandCount >= baseline.commandCount + 1,
    `Expected plugin command count to increase by at least 1 (baseline=${baseline.commandCount}, refreshed=${refreshed.commandCount})`,
  )
  assert(
    refreshed.enabledPluginNames.includes(inlinePluginName),
    `Expected refreshed enabled plugins to include ${inlinePluginName}`,
  )
  assert(
    refreshed.pluginReconnectKey === 1,
    `Expected pluginReconnectKey to be 1 after refresh, got ${refreshed.pluginReconnectKey}`,
  )

  console.log(`Temp root: ${tempRoot}`)
  console.log(`Workspace: ${workspaceDir}`)
  console.log(`Config dir: ${configDir}`)
  console.log(`Plugin cache dir: ${pluginCacheDir}`)
  console.log(`Inline plugin dir: ${inlinePluginDir}`)
  console.log('')
  for (const line of formatRun(baseline)) {
    console.log(line)
  }
  console.log('')
  for (const line of formatRun(refreshed)) {
    console.log(line)
  }
  console.log('')
  console.log(
    `[PASS] delta enabled=+${refreshed.enabledCount - baseline.enabledCount} commands=+${refreshed.commandCount - baseline.commandCount}`,
  )
} finally {
  setInlinePlugins([])
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
    await rm(tempRoot, { recursive: true, force: true })
  }
}
