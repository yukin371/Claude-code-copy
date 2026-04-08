#!/usr/bin/env bun

import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type SmokeOptions = {
  keepTemp: boolean
  skipStageNativeInstaller: boolean
}

type NativeInstallerMetadata = {
  version: string
  platform: string
  signed: boolean
  packageBinary: string
  installScript: string
  installCmd: string
  packageManifest: string
  packageArchive: string
  nsisScript: string
  nsisBuildScript: string
  nsisMetadata: string
}

type CommandResult = {
  exitCode: number
  stdout: string
  stderr: string
}

function parseArgs(argv: string[]): SmokeOptions {
  let keepTemp = false
  let skipStageNativeInstaller = false

  for (const arg of argv) {
    if (arg === '--keep-temp') {
      keepTemp = true
      continue
    }

    if (arg === '--skip-stage-native-installer') {
      skipStageNativeInstaller = true
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  return { keepTemp, skipStageNativeInstaller }
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

  return { exitCode, stdout, stderr }
}

function normalize(text: string): string {
  return text.replace(/\r/g, '').trim()
}

function toPowerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

async function main(): Promise<void> {
  const repoRoot = process.cwd()
  const options = parseArgs(process.argv.slice(2))

  if (!options.skipStageNativeInstaller) {
    console.log('[RUN] stage-native-installer')
    const stageInstaller = await runCommand(
      ['bun', 'run', 'scripts/stage-native-installer.ts'],
      repoRoot,
      process.env,
    )
    if (stageInstaller.exitCode !== 0) {
      throw new Error(
        `stage-native-installer failed: ${normalize(stageInstaller.stderr || stageInstaller.stdout)}`,
      )
    }
  }

  const packageJson = JSON.parse(
    await readFile(join(repoRoot, 'package.json'), 'utf8'),
  ) as { version: string }
  const installerRoot = join(repoRoot, 'dist', 'native-installer', packageJson.version)
  const metadata = JSON.parse(
    await readFile(join(installerRoot, 'native-installer.json'), 'utf8'),
  ) as NativeInstallerMetadata
  const packageManifest = JSON.parse(
    await readFile(join(installerRoot, metadata.packageManifest), 'utf8'),
  ) as {
    version: string
    binary: string
    binarySha256: string
    installScript: string
  }
  const nsisMetadata = JSON.parse(
    await readFile(join(installerRoot, metadata.nsisMetadata), 'utf8'),
  ) as {
    builder: string
    script: string
    buildScript: string
    expectedOutput: string
  }

  if (metadata.version !== packageJson.version) {
    throw new Error('native installer metadata version mismatch')
  }
  if (packageManifest.version !== packageJson.version) {
    throw new Error('native installer package manifest version mismatch')
  }
  if (nsisMetadata.builder !== 'nsis') {
    throw new Error('native installer nsis metadata builder mismatch')
  }
  if (nsisMetadata.script !== 'neko-code-installer.nsi') {
    throw new Error('native installer nsis script mismatch')
  }
  if (nsisMetadata.buildScript !== 'build-installer.ps1') {
    throw new Error('native installer nsis build script mismatch')
  }

  const tempRoot = await mkdtemp(join(tmpdir(), 'neko-stage-native-installer-'))
  const extractedRoot = join(tempRoot, 'portable-installer')
  const binDir = join(tempRoot, 'bin')
  const installedBinary = join(binDir, packageManifest.binary)
  const childEnv = {
    ...process.env,
    NEKO_CODE_DISABLED_MCP_SERVERS: process.env.NEKO_CODE_DISABLED_MCP_SERVERS
      ? `${process.env.NEKO_CODE_DISABLED_MCP_SERVERS},serena`
      : 'serena',
  }

  const extractResult = await runCommand(
    [
      'powershell',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `
$ErrorActionPreference = 'Stop'
$archive = ${toPowerShellLiteral(join(installerRoot, metadata.packageArchive))}
$destination = ${toPowerShellLiteral(extractedRoot)}
Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force
      `,
    ],
    tempRoot,
    childEnv,
  )

  if (extractResult.exitCode !== 0) {
    throw new Error(`portable installer archive extraction failed: ${normalize(extractResult.stderr || extractResult.stdout)}`)
  }

  const nsisDryRunResult = await runCommand(
    [
      'powershell',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(installerRoot, metadata.nsisBuildScript),
      '-DryRun',
    ],
    tempRoot,
    childEnv,
  )

  if (nsisDryRunResult.exitCode !== 0) {
    throw new Error(`nsis dry-run failed: ${normalize(nsisDryRunResult.stderr || nsisDryRunResult.stdout)}`)
  }
  const nsisPlanOutput = normalize(nsisDryRunResult.stdout)
  const expectedNsisOutput = nsisMetadata.expectedOutput.replace(/\//g, '\\')
  if (!nsisPlanOutput.includes('[PLAN] nsis-build')) {
    throw new Error('nsis dry-run output missing plan header')
  }
  if (
    !nsisPlanOutput.includes(expectedNsisOutput)
    && !nsisPlanOutput.includes(expectedNsisOutput.split('\\').at(-1) ?? '')
  ) {
    throw new Error('nsis dry-run output missing expected output path')
  }

  const installResult = await runCommand(
    [
      'powershell',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(extractedRoot, packageManifest.installScript),
      '-InstallDir',
      binDir,
      '-SkipPathUpdate',
    ],
    tempRoot,
    childEnv,
  )

  if (installResult.exitCode !== 0) {
    throw new Error(`install.ps1 failed: ${normalize(installResult.stderr || installResult.stdout)}`)
  }
  if (!existsSync(installedBinary)) {
    throw new Error(`Installed binary missing at ${installedBinary}`)
  }

  const versionResult = await runCommand([installedBinary, '--version'], tempRoot, childEnv)
  const helpResult = await runCommand([installedBinary, '--help'], tempRoot, childEnv)
  const updateHelpResult = await runCommand([installedBinary, 'update', '--help'], tempRoot, childEnv)

  if (versionResult.exitCode !== 0) {
    throw new Error(`installed --version failed: ${normalize(versionResult.stderr || versionResult.stdout)}`)
  }
  if (helpResult.exitCode !== 0) {
    throw new Error(`installed --help failed: ${normalize(helpResult.stderr || helpResult.stdout)}`)
  }
  if (updateHelpResult.exitCode !== 0) {
    throw new Error(`installed update --help failed: ${normalize(updateHelpResult.stderr || updateHelpResult.stdout)}`)
  }

  console.log('[PASS] stage-native-installer-smoke')
  console.log(`  installerRoot=${installerRoot}`)
  console.log(`  version=${metadata.version}`)
  console.log(`  platform=${metadata.platform}`)
  console.log(`  signed=${metadata.signed}`)
  console.log(`  packageArchive=${join(installerRoot, metadata.packageArchive)}`)
  console.log(`  nsisScript=${join(installerRoot, metadata.nsisScript)}`)
  console.log(`  nsisPlan=${normalize(nsisDryRunResult.stdout.split('\n').join(' | '))}`)
  console.log(`  installedBinary=${installedBinary}`)
  console.log(`  versionOutput=${normalize(versionResult.stdout)}`)
  console.log(`  helpOutput=${normalize(helpResult.stdout.split('\n')[0] ?? '')}`)
  console.log(`  updateHelp=${normalize(updateHelpResult.stdout.split('\n')[0] ?? '')}`)

  if (!options.keepTemp) {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
