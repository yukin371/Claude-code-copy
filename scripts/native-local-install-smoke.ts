#!/usr/bin/env bun

import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, delimiter } from 'node:path'
import {
  createOpenAICompatibleSmokeEnv,
  startOpenAICompatibleSmokeServer,
} from './openai-compatible-smoke-server.js'

type CommandResult = {
  args: string[]
  exitCode: number
  stdout: string
  stderr: string
}

type SmokeOptions = {
  keepTemp: boolean
  disableMcpServers?: string
}

const COMMAND_TIMEOUT_MS = 180_000

function parseArgs(argv: string[]): SmokeOptions {
  let keepTemp = false
  let disableMcpServers: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--keep-temp') {
      keepTemp = true
      continue
    }

    if (arg === '--disable-serena') {
      disableMcpServers = disableMcpServers
        ? `${disableMcpServers},serena`
        : 'serena'
      continue
    }

    if (arg === '--disable-mcp-servers') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('--disable-mcp-servers requires a comma separated value')
      }
      disableMcpServers = value
      index += 1
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  return {
    keepTemp,
    disableMcpServers,
  }
}

function normalize(output: string): string {
  return output.replace(/\r/g, '').trim()
}

async function runCommand(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  const child = Bun.spawn({
    cmd: args,
    cwd,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const stdoutPromise = new Response(child.stdout).text()
  const stderrPromise = new Response(child.stderr).text()
  const exitPromise = child.exited

  const timeoutHandle = setTimeout(() => {
    try {
      child.kill()
    } catch {}
  }, COMMAND_TIMEOUT_MS)

  let exitCode: number
  try {
    exitCode = await exitPromise
  } finally {
    clearTimeout(timeoutHandle)
  }

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise])

  return {
    args,
    exitCode,
    stdout,
    stderr,
  }
}

function assertZeroExit(result: CommandResult, description: string): void {
  if (result.exitCode !== 0) {
    throw new Error(
      `${description} failed with exit ${result.exitCode}: ${normalize(
        result.stderr || result.stdout,
      )}`,
    )
  }
}

function assertExactOutput(
  result: CommandResult,
  description: string,
  expected: string,
): void {
  const output = normalize(result.stdout)
  if (output !== expected) {
    throw new Error(
      `${description} expected stdout ${JSON.stringify(expected)}, got ${JSON.stringify(output)}`,
    )
  }
}

function assertOutputContains(
  result: CommandResult,
  description: string,
  expectedSubstring: string,
): void {
  const output = normalize(result.stdout)
  if (!output.includes(expectedSubstring)) {
    throw new Error(
      `${description} expected stdout to include ${JSON.stringify(expectedSubstring)}, got ${JSON.stringify(output)}`,
    )
  }
}

async function main(): Promise<void> {
  const repoRoot = process.cwd()
  const bunPath = Bun.which('bun') ?? process.execPath
  const options = parseArgs(process.argv.slice(2))
  const keepTemp = options.keepTemp
  const baseEnv = { ...process.env }
  if (options.disableMcpServers) {
    baseEnv.NEKO_CODE_DISABLED_MCP_SERVERS = options.disableMcpServers
  }
  const tempRoot = await mkdtemp(join(tmpdir(), 'neko-native-install-'))
  const installDir = join(tempRoot, 'bin')

  await mkdir(installDir, { recursive: true })
  const mockServer = startOpenAICompatibleSmokeServer({ defaultReply: 'OK' })

  try {
    const installScript = join(repoRoot, 'scripts', 'install-local-launcher.ps1')
    const installResult = await runCommand(
      [
        'powershell',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        installScript,
        '-InstallDir',
        installDir,
        '-SkipPathUpdate',
        '-Force',
        '-RepoRoot',
        repoRoot,
      ],
      repoRoot,
      baseEnv,
    )
    assertZeroExit(installResult, 'install-local-launcher')

    const pathEnv = process.env.PATH ?? process.env.Path ?? ''
    const pathWithInstall = `${installDir}${delimiter}${pathEnv}`
    const childEnv = createOpenAICompatibleSmokeEnv(
      { ...baseEnv, PATH: pathWithInstall, Path: pathWithInstall },
      mockServer.baseUrl,
    )

    console.log('[RUN] installed --version')
    const versionResult = await runCommand(['neko', '--version'], tempRoot, childEnv)
    assertZeroExit(versionResult, '--version')

    console.log('[RUN] installed --help')
    const helpResult = await runCommand(['neko', '--help'], tempRoot, childEnv)
    assertZeroExit(helpResult, '--help')
    assertOutputContains(helpResult, '--help', 'Usage: neko')

    console.log('[RUN] installed doctor --help')
    const doctorHelpResult = await runCommand(
      ['neko', 'doctor', '--help'],
      tempRoot,
      childEnv,
    )
    assertZeroExit(doctorHelpResult, 'doctor --help')
    assertOutputContains(doctorHelpResult, 'doctor --help', 'doctor')

    console.log('[RUN] installed install --help')
    const installHelpResult = await runCommand(
      ['neko', 'install', '--help'],
      tempRoot,
      childEnv,
    )
    assertZeroExit(installHelpResult, 'install --help')
    assertOutputContains(installHelpResult, 'install --help', 'install')

    console.log('[RUN] installed update --help')
    const updateHelpResult = await runCommand(
      ['neko', 'update', '--help'],
      tempRoot,
      childEnv,
    )
    assertZeroExit(updateHelpResult, 'update --help')
    assertOutputContains(updateHelpResult, 'update --help', 'update')

    const smokePrompt = 'Reply with exactly OK'
    const nativeSmokeArgs = ['neko', '-p', '--max-turns', '1', smokePrompt]
    const sourceSmokeArgs = [
      bunPath,
      'src/entrypoints/cli.tsx',
      '-p',
      '--max-turns',
      '1',
      smokePrompt,
    ]

    console.log('[RUN] installed -p smoke')
    const nativeSmoke = await runCommand(nativeSmokeArgs, tempRoot, childEnv)
    console.log('[RUN] source -p smoke')
    const sourceSmoke = await runCommand(sourceSmokeArgs, repoRoot, childEnv)

    const nativeOutput = normalize(nativeSmoke.stdout)
    const sourceOutput = normalize(sourceSmoke.stdout)

    assertZeroExit(nativeSmoke, 'installed (-p)')
    assertZeroExit(sourceSmoke, 'source (-p)')
    assertExactOutput(nativeSmoke, 'installed (-p)', 'OK')
    assertExactOutput(sourceSmoke, 'source (-p)', 'OK')

    if (nativeSmoke.exitCode !== sourceSmoke.exitCode) {
      throw new Error(
        `Installed (-p) exit ${nativeSmoke.exitCode} differs from source ${sourceSmoke.exitCode}`,
      )
    }

    if (nativeOutput !== sourceOutput) {
      throw new Error(
        `Installed (-p) output mismatch:\n  native: ${nativeOutput}\n  source: ${sourceOutput}`,
      )
    }

    console.log('[PASS] native-local-install-smoke')
    console.log(`  installDir=${installDir}`)
    console.log(`  version=${normalize(versionResult.stdout)}`)
    console.log(`  help=${normalize(helpResult.stdout.split('\n')[0] ?? '')}`)
    console.log(
      `  commandHelp=doctor:${normalize(doctorHelpResult.stdout.split('\n')[0] ?? '')} | install:${normalize(installHelpResult.stdout.split('\n')[0] ?? '')} | update:${normalize(updateHelpResult.stdout.split('\n')[0] ?? '')}`,
    )
    console.log(`  nativeExit=${nativeSmoke.exitCode}`)
    console.log(`  nativeOutput=${nativeOutput}`)
    console.log(`  sourceExit=${sourceSmoke.exitCode}`)
    console.log(`  sourceOutput=${sourceOutput}`)
  } finally {
    mockServer.stop()

    if (!keepTemp) {
      await rm(tempRoot, { recursive: true, force: true })
    } else {
      console.log(`[INFO] temp install preserved at ${tempRoot}`)
    }
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
