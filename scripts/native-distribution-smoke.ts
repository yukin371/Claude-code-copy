#!/usr/bin/env bun

import { existsSync } from 'node:fs'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

function normalize(text: string): string {
  return text.replace(/\r/g, '').trim()
}

async function runCommand(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  const child = Bun.spawn(args, {
    cwd,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])

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

async function main(): Promise<void> {
  const repoRoot = process.cwd()
  const distBinary = join(repoRoot, 'dist', 'neko-code.exe')
  const options = parseArgs(process.argv.slice(2))
  const keepTemp = options.keepTemp
  const baseEnv = { ...process.env }
  if (options.disableMcpServers) {
    baseEnv.NEKO_CODE_DISABLED_MCP_SERVERS = options.disableMcpServers
  }

  const bunPath = Bun.which('bun') ?? process.execPath
  console.log('[RUN] bun run build:native')
  const buildResult = await runCommand([bunPath, 'run', 'build:native'], repoRoot, baseEnv)
  if (buildResult.exitCode !== 0) {
    console.error('[FAIL] build:native failed', buildResult.stderr || buildResult.stdout)
    process.exit(buildResult.exitCode ?? 1)
  }

  if (!existsSync(distBinary)) {
    throw new Error(`Compiled binary missing at ${distBinary}`)
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'neko-native-distribution-'))
  const stagedBinary = join(tempDir, 'neko-code.exe')
  await copyFile(distBinary, stagedBinary)

  console.log(`[INFO] Copied binary to temp dir ${tempDir}`)

  const childEnv = { ...baseEnv }

  const versionResult = await runCommand([stagedBinary, '--version'], tempDir, childEnv)
  if (versionResult.exitCode !== 0) {
    throw new Error(`--version failed: ${normalize(versionResult.stderr || versionResult.stdout)}`)
  }

  const helpResult = await runCommand([stagedBinary, '--help'], tempDir, childEnv)
  if (helpResult.exitCode !== 0) {
    throw new Error(`--help failed: ${normalize(helpResult.stderr || helpResult.stdout)}`)
  }

  const smokePrompt = 'Reply with exactly OK'
  const nativeSmokeArgs = [stagedBinary, '-p', '--max-turns', '1', smokePrompt]
  const sourceSmokeArgs = [bunPath, 'src/entrypoints/cli.tsx', '-p', '--max-turns', '1', smokePrompt]

  const nativeSmoke = await runCommand(nativeSmokeArgs, tempDir, childEnv)
  const sourceSmoke = await runCommand(sourceSmokeArgs, repoRoot, childEnv)

  assertZeroExit(nativeSmoke, 'native (-p)')
  assertZeroExit(sourceSmoke, 'source (-p)')

  const nativeOutput = normalize(nativeSmoke.stdout)
  const sourceOutput = normalize(sourceSmoke.stdout)
  const expectedSmokeOutput = 'OK'

  if (nativeOutput !== expectedSmokeOutput || sourceOutput !== expectedSmokeOutput) {
    throw new Error(
      `Smoke output mismatch:\n  native=${nativeOutput}\n  source=${sourceOutput}\n  expected=${expectedSmokeOutput}`,
    )
  }

  if (nativeOutput !== sourceOutput) {
    throw new Error(
      `Native (-p) output mismatch:\n  native: ${nativeOutput}\n  source: ${sourceOutput}`,
    )
  }

  console.log('[PASS] native-distribution-smoke')
  console.log(`  tempDir=${tempDir}`)
  console.log(`  version=${normalize(versionResult.stdout)}`)
  console.log(`  help=${normalize(helpResult.stdout.split('\n')[0] ?? '')}`)
  console.log(`  nativeExit=${nativeSmoke.exitCode}`)
  console.log(`  nativeOutput=${nativeOutput}`)
  console.log(`  sourceExit=${sourceSmoke.exitCode}`)
  console.log(`  sourceOutput=${sourceOutput}`)

  if (!keepTemp) {
    await rm(tempDir, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
