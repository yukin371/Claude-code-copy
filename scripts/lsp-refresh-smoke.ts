#!/usr/bin/env bun

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setCwdState, setInlinePlugins, setOriginalCwd } from '../src/bootstrap/state.js'
import { _resetLspManagerForTesting, getInitializationStatus, getLspServerManager, initializeLspServerManager, shutdownLspServerManager, waitForInitialization } from '../src/services/lsp/manager.js'
import { getDefaultAppState } from '../src/state/AppStateStore.js'
import { refreshActivePlugins } from '../src/utils/plugins/refresh.js'

type EnvKey = 'NEKO_CODE_CONFIG_DIR' | 'CLAUDE_CODE_PLUGIN_CACHE_DIR' | 'CLAUDE_CODE_SIMPLE'

const keepTemp = process.argv.includes('--keep-temp')

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

async function createInlineLspPlugin(pluginDir: string, pluginName: string): Promise<void> {
  await mkdir(join(pluginDir, '.claude-plugin'), { recursive: true })

  await writeFile(
    join(pluginDir, '.claude-plugin', 'plugin.json'),
    `${JSON.stringify(
      {
        name: pluginName,
        lspServers: {
          smoke: {
            command: 'cmd',
            args: ['/c', 'exit', '0'],
            extensionToLanguage: {
              '.smoke': 'smoke',
            },
          },
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

const tempRoot = await mkdtemp(join(tmpdir(), 'neko-lsp-refresh-smoke-'))
const workspaceDir = join(tempRoot, 'workspace')
const configDir = join(tempRoot, 'config')
const pluginCacheDir = join(tempRoot, 'plugin-cache')
const inlinePluginDir = join(tempRoot, 'inline-lsp-plugin')
const inlinePluginName = 'smoke-inline-lsp-plugin'
const scopedServerName = `plugin:${inlinePluginName}:smoke`

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
  await createInlineLspPlugin(inlinePluginDir, inlinePluginName)

  for (const key of trackedEnvVars) {
    oldEnv.set(key, process.env[key])
  }

  process.env.NEKO_CODE_CONFIG_DIR = configDir
  process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR = pluginCacheDir
  delete process.env.CLAUDE_CODE_SIMPLE

  process.chdir(workspaceDir)
  setOriginalCwd(workspaceDir)
  setCwdState(workspaceDir)
  setInlinePlugins([])

  _resetLspManagerForTesting()
  initializeLspServerManager()
  await waitForInitialization()

  const baselineStatus = getInitializationStatus()
  assert(
    baselineStatus.status === 'success',
    `Expected baseline LSP manager init to succeed, got ${baselineStatus.status}`,
  )

  const baselineManager = getLspServerManager()
  assert(baselineManager, 'Expected baseline LSP manager instance to exist')
  const baselineServerNames = [...baselineManager.getAllServers().keys()].sort()

  setInlinePlugins([inlinePluginDir])

  let appState = getDefaultAppState()
  const refreshResult = await refreshActivePlugins(updater => {
    appState = updater(appState)
  })
  await waitForInitialization()

  const refreshedStatus = getInitializationStatus()
  assert(
    refreshedStatus.status === 'success',
    `Expected refreshed LSP manager init to succeed, got ${refreshedStatus.status}`,
  )

  const refreshedManager = getLspServerManager()
  assert(refreshedManager, 'Expected refreshed LSP manager instance to exist')
  const refreshedServerNames = [...refreshedManager.getAllServers().keys()].sort()

  assert(
    refreshResult.lsp_count >= 1,
    `Expected refreshActivePlugins to report at least 1 plugin LSP server, got ${refreshResult.lsp_count}`,
  )
  assert(
    refreshedServerNames.includes(scopedServerName),
    `Expected refreshed LSP server list to include ${scopedServerName}, got ${refreshedServerNames.join(', ') || '(none)'}`,
  )
  assert(
    refreshedServerNames.length >= baselineServerNames.length + 1,
    `Expected refreshed LSP server count to increase by at least 1 (baseline=${baselineServerNames.length}, refreshed=${refreshedServerNames.length})`,
  )
  assert(
    appState.plugins.enabled.some(plugin => plugin.name === inlinePluginName),
    `Expected AppState.plugins.enabled to include ${inlinePluginName}`,
  )

  console.log(`Temp root: ${tempRoot}`)
  console.log(`Workspace: ${workspaceDir}`)
  console.log(`Config dir: ${configDir}`)
  console.log(`Plugin cache dir: ${pluginCacheDir}`)
  console.log(`Inline plugin dir: ${inlinePluginDir}`)
  console.log('')
  console.log('[PASS] baseline-lsp-manager')
  console.log(`  status=${baselineStatus.status}`)
  console.log(`  servers=${baselineServerNames.join(', ') || '(none)'}`)
  console.log('')
  console.log('[PASS] refresh-with-inline-lsp-plugin')
  console.log(`  status=${refreshedStatus.status}`)
  console.log(`  lsp_count=${refreshResult.lsp_count}`)
  console.log(`  servers=${refreshedServerNames.join(', ')}`)
  console.log(`  pluginReconnectKey=${appState.mcp.pluginReconnectKey}`)
  console.log('')
  console.log(
    `[PASS] delta lspServers=+${refreshedServerNames.length - baselineServerNames.length}`,
  )
} finally {
  setInlinePlugins([])
  await shutdownLspServerManager()
  _resetLspManagerForTesting()
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
