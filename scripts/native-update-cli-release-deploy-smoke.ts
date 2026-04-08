#!/usr/bin/env bun

import { existsSync } from 'node:fs'
import { copyFile, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'

type SmokeOptions = {
  keepTemp: boolean
  skipStageDeploy: boolean
}

type DeployMetadata = {
  version: string
  platform: string
  signed: boolean
  publishedBinary: string
}

type UploadManifest = {
  version: string
  entries: Array<{
    source: string
    destination: string
  }>
}

type CommandResult = {
  exitCode: number
  stdout: string
  stderr: string
}

function parseArgs(argv: string[]): SmokeOptions {
  let keepTemp = false
  let skipStageDeploy = false

  for (const arg of argv) {
    if (arg === '--keep-temp') {
      keepTemp = true
      continue
    }

    if (arg === '--skip-stage-deploy') {
      skipStageDeploy = true
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  return { keepTemp, skipStageDeploy }
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

function getContentType(path: string): string {
  const extension = extname(path).toLowerCase()
  if (extension === '.json') return 'application/json; charset=utf-8'
  if (extension === '.exe') return 'application/octet-stream'
  return 'text/plain; charset=utf-8'
}

async function main(): Promise<void> {
  const repoRoot = process.cwd()
  const options = parseArgs(process.argv.slice(2))

  if (!options.skipStageDeploy) {
    console.log('[RUN] build:native')
    const buildNative = await runCommand(
      ['bun', 'run', 'build:native'],
      repoRoot,
      process.env,
    )
    if (buildNative.exitCode !== 0) {
      throw new Error(
        `build:native failed: ${normalize(buildNative.stderr || buildNative.stdout)}`,
      )
    }

    console.log('[RUN] stage-release-deploy')
    const stageDeploy = await runCommand(
      ['bun', 'run', 'scripts/stage-release-deploy.ts'],
      repoRoot,
      process.env,
    )
    if (stageDeploy.exitCode !== 0) {
      throw new Error(
        `stage-release-deploy failed: ${normalize(stageDeploy.stderr || stageDeploy.stdout)}`,
      )
    }
  }

  const packageJson = JSON.parse(
    await readFile(join(repoRoot, 'package.json'), 'utf8'),
  ) as { version: string }
  const version = packageJson.version
  const deployRoot = join(repoRoot, 'dist', 'release-deploy', version)
  const deployMetadata = JSON.parse(
    await readFile(join(deployRoot, 'release-deploy.json'), 'utf8'),
  ) as DeployMetadata
  const uploadManifest = JSON.parse(
    await readFile(join(deployRoot, 'upload-manifest.json'), 'utf8'),
  ) as UploadManifest

  const publishRoot = await mkdtemp(join(tmpdir(), 'neko-native-update-release-deploy-publish-'))
  for (const entry of uploadManifest.entries) {
    const sourcePath = join(deployRoot, entry.source)
    const destinationPath = join(publishRoot, entry.destination)
    await mkdir(dirname(destinationPath), { recursive: true })
    await copyFile(sourcePath, destinationPath)
  }

  const servedRoot = resolve(publishRoot)
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      const filePath = resolve(servedRoot, relativePath)

      if (!filePath.startsWith(servedRoot)) {
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
  const tempRoot = await mkdtemp(join(tmpdir(), 'neko-native-update-release-deploy-'))
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
  const { installLatest } = await import('../src/utils/nativeInstaller/index.js')

  enableConfigs()

  const installResult = await installLatest('latest', true)
  if (!installResult.wasUpdated || installResult.latestVersion !== deployMetadata.version) {
    throw new Error(`Unexpected install result: ${JSON.stringify(installResult)}`)
  }

  const installedBinary = join(binDir, deployMetadata.publishedBinary.split('/').pop() ?? 'neko.exe')
  if (!existsSync(installedBinary)) {
    throw new Error(`Installed binary missing at ${installedBinary}`)
  }

  const childEnv = {
    ...process.env,
    NODE_ENV: 'production',
    NEKO_CODE_NATIVE_INSTALLER_BASE_URL: baseUrl,
    NEKO_CODE_DISABLED_MCP_SERVERS: process.env.NEKO_CODE_DISABLED_MCP_SERVERS
      ? `${process.env.NEKO_CODE_DISABLED_MCP_SERVERS},serena`
      : 'serena',
  }

  const updateResult = await runCommand([installedBinary, 'update'], tempRoot, childEnv)
  if (updateResult.exitCode !== 0) {
    throw new Error(`installed update failed: ${normalize(updateResult.stderr || updateResult.stdout)}`)
  }

  const output = `${updateResult.stdout}\n${updateResult.stderr}`
  if (
    !output.includes('Checking for updates to latest version')
    || !output.includes('No newer native update was detected')
  ) {
    throw new Error(`unexpected update output: ${normalize(output)}`)
  }

  server.stop(true)

  console.log('[PASS] native-update-cli-release-deploy-smoke')
  console.log(`  baseUrl=${baseUrl}`)
  console.log(`  version=${deployMetadata.version}`)
  console.log(`  platform=${deployMetadata.platform}`)
  console.log(`  signed=${deployMetadata.signed}`)
  console.log(`  publishRoot=${publishRoot}`)
  console.log(`  installedBinary=${installedBinary}`)
  console.log(`  updateOutput=${normalize(updateResult.stdout)}`)

  if (!options.keepTemp) {
    await rm(tempRoot, { recursive: true, force: true })
    await rm(publishRoot, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
