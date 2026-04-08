#!/usr/bin/env bun

import { mock } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type CommandResult = {
  exitCode: number
  stdout: string
  stderr: string
}

type DiagnosticStub = {
  installationType:
    | 'npm-global'
    | 'npm-local'
    | 'native'
    | 'package-manager'
    | 'development'
    | 'unknown'
  version: string
  installationPath: string
  invokedBinary: string
  configInstallMethod:
    | 'local'
    | 'native'
    | 'global'
    | 'unknown'
    | 'not set'
  autoUpdates: string
  hasUpdatePermissions: boolean | null
  multipleInstallations: Array<{ type: string; path: string }>
  warnings: Array<{ issue: string; fix: string }>
  packageManager?: string
  ripgrepStatus: {
    working: boolean
    mode: 'system' | 'builtin' | 'embedded'
    systemPath: string | null
  }
  currentTaskRouteSnapshot: {
    route: string
    executionTarget: {
      provider: string
      apiStyle: string
      model: string | null
    }
    transport: {
      baseUrl: string | null
      apiKey: string | null
    }
    fields: {
      provider: { source: string }
      apiStyle: { source: string }
      model: { source: string }
      baseUrl: { source: string }
      apiKey: { source: string }
    }
  }
}

class ExitSignal extends Error {
  constructor(readonly exitCode: number) {
    super(`graceful shutdown ${exitCode}`)
  }
}

function normalize(output: string): string {
  return output.replace(/\r/g, '').trim()
}

async function runChild(mode: string): Promise<CommandResult> {
  const child = Bun.spawn({
    cmd: [Bun.which('bun') ?? process.execPath, process.argv[1]!, mode],
    cwd: process.cwd(),
    env: process.env,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])

  return { exitCode, stdout, stderr }
}

function assertContains(
  output: string,
  expected: string,
  description: string,
): void {
  if (!output.includes(expected)) {
    throw new Error(
      `${description} expected ${JSON.stringify(expected)}, got ${JSON.stringify(output)}`,
    )
  }
}

function assertNotContains(
  output: string,
  unexpected: string,
  description: string,
): void {
  if (output.includes(unexpected)) {
    throw new Error(
      `${description} unexpectedly contained ${JSON.stringify(unexpected)}: ${JSON.stringify(output)}`,
    )
  }
}

async function runDoctorDiagnosticCheck(): Promise<void> {
  const tempRoot = await mkdtemp(join(tmpdir(), 'neko-release-facing-doctor-'))
  const envSnapshot = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    PATH: process.env.PATH,
    Path: process.env.Path,
    NEKO_CODE_CONFIG_DIR: process.env.NEKO_CODE_CONFIG_DIR,
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    NODE_ENV: process.env.NODE_ENV,
  }
  const argvSnapshot = [...process.argv]

  try {
    process.env.HOME = tempRoot
    process.env.USERPROFILE = tempRoot
    process.env.PATH = tempRoot
    process.env.Path = tempRoot
    process.env.NEKO_CODE_CONFIG_DIR = join(tempRoot, '.neko-code').replace(
      /\\/g,
      '/',
    )
    delete process.env.CLAUDE_CONFIG_DIR
    delete process.env.NODE_ENV

    process.argv[1] = join(
      tempRoot,
      '.claude',
      'local',
      'node_modules',
      'mock-entry.ts',
    ).replace(/\\/g, '/')

    ;(globalThis as typeof globalThis & {
      MACRO?: { VERSION: string; PACKAGE_URL: string }
    }).MACRO = {
      VERSION: 'test',
      PACKAGE_URL: '@test/neko-code',
    }

    mock.module('src/utils/shellConfig.js', () => ({
      CLAUDE_ALIAS_REGEX: /^\s*alias\s+claude\s*=/,
      findClaudeAlias: async () => null,
      findValidClaudeAlias: async () => null,
      filterClaudeAliases: (lines: string[]) => ({
        filtered: lines,
        hadAlias: false,
      }),
      getShellConfigPaths: () => ({
        zsh: join(tempRoot, '.zshrc').replace(/\\/g, '/'),
        bash: join(tempRoot, '.bashrc').replace(/\\/g, '/'),
        fish: join(tempRoot, '.config', 'fish', 'config.fish').replace(
          /\\/g,
          '/',
        ),
      }),
      readFileLines: async () => null,
      writeFileLines: async () => {},
    }))
    mock.module('src/utils/which.js', () => ({
      which: async () => null,
      whichSync: () => null,
    }))

    const { enableConfigs } = await import('src/utils/config.js')
    enableConfigs()
    const { getDoctorDiagnostic } = await import('src/utils/doctorDiagnostic.js')
    const diagnostic = await getDoctorDiagnostic()
    const warning = diagnostic.warnings.find(
      entry => entry.issue === 'Local installation not accessible',
    )

    if (!warning) {
      throw new Error(
        `Expected local installation warning, got ${JSON.stringify(diagnostic.warnings)}`,
      )
    }

    assertContains(
      warning.fix,
      'alias neko="~/.neko-code/local/claude"',
      'doctorDiagnostic local alias fix',
    )
    assertNotContains(
      warning.fix,
      'alias claude=',
      'doctorDiagnostic local alias fix',
    )

    console.log('[PASS] doctor-diagnostic')
    console.log(`  fix=${warning.fix}`)
  } finally {
    process.argv = argvSnapshot

    for (const [key, value] of Object.entries(envSnapshot)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }

    await rm(tempRoot, { recursive: true, force: true })
  }
}

async function runUpdateCommandCheck(): Promise<void> {
  let stdoutBuffer = ''
  let stderrBuffer = ''
  let globalConfig = { installMethod: 'native' as const }
  let latestVersion = '1.1.0'
  let globalInstallStatus: 'success' | 'no_permissions' | 'install_failed' =
    'success'
  let localInstallStatus: 'in_progress' | 'success' | 'install_failed' =
    'success'
  let nativeUpdateError: Error | null = null
  let diagnosticState: DiagnosticStub = {
    installationType: 'native',
    version: '1.0.0',
    installationPath: '/tmp/neko',
    invokedBinary: '/tmp/neko',
    configInstallMethod: 'native',
    autoUpdates: 'enabled',
    hasUpdatePermissions: true,
    multipleInstallations: [],
    warnings: [],
    ripgrepStatus: {
      working: true,
      mode: 'system',
      systemPath: '/usr/bin/rg',
    },
    currentTaskRouteSnapshot: {
      route: 'main',
      executionTarget: {
        provider: 'gemini',
        apiStyle: 'openai-compatible',
        model: 'gemini-2.5-pro',
      },
      transport: {
        baseUrl: null,
        apiKey: null,
      },
      fields: {
        provider: { source: 'test' },
        apiStyle: { source: 'test' },
        model: { source: 'test' },
        baseUrl: { source: 'test' },
        apiKey: { source: 'test' },
      },
    },
  }

  const originalStderrWrite = process.stderr.write.bind(process.stderr)
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderrBuffer += String(chunk)
    return true
  }) as typeof process.stderr.write

  mock.module('src/services/analytics/index.js', () => ({
    logEvent: () => {},
  }))
  mock.module('src/utils/autoUpdater.js', () => ({
    getLatestVersion: async () => latestVersion,
    installGlobalPackage: async () => globalInstallStatus,
  }))
  mock.module('src/utils/completionCache.js', () => ({
    regenerateCompletionCache: async () => {},
  }))
  mock.module('src/utils/config.js', () => ({
    getGlobalConfig: () => globalConfig,
    saveGlobalConfig: (
      updater: (current: typeof globalConfig) => typeof globalConfig,
    ) => {
      globalConfig = updater(globalConfig)
    },
  }))
  mock.module('src/utils/debug.js', () => ({
    logForDebugging: () => {},
  }))
  mock.module('src/utils/doctorDiagnostic.js', () => ({
    getDoctorDiagnostic: async () => diagnosticState,
  }))
  mock.module('src/utils/envUtils.js', () => ({
    getClaudeConfigHomeDir: () => '/home/test/.neko-code',
  }))
  mock.module('src/utils/gracefulShutdown.js', () => ({
    gracefulShutdown: async (code: number) => {
      throw new ExitSignal(code)
    },
  }))
  mock.module('src/utils/localInstaller.js', () => ({
    installOrUpdateClaudePackage: async () => localInstallStatus,
    localInstallationExists: async () => false,
  }))
  mock.module('src/utils/nativeInstaller/index.js', () => ({
    installLatest: async () => {
      if (nativeUpdateError) {
        throw nativeUpdateError
      }

      return {
        latestVersion: latestVersion,
        lockFailed: false,
      }
    },
    removeInstalledSymlink: async () => {},
  }))
  mock.module('src/utils/nativeInstaller/packageManagers.js', () => ({
    getPackageManager: async () => 'unknown',
  }))
  mock.module('src/utils/process.js', () => ({
    writeToStdout: (chunk: string) => {
      stdoutBuffer += chunk
    },
  }))
  mock.module('src/utils/semver.js', () => ({
    gte: (left: string, right: string) => left === right,
  }))
  mock.module('src/utils/settings/settings.js', () => ({
    getInitialSettings: () => ({ autoUpdatesChannel: 'latest' }),
  }))

  ;(globalThis as typeof globalThis & {
    MACRO?: { VERSION: string; PACKAGE_URL: string }
  }).MACRO = {
    VERSION: '1.0.0',
    PACKAGE_URL: '@test/neko-code',
  }

  const { update } = await import('src/cli/update.js')

  async function runUpdateExpectExit(expectedExitCode: number): Promise<{
    stdout: string
    stderr: string
  }> {
    stdoutBuffer = ''
    stderrBuffer = ''

    try {
      await update()
      throw new Error('Expected update() to exit')
    } catch (error) {
      if (!(error instanceof ExitSignal)) {
        throw error
      }

      if (error.exitCode !== expectedExitCode) {
        throw new Error(
          `Expected exit ${expectedExitCode}, got ${error.exitCode}. stdout=${JSON.stringify(stdoutBuffer)} stderr=${JSON.stringify(stderrBuffer)}`,
        )
      }

      return {
        stdout: normalize(stdoutBuffer),
        stderr: normalize(stderrBuffer),
      }
    }
  }

  try {
    diagnosticState = {
      ...diagnosticState,
      installationType: 'native',
      configInstallMethod: 'native',
      warnings: [],
      multipleInstallations: [],
    }
    globalConfig = { installMethod: 'native' }
    latestVersion = '1.1.0'
    nativeUpdateError = new Error('native update failed')

    const nativeFailure = await runUpdateExpectExit(1)
    assertContains(
      nativeFailure.stderr,
      'Try running "neko doctor" for diagnostics',
      'update native failure guidance',
    )
    assertNotContains(
      nativeFailure.stderr,
      'claude doctor',
      'update native failure guidance',
    )

    diagnosticState = {
      ...diagnosticState,
      installationType: 'npm-global',
      configInstallMethod: 'global',
    }
    globalConfig = { installMethod: 'global' }
    latestVersion = '1.1.0'
    nativeUpdateError = null
    globalInstallStatus = 'install_failed'

    const globalFailure = await runUpdateExpectExit(1)
    assertContains(
      globalFailure.stderr,
      'Or consider using native installation with: neko install',
      'update global failure guidance',
    )
    assertNotContains(
      globalFailure.stderr,
      'claude install',
      'update global failure guidance',
    )

    console.log('[PASS] update-command')
    console.log(
      '  checked=native-error-guidance,npm-global-install-guidance',
    )
  } finally {
    process.stderr.write = originalStderrWrite
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2]

  if (mode === 'doctor-diagnostic') {
    await runDoctorDiagnosticCheck()
    return
  }

  if (mode === 'update-command') {
    await runUpdateCommandCheck()
    return
  }

  const checks = [
    { label: 'doctor-diagnostic', mode: 'doctor-diagnostic' },
    { label: 'update-command', mode: 'update-command' },
  ] as const

  for (const check of checks) {
    const result = await runChild(check.mode)
    if (result.exitCode !== 0) {
      if (result.stdout.trim().length > 0) {
        process.stdout.write(result.stdout)
      }
      if (result.stderr.trim().length > 0) {
        process.stderr.write(result.stderr)
      }
      throw new Error(
        `${check.label} failed with exit ${result.exitCode}`,
      )
    }

    process.stdout.write(result.stdout)
    if (result.stderr.trim().length > 0) {
      process.stderr.write(result.stderr)
    }
  }

  console.log('[PASS] release-facing-diagnostics-smoke')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
