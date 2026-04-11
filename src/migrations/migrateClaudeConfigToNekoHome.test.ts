import { afterEach, describe, expect, test } from 'bun:test'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

const tempPaths: string[] = []

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempPaths.push(dir)
  return dir
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2))
}

function writeText(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

afterEach(() => {
  for (const path of tempPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true })
  }
})

describe('migrateClaudeConfigDirectory', () => {
  test('copies missing Claude config artifacts into the Neko config home', async () => {
    const { migrateClaudeConfigDirectory } = await import(
      './migrateClaudeConfigToNekoHome.js'
    )
    const sourceDir = createTempDir('claude-legacy-')
    const targetDir = createTempDir('neko-home-')
    const mergedConfigs: Array<Record<string, unknown>> = []

    writeJson(join(sourceDir, '.config.json'), {
      theme: 'light',
      autoCompactEnabled: false,
    })
    writeJson(join(sourceDir, 'settings.json'), {
      env: { OPENAI_API_KEY: 'legacy-key' },
    })
    writeText(join(sourceDir, '.credentials.json'), '{"token":"legacy"}')
    writeText(join(sourceDir, 'CLAUDE.md'), '# legacy memory')
    writeText(join(sourceDir, 'agents', 'reviewer.md'), '# reviewer')
    writeText(join(sourceDir, 'commands', 'shipit.md'), '# ship it')
    writeText(join(sourceDir, 'skills', 'smoke', 'SKILL.md'), '# smoke skill')
    writeText(join(sourceDir, 'plans', 'roadmap.md'), '# roadmap')
    writeText(join(sourceDir, 'rules', 'team.md'), 'team rule')
    writeText(join(sourceDir, 'rules', 'nested', 'lint.md'), 'nested rule')

    const result = migrateClaudeConfigDirectory({
      sourceDir,
      targetDir,
      targetGlobalConfigPath: join(targetDir, '.neko-code.json'),
      mergeGlobalConfig: legacyConfig => {
        mergedConfigs.push(legacyConfig)
        return true
      },
    })

    expect(result.mergedGlobalConfig).toBe(true)
    expect(mergedConfigs).toHaveLength(1)
    expect(mergedConfigs[0]?.theme).toBe('light')
    expect(result.copiedFiles.slice().sort()).toEqual([
      'settings.json',
      '.credentials.json',
      'CLAUDE.md',
      join('agents', 'reviewer.md'),
      join('commands', 'shipit.md'),
      join('skills', 'smoke', 'SKILL.md'),
      join('plans', 'roadmap.md'),
      join('rules', 'nested', 'lint.md'),
      join('rules', 'team.md'),
    ].sort())
    expect(readFileSync(join(targetDir, 'settings.json'), 'utf-8')).toContain(
      'legacy-key',
    )
    expect(readFileSync(join(targetDir, '.credentials.json'), 'utf-8')).toContain(
      'legacy',
    )
    expect(readFileSync(join(targetDir, 'CLAUDE.md'), 'utf-8')).toBe(
      '# legacy memory',
    )
    expect(readFileSync(join(targetDir, 'agents', 'reviewer.md'), 'utf-8')).toBe(
      '# reviewer',
    )
    expect(readFileSync(join(targetDir, 'commands', 'shipit.md'), 'utf-8')).toBe(
      '# ship it',
    )
    expect(
      readFileSync(join(targetDir, 'skills', 'smoke', 'SKILL.md'), 'utf-8'),
    ).toBe('# smoke skill')
    expect(readFileSync(join(targetDir, 'plans', 'roadmap.md'), 'utf-8')).toBe(
      '# roadmap',
    )
    expect(readFileSync(join(targetDir, 'rules', 'team.md'), 'utf-8')).toBe(
      'team rule',
    )
    expect(
      readFileSync(join(targetDir, 'rules', 'nested', 'lint.md'), 'utf-8'),
    ).toBe('nested rule')
  })

  test('reads legacy global config from sibling ~/.claude.json', async () => {
    const { migrateClaudeConfigDirectory } = await import(
      './migrateClaudeConfigToNekoHome.js'
    )
    const fakeHomeDir = createTempDir('legacy-home-')
    const sourceDir = join(fakeHomeDir, '.claude')
    const targetDir = createTempDir('neko-home-')
    const mergedConfigs: Array<Record<string, unknown>> = []

    mkdirSync(sourceDir, { recursive: true })
    writeJson(join(fakeHomeDir, '.claude.json'), {
      theme: 'dark',
      mcpServers: {
        serena: {
          command: 'uv',
          args: ['run', 'serena'],
        },
      },
    })

    const result = migrateClaudeConfigDirectory({
      sourceDir,
      targetDir,
      targetGlobalConfigPath: join(targetDir, '.neko-code.json'),
      mergeGlobalConfig: legacyConfig => {
        mergedConfigs.push(legacyConfig)
        return true
      },
    })

    expect(result.mergedGlobalConfig).toBe(true)
    expect(mergedConfigs).toHaveLength(1)
    expect(mergedConfigs[0]?.theme).toBe('dark')
    expect(
      mergedConfigs[0]?.mcpServers as Record<string, { command: string }>,
    ).toMatchObject({
      serena: {
        command: 'uv',
      },
    })
  })

  test('does not overwrite existing Neko config artifacts', async () => {
    const { migrateClaudeConfigDirectory } = await import(
      './migrateClaudeConfigToNekoHome.js'
    )
    const sourceDir = createTempDir('claude-legacy-')
    const targetDir = createTempDir('neko-home-')
    const targetPluginsDir = join(targetDir, 'plugin-cache')

    writeJson(join(sourceDir, '.config.json'), {
      theme: 'light',
    })
    writeJson(join(sourceDir, 'settings.json'), {
      env: { OPENAI_API_KEY: 'legacy-key' },
    })
    writeText(join(sourceDir, 'CLAUDE.md'), '# legacy memory')
    writeText(join(sourceDir, 'agents', 'legacy.md'), '# legacy agent')
    writeText(join(sourceDir, 'commands', 'legacy.md'), '# legacy command')
    writeText(join(sourceDir, 'rules', 'legacy.md'), 'legacy rule')
    writeText(join(sourceDir, 'rules', 'new.md'), 'new rule')
    writeJson(join(sourceDir, 'plugins', 'installed_plugins.json'), {
      version: 2,
      plugins: {
        'playwright@claude-plugins-official': [
          {
            scope: 'user',
            version: '1.48.0',
            installPath: join(
              sourceDir,
              'plugins',
              'cache',
              'claude-plugins-official',
              'playwright',
              '1.48.0',
            ),
          },
        ],
      },
    })
    writeJson(join(sourceDir, 'plugins', 'known_marketplaces.json'), {
      'claude-plugins-official': {
        source: { source: 'github', repo: 'anthropic/claude-plugins' },
        installLocation: join(
          sourceDir,
          'plugins',
          'marketplaces',
          'claude-plugins-official.json',
        ),
        lastUpdated: '2026-04-08T00:00:00.000Z',
      },
    })

    writeJson(join(targetDir, '.neko-code.json'), {
      theme: 'dark',
    })
    writeJson(join(targetDir, 'settings.json'), {
      env: { OPENAI_API_KEY: 'current-key' },
    })
    writeText(join(targetDir, 'CLAUDE.md'), '# current memory')
    writeText(join(targetDir, 'agents', 'legacy.md'), '# current agent')
    writeText(join(targetDir, 'rules', 'legacy.md'), 'current rule')
    writeJson(join(targetPluginsDir, 'installed_plugins.json'), {
      version: 2,
      plugins: {
        'playwright@claude-plugins-official': [
          {
            scope: 'user',
            version: '9.9.9',
            installPath: join(
              targetPluginsDir,
              'cache',
              'claude-plugins-official',
              'playwright',
              '9.9.9',
            ),
          },
        ],
      },
    })
    writeJson(join(targetPluginsDir, 'known_marketplaces.json'), {
      'claude-plugins-official': {
        source: { source: 'github', repo: 'current/repo' },
        installLocation: join(
          targetPluginsDir,
          'marketplaces',
          'current-marketplace.json',
        ),
        lastUpdated: '2026-04-09T00:00:00.000Z',
      },
    })

    const result = migrateClaudeConfigDirectory({
      sourceDir,
      targetDir,
      targetPluginsDir,
      targetGlobalConfigPath: join(targetDir, '.neko-code.json'),
      mergeGlobalConfig: () => {
        return false
      },
    })

    expect(result.mergedGlobalConfig).toBe(false)
    expect(readFileSync(join(targetDir, 'settings.json'), 'utf-8')).toContain(
      'current-key',
    )
    expect(readFileSync(join(targetDir, 'CLAUDE.md'), 'utf-8')).toBe(
      '# current memory',
    )
    expect(readFileSync(join(targetDir, 'agents', 'legacy.md'), 'utf-8')).toBe(
      '# current agent',
    )
    expect(
      readFileSync(join(targetDir, 'commands', 'legacy.md'), 'utf-8'),
    ).toBe('# legacy command')
    expect(readFileSync(join(targetDir, 'rules', 'legacy.md'), 'utf-8')).toBe(
      'current rule',
    )
    expect(readFileSync(join(targetDir, 'rules', 'new.md'), 'utf-8')).toBe(
      'new rule',
    )
    const mergedInstalledPlugins = JSON.parse(
      readFileSync(join(targetPluginsDir, 'installed_plugins.json'), 'utf-8'),
    )
    expect(
      mergedInstalledPlugins.plugins['playwright@claude-plugins-official'].map(
        (entry: { version: string }) => entry.version,
      ),
    ).toEqual(['9.9.9', '1.48.0'])
    expect(
      JSON.parse(
        readFileSync(join(targetPluginsDir, 'known_marketplaces.json'), 'utf-8'),
      )['claude-plugins-official'].installLocation,
    ).toBe(join(targetPluginsDir, 'marketplaces', 'current-marketplace.json'))
    expect(result.copiedFiles).toContain(join('plugins', 'installed_plugins.json'))
    expect(result.copiedFiles).not.toContain(
      join('plugins', 'known_marketplaces.json'),
    )
  })

  test('merges missing legacy settings keys into an existing Neko settings file', async () => {
    const { migrateClaudeConfigDirectory } = await import(
      './migrateClaudeConfigToNekoHome.js'
    )
    const sourceDir = createTempDir('claude-legacy-')
    const targetDir = createTempDir('neko-home-')

    writeJson(join(sourceDir, 'settings.json'), {
      env: {
        NEKO_CODE_CODEX_API_KEY: 'legacy-codex-key',
      },
      providerKeys: [
        {
          id: 'codex-k1',
          provider: 'codex',
          secretEnv: 'NEKO_CODE_CODEX_API_KEY',
          models: ['gpt-5.2'],
        },
      ],
      taskRoutes: {
        review: {
          provider: 'codex',
          apiStyle: 'openai-compatible',
          model: 'gpt-5.2',
          keyRef: 'codex-k1',
        },
      },
      taskRouteRules: [
        {
          matchQuerySourcePrefix: 'verification_agent',
          provider: 'codex',
          model: 'gpt-5.2',
          keyRef: 'codex-k1',
        },
      ],
    })

    writeJson(join(targetDir, 'settings.json'), {
      env: {
        ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic',
      },
      providerKeys: [
        {
          id: 'asxs-k1',
          provider: 'openai-compatible',
          secretEnv: 'OPENAI_API_KEY',
          models: ['gpt-5.4'],
        },
      ],
      taskRoutes: {
        main: {
          provider: 'openai-compatible',
          apiStyle: 'openai-compatible',
          model: 'gpt-5.4',
          keyRef: 'asxs-k1',
        },
      },
      taskRouteRules: [
        {
          matchQuerySourcePrefix: 'repl_main_thread',
          model: 'gpt-5.4',
          keyRef: 'asxs-k1',
        },
      ],
    })

    const result = migrateClaudeConfigDirectory({
      sourceDir,
      targetDir,
      targetGlobalConfigPath: join(targetDir, '.neko-code.json'),
      mergeGlobalConfig: () => false,
    })

    const mergedSettings = JSON.parse(
      readFileSync(join(targetDir, 'settings.json'), 'utf-8'),
    )

    expect(result.copiedFiles).toContain('settings.json')
    expect(mergedSettings.env).toMatchObject({
      ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic',
      NEKO_CODE_CODEX_API_KEY: 'legacy-codex-key',
    })
    expect(
      mergedSettings.providerKeys.map((entry: { id: string }) => entry.id),
    ).toEqual(['asxs-k1', 'codex-k1'])
    expect(mergedSettings.taskRoutes.main.model).toBe('gpt-5.4')
    expect(mergedSettings.taskRoutes.review).toMatchObject({
      provider: 'codex',
      model: 'gpt-5.2',
      keyRef: 'codex-k1',
    })
    expect(mergedSettings.taskRouteRules).toHaveLength(2)
  })

  test('merges legacy mcp config and rewrites plugin state into target plugin dir', async () => {
    const { migrateClaudeConfigDirectory } = await import(
      './migrateClaudeConfigToNekoHome.js'
    )
    const sourceDir = createTempDir('claude-legacy-')
    const targetDir = createTempDir('neko-home-')
    const targetPluginsDir = join(targetDir, 'plugin-cache')
    const mergedConfigs: Array<Record<string, unknown>> = []

    writeJson(join(sourceDir, 'mcp_config.json'), {
      servers: {
        'chrome-devtools': {
          command: 'npx',
          args: ['-y', 'chrome-devtools-mcp@latest'],
          env: {},
        },
      },
    })
    writeJson(join(sourceDir, 'plugins', 'installed_plugins.json'), {
      version: 2,
      plugins: {
        'playwright@claude-plugins-official': [
          {
            scope: 'user',
            version: '1.48.0',
            installPath: join(
              sourceDir,
              'plugins',
              'cache',
              'claude-plugins-official',
              'playwright',
              '1.48.0',
            ),
            installedAt: '2026-04-08T00:00:00.000Z',
          },
        ],
      },
    })
    writeJson(join(sourceDir, 'plugins', 'known_marketplaces.json'), {
      'claude-plugins-official': {
        source: { source: 'github', repo: 'anthropic/claude-plugins' },
        installLocation: join(
          sourceDir,
          'plugins',
          'marketplaces',
          'claude-plugins-official.json',
        ),
        lastUpdated: '2026-04-08T00:00:00.000Z',
      },
    })
    writeText(
      join(
        sourceDir,
        'plugins',
        'cache',
        'claude-plugins-official',
        'playwright',
        '1.48.0',
        '.claude-plugin',
        'manifest.json',
      ),
      '{"name":"playwright"}',
    )
    writeText(
      join(
        sourceDir,
        'plugins',
        'data',
        'playwright-claude-plugins-official',
        'state.json',
      ),
      '{"enabled":true}',
    )
    writeText(
      join(
        sourceDir,
        'plugins',
        'marketplaces',
        'claude-plugins-official.json',
      ),
      '{"plugins":[]}',
    )
    writeText(
      join(sourceDir, 'plugins', 'blocklist.json'),
      '{"blocked":[]}',
    )

    const result = migrateClaudeConfigDirectory({
      sourceDir,
      targetDir,
      targetPluginsDir,
      targetGlobalConfigPath: join(targetDir, '.neko-code.json'),
      mergeGlobalConfig: legacyConfig => {
        mergedConfigs.push(legacyConfig)
        return true
      },
    })

    expect(result.mergedGlobalConfig).toBe(true)
    expect(mergedConfigs).toHaveLength(1)
    expect(
      mergedConfigs[0]?.mcpServers as Record<string, { command: string }>,
    ).toMatchObject({
      'chrome-devtools': {
        command: 'npx',
      },
    })

    const installedPlugins = JSON.parse(
      readFileSync(join(targetPluginsDir, 'installed_plugins.json'), 'utf-8'),
    )
    expect(
      installedPlugins.plugins['playwright@claude-plugins-official'][0]
        .installPath,
    ).toBe(
      join(
        targetPluginsDir,
        'cache',
        'claude-plugins-official',
        'playwright',
        '1.48.0',
      ),
    )

    const knownMarketplaces = JSON.parse(
      readFileSync(join(targetPluginsDir, 'known_marketplaces.json'), 'utf-8'),
    )
    expect(
      knownMarketplaces['claude-plugins-official'].installLocation,
    ).toBe(join(targetPluginsDir, 'marketplaces', 'claude-plugins-official.json'))
    expect(
      readFileSync(
        join(
          targetPluginsDir,
          'cache',
          'claude-plugins-official',
          'playwright',
          '1.48.0',
          '.claude-plugin',
          'manifest.json',
        ),
        'utf-8',
      ),
    ).toContain('playwright')
    expect(
      readFileSync(
        join(
          targetPluginsDir,
          'data',
          'playwright-claude-plugins-official',
          'state.json',
        ),
        'utf-8',
      ),
    ).toContain('"enabled":true')
    expect(readFileSync(join(targetPluginsDir, 'blocklist.json'), 'utf-8')).toBe(
      '{"blocked":[]}',
    )
    expect(result.copiedFiles).toContain(join('plugins', 'installed_plugins.json'))
    expect(result.copiedFiles).toContain(join('plugins', 'known_marketplaces.json'))
  })

  test('backfills missing mcp servers and plugin entries into existing Neko state', async () => {
    const { migrateClaudeConfigDirectory } = await import(
      './migrateClaudeConfigToNekoHome.js'
    )
    const sourceDir = createTempDir('claude-legacy-')
    const targetDir = createTempDir('neko-home-')
    const targetPluginsDir = join(targetDir, 'plugin-cache')

    let currentGlobalConfig: Record<string, unknown> = {
      theme: 'dark',
    }

    writeJson(join(sourceDir, '.config.json'), {
      theme: 'light',
    })
    writeJson(join(sourceDir, 'mcp_config.json'), {
      servers: {
        serena: {
          command: 'uv',
          args: ['run', '--directory', 'C:\\Users\\yukin\\serena', 'serena-mcp-server'],
          env: {},
        },
      },
    })
    writeJson(join(sourceDir, 'plugins', 'installed_plugins.json'), {
      version: 2,
      plugins: {
        'superpowers@superpowers-marketplace': [
          {
            scope: 'user',
            version: '4.0.3',
            installPath: join(
              sourceDir,
              'plugins',
              'cache',
              'superpowers-marketplace',
              'superpowers',
              '4.0.3',
            ),
          },
        ],
      },
    })
    writeJson(join(sourceDir, 'plugins', 'known_marketplaces.json'), {
      'superpowers-marketplace': {
        source: { source: 'github', repo: 'siteboon/claude-superpowers' },
        installLocation: join(
          sourceDir,
          'plugins',
          'marketplaces',
          'superpowers-marketplace',
        ),
        lastUpdated: '2026-04-08T00:00:00.000Z',
      },
    })
    writeText(
      join(
        sourceDir,
        'plugins',
        'cache',
        'superpowers-marketplace',
        'superpowers',
        '4.0.3',
        '.claude-plugin',
        'plugin.json',
      ),
      '{"name":"superpowers"}',
    )
    writeText(
      join(
        sourceDir,
        'plugins',
        'marketplaces',
        'superpowers-marketplace',
        '.claude-plugin',
        'marketplace.json',
      ),
      '{"plugins":[]}',
    )

    writeJson(join(targetDir, '.neko-code.json'), currentGlobalConfig)
    writeJson(join(targetPluginsDir, 'installed_plugins.json'), {
      version: 2,
      plugins: {
        'playwright@claude-plugins-official': [
          {
            scope: 'user',
            version: '1.48.0',
            installPath: join(
              targetPluginsDir,
              'cache',
              'claude-plugins-official',
              'playwright',
              '1.48.0',
            ),
          },
        ],
      },
    })
    writeJson(join(targetPluginsDir, 'known_marketplaces.json'), {
      'claude-plugins-official': {
        source: { source: 'github', repo: 'anthropic/claude-plugins' },
        installLocation: join(
          targetPluginsDir,
          'marketplaces',
          'claude-plugins-official',
        ),
        lastUpdated: '2026-04-08T00:00:00.000Z',
      },
    })

    const result = migrateClaudeConfigDirectory({
      sourceDir,
      targetDir,
      targetPluginsDir,
      targetGlobalConfigPath: join(targetDir, '.neko-code.json'),
      mergeGlobalConfig: legacyConfig => {
        const mergedConfig = { ...currentGlobalConfig }
        let changed = false

        if (mergedConfig.mcpServers === undefined && legacyConfig.mcpServers) {
          mergedConfig.mcpServers = legacyConfig.mcpServers
          changed = true
        }

        currentGlobalConfig = changed ? mergedConfig : currentGlobalConfig
        return changed
      },
    })

    expect(result.mergedGlobalConfig).toBe(true)
    expect(currentGlobalConfig.theme).toBe('dark')
    expect(
      (currentGlobalConfig.mcpServers as Record<string, { command: string }>).serena
        .command,
    ).toBe('uv')

    const installedPlugins = JSON.parse(
      readFileSync(join(targetPluginsDir, 'installed_plugins.json'), 'utf-8'),
    )
    expect(Object.keys(installedPlugins.plugins).sort()).toEqual([
      'playwright@claude-plugins-official',
      'superpowers@superpowers-marketplace',
    ])
    expect(
      installedPlugins.plugins['superpowers@superpowers-marketplace'][0]
        .installPath,
    ).toBe(
      join(
        targetPluginsDir,
        'cache',
        'superpowers-marketplace',
        'superpowers',
        '4.0.3',
      ),
    )

    const knownMarketplaces = JSON.parse(
      readFileSync(join(targetPluginsDir, 'known_marketplaces.json'), 'utf-8'),
    )
    expect(Object.keys(knownMarketplaces).sort()).toEqual([
      'claude-plugins-official',
      'superpowers-marketplace',
    ])
    expect(
      knownMarketplaces['superpowers-marketplace'].installLocation,
    ).toBe(join(targetPluginsDir, 'marketplaces', 'superpowers-marketplace'))
    expect(
      readFileSync(
        join(
          targetPluginsDir,
          'cache',
          'superpowers-marketplace',
          'superpowers',
          '4.0.3',
          '.claude-plugin',
          'plugin.json',
        ),
        'utf-8',
      ),
    ).toContain('superpowers')
    expect(result.copiedFiles).toContain(join('plugins', 'installed_plugins.json'))
    expect(result.copiedFiles).toContain(join('plugins', 'known_marketplaces.json'))
  })
})
