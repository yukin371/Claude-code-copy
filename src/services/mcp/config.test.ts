import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  getCurrentProjectConfig,
  saveCurrentProjectConfig,
  type ProjectConfig,
} from '../../utils/config.js'
import { isMcpServerDisabled } from './config.js'

type EnvSnapshot = Record<string, string | undefined>

const ENV_KEYS = ['NEKO_CODE_DISABLED_MCP_SERVERS'] as const

function snapshotEnv(keys: readonly string[]): EnvSnapshot {
  return Object.fromEntries(keys.map(key => [key, process.env[key]]))
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key]
      continue
    }
    process.env[key] = value
  }
}

function cloneProjectConfig(config: ProjectConfig): ProjectConfig {
  return JSON.parse(JSON.stringify(config)) as ProjectConfig
}

describe('isMcpServerDisabled', () => {
  let envSnapshot: EnvSnapshot
  let projectConfigSnapshot: ProjectConfig

  beforeEach(() => {
    envSnapshot = snapshotEnv(ENV_KEYS)
    projectConfigSnapshot = cloneProjectConfig(getCurrentProjectConfig())
    saveCurrentProjectConfig(current => ({
      ...current,
      disabledMcpServers: [],
      enabledMcpServers: [],
    }))
  })

  afterEach(() => {
    restoreEnv(envSnapshot)
    const snapshot = cloneProjectConfig(projectConfigSnapshot)
    saveCurrentProjectConfig(() => snapshot)
  })

  test('supports temporarily disabling a named MCP server via env', () => {
    process.env.NEKO_CODE_DISABLED_MCP_SERVERS = 'serena,chrome-devtools'

    expect(isMcpServerDisabled('serena')).toBe(true)
    expect(isMcpServerDisabled('chrome-devtools')).toBe(true)
    expect(isMcpServerDisabled('playwright')).toBe(false)
  })

  test('env override wins even when the project config keeps the server enabled', () => {
    process.env.NEKO_CODE_DISABLED_MCP_SERVERS = 'serena'
    saveCurrentProjectConfig(current => ({
      ...current,
      disabledMcpServers: [],
    }))

    expect(isMcpServerDisabled('serena')).toBe(true)
  })

  test('supports disabling every MCP server via wildcard', () => {
    process.env.NEKO_CODE_DISABLED_MCP_SERVERS = '*'

    expect(isMcpServerDisabled('serena')).toBe(true)
    expect(isMcpServerDisabled('anything-else')).toBe(true)
  })
})
