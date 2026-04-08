#!/usr/bin/env bun

import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'

type SmokeOptions = {
  keepTemp: boolean
  skipBuild: boolean
}

type BundleMetadata = {
  version: string
  platform: string
  binaryName: string
  checksum: string
  bundleRoot: string
}

type CommandResult = {
  exitCode: number
  stdout: string
  stderr: string
}

function parseArgs(argv: string[]): SmokeOptions {
  let keepTemp = false
  let skipBuild = false

  for (const arg of argv) {
    if (arg === '--keep-temp') {
      keepTemp = true
      continue
    }

    if (arg === '--skip-build') {
      skipBuild = true
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  return { keepTemp, skipBuild }
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
    exitCode,
    stdout,
    stderr,
  }
}

function normalize(text: string): string {
  return text.replace(/\r/g, '').trim()
}

function getContentType(path: string): string {
  const extension = extname(path).toLowerCase()
  if (extension === '.json') return 'application/json; charset=utf-8'
  if (extension === '.exe') return 'application/octet-stream'
  return 'text/plain; charset=utf-8'
}

async function main(): Promise<void> {
  const repoRoot = process.cwd()
  const options = parseArgs(process.argv.slice(2))

  console.log('[RUN] build-local-release-bundle')
  const buildBundle = await runCommand(
    options.skipBuild
      ? ['bun', 'run', 'scripts/build-local-release-bundle.ts', '--skip-build']
      : ['bun', 'run', 'build:local-release-bundle'],
    repoRoot,
    process.env,
  )
  if (buildBundle.exitCode !== 0) {
    throw new Error(
      `build:local-release-bundle failed: ${normalize(buildBundle.stderr || buildBundle.stdout)}`,
    )
  }

  const metadata = JSON.parse(
    await readFile(join(repoRoot, 'dist', 'release-local', 'release.json'), 'utf8'),
  ) as BundleMetadata
  const bundleRoot = resolve(metadata.bundleRoot)

  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      const filePath = resolve(bundleRoot, relativePath)

      if (!filePath.startsWith(bundleRoot)) {
        return new Response('forbidden', { status: 403 })
      }

      if (!existsSync(filePath)) {
        return new Response('not found', { status: 404 })
      }

      return new Response(Bun.file(filePath), {
        headers: {
          'content-type': getContentType(filePath),
        },
      })
    },
  })

  const baseUrl = `http://127.0.0.1:${server.port}`
  const tempRoot = await mkdtemp(join(tmpdir(), 'neko-native-installer-local-bundle-'))
  const homeDir = join(tempRoot, 'home')
  const configDir = join(tempRoot, 'config')
  const dataDir = join(tempRoot, 'xdg-data')
  const cacheDir = join(tempRoot, 'xdg-cache')
  const stateDir = join(tempRoot, 'xdg-state')
  const binDir = join(homeDir, '.local', 'bin')

  process.env.HOME = homeDir
  process.env.USERPROFILE = homeDir
  process.env.NEKO_CODE_CONFIG_DIR = configDir
  process.env.XDG_DATA_HOME = dataDir
  process.env.XDG_CACHE_HOME = cacheDir
  process.env.XDG_STATE_HOME = stateDir
  process.env.NEKO_CODE_NATIVE_INSTALLER_BASE_URL = baseUrl
  process.env.PATH = `${binDir};${process.env.PATH ?? ''}`

  const { enableConfigs } = await import('../src/utils/config.js')
  const { checkInstall, installLatest } = await import(
    '../src/utils/nativeInstaller/index.js'
  )

  enableConfigs()

  const installResult = await installLatest('latest', true)
  if (!installResult.wasUpdated || installResult.latestVersion !== metadata.version) {
    throw new Error(
      `Unexpected install result: ${JSON.stringify(installResult)}`,
    )
  }

  const setupMessages = await checkInstall(true)
  const setupErrors = setupMessages.filter(message => message.type === 'error')
  if (setupErrors.length > 0) {
    throw new Error(
      `checkInstall reported errors: ${setupErrors.map(message => message.message).join(' | ')}`,
    )
  }

  const installedBinary = join(binDir, metadata.binaryName)
  if (!existsSync(installedBinary)) {
    throw new Error(`Installed binary missing at ${installedBinary}`)
  }

  const childEnv = {
    ...process.env,
    NEKO_CODE_DISABLED_MCP_SERVERS: process.env.NEKO_CODE_DISABLED_MCP_SERVERS
      ? `${process.env.NEKO_CODE_DISABLED_MCP_SERVERS},serena`
      : 'serena',
  }

  const versionResult = await runCommand([installedBinary, '--version'], tempRoot, childEnv)
  const helpResult = await runCommand([installedBinary, '--help'], tempRoot, childEnv)
  const doctorHelpResult = await runCommand(
    [installedBinary, 'doctor', '--help'],
    tempRoot,
    childEnv,
  )
  const installHelpResult = await runCommand(
    [installedBinary, 'install', '--help'],
    tempRoot,
    childEnv,
  )
  const updateHelpResult = await runCommand(
    [installedBinary, 'update', '--help'],
    tempRoot,
    childEnv,
  )

  if (versionResult.exitCode !== 0) {
    throw new Error(`installed --version failed: ${normalize(versionResult.stderr || versionResult.stdout)}`)
  }
  if (helpResult.exitCode !== 0) {
    throw new Error(`installed --help failed: ${normalize(helpResult.stderr || helpResult.stdout)}`)
  }
  if (doctorHelpResult.exitCode !== 0) {
    throw new Error(`installed doctor --help failed: ${normalize(doctorHelpResult.stderr || doctorHelpResult.stdout)}`)
  }
  if (installHelpResult.exitCode !== 0) {
    throw new Error(`installed install --help failed: ${normalize(installHelpResult.stderr || installHelpResult.stdout)}`)
  }
  if (updateHelpResult.exitCode !== 0) {
    throw new Error(`installed update --help failed: ${normalize(updateHelpResult.stderr || updateHelpResult.stdout)}`)
  }

  server.stop(true)

  console.log('[PASS] native-installer-local-bundle-smoke')
  console.log(`  baseUrl=${baseUrl}`)
  console.log(`  version=${metadata.version}`)
  console.log(`  platform=${metadata.platform}`)
  console.log(`  installedBinary=${installedBinary}`)
  console.log(`  versionOutput=${normalize(versionResult.stdout)}`)
  console.log(`  helpOutput=${normalize(helpResult.stdout.split('\n')[0] ?? '')}`)
  console.log(
    `  commandHelp=doctor:${normalize(doctorHelpResult.stdout.split('\n')[0] ?? '')} | install:${normalize(installHelpResult.stdout.split('\n')[0] ?? '')} | update:${normalize(updateHelpResult.stdout.split('\n')[0] ?? '')}`,
  )

  if (!options.keepTemp) {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
