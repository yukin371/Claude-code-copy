#!/usr/bin/env bun

import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'

type SmokeOptions = {
  keepTemp: boolean
  skipStageGithubRelease: boolean
}

type GithubReleaseMetadata = {
  version: string
  tagName: string
  assetsDir: string
  primaryAsset: string
  assets: Array<{
    name: string
  }>
}

type CommandResult = {
  exitCode: number
  stdout: string
  stderr: string
}

function parseArgs(argv: string[]): SmokeOptions {
  let keepTemp = false
  let skipStageGithubRelease = false

  for (const arg of argv) {
    if (arg === '--keep-temp') {
      keepTemp = true
      continue
    }

    if (arg === '--skip-stage-github-release') {
      skipStageGithubRelease = true
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  return { keepTemp, skipStageGithubRelease }
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
  if (extension === '.md') return 'text/markdown; charset=utf-8'
  return 'text/plain; charset=utf-8'
}

async function main(): Promise<void> {
  const repoRoot = process.cwd()
  const options = parseArgs(process.argv.slice(2))

  if (!options.skipStageGithubRelease) {
    console.log('[RUN] stage-github-release')
    const stageGithubRelease = await runCommand(
      ['bun', 'run', 'scripts/stage-github-release-smoke.ts'],
      repoRoot,
      process.env,
    )
    if (stageGithubRelease.exitCode !== 0) {
      throw new Error(
        `stage-github-release failed: ${normalize(stageGithubRelease.stderr || stageGithubRelease.stdout)}`,
      )
    }
  }

  const packageJson = JSON.parse(
    await readFile(join(repoRoot, 'package.json'), 'utf8'),
  ) as { version: string }
  const version = packageJson.version
  const githubReleaseRoot = join(repoRoot, 'dist', 'github-release', version)
  const metadata = JSON.parse(
    await readFile(join(githubReleaseRoot, 'release-github.json'), 'utf8'),
  ) as GithubReleaseMetadata
  const assetsRoot = join(githubReleaseRoot, metadata.assetsDir)
  const requestLog: string[] = []
  const releaseResponse = {
    tag_name: metadata.tagName,
    draft: false,
    prerelease: true,
    assets: metadata.assets.map(asset => ({
      name: asset.name,
      browser_download_url: `__BASE_URL__/download/${asset.name}`,
    })),
  }

  const serveRoot = resolve(assetsRoot)
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      requestLog.push(url.pathname + url.search)

      if (url.pathname === '/repos/test/repo/releases/latest') {
        return Response.json({
          ...releaseResponse,
          prerelease: false,
        })
      }

      if (url.pathname === '/repos/test/repo/releases') {
        return Response.json([releaseResponse])
      }

      if (url.pathname === `/repos/test/repo/releases/tags/${metadata.tagName}`) {
        return Response.json({
          ...releaseResponse,
          assets: releaseResponse.assets.map(asset => ({
            ...asset,
            browser_download_url: asset.browser_download_url.replace(
              '__BASE_URL__',
              `http://127.0.0.1:${server.port}`,
            ),
          })),
        })
      }

      if (url.pathname.startsWith('/download/')) {
        const assetName = decodeURIComponent(url.pathname.replace('/download/', ''))
        const filePath = resolve(serveRoot, assetName)

        if (!filePath.startsWith(serveRoot)) {
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
      }

      return new Response('not found', { status: 404 })
    },
  })

  const apiBaseUrl = `http://127.0.0.1:${server.port}`
  const tempRoot = await mkdtemp(join(tmpdir(), 'neko-native-update-github-release-'))
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
  delete process.env.NEKO_CODE_NATIVE_INSTALLER_BASE_URL
  process.env.NEKO_CODE_NATIVE_INSTALLER_GITHUB_REPO = 'test/repo'
  process.env.NEKO_CODE_NATIVE_INSTALLER_GITHUB_API_BASE_URL = apiBaseUrl
  process.env.PATH = `${binDir};${process.env.PATH ?? ''}`

  const { enableConfigs } = await import('../src/utils/config.js')
  const { installLatest } = await import('../src/utils/nativeInstaller/index.js')

  enableConfigs()

  const installResult = await installLatest('latest', true)
  const installRequests = requestLog.splice(0)
  if (!installResult.wasUpdated || installResult.latestVersion !== version) {
    throw new Error(`Unexpected install result: ${JSON.stringify(installResult)}`)
  }

  const installedBinary = join(binDir, 'neko.exe')
  if (!existsSync(installedBinary)) {
    throw new Error(`Installed binary missing at ${installedBinary}`)
  }

  const childEnv = {
    ...process.env,
    NODE_ENV: 'production',
    NEKO_CODE_NATIVE_INSTALLER_GITHUB_REPO: 'test/repo',
    NEKO_CODE_NATIVE_INSTALLER_GITHUB_API_BASE_URL: apiBaseUrl,
    NEKO_CODE_DISABLED_MCP_SERVERS: process.env.NEKO_CODE_DISABLED_MCP_SERVERS
      ? `${process.env.NEKO_CODE_DISABLED_MCP_SERVERS},serena`
      : 'serena',
  }

  const updateResult = await runCommand([installedBinary, 'update'], tempRoot, childEnv)
  if (updateResult.exitCode !== 0) {
    throw new Error(
      `installed update failed: ${normalize(updateResult.stderr || updateResult.stdout)} | installRequests=${installRequests.join(' -> ')} | updateRequests=${requestLog.join(' -> ')}`,
    )
  }

  const output = `${updateResult.stdout}\n${updateResult.stderr}`
  if (
    !output.includes('Checking for updates to latest version')
    || !output.includes('No newer native update was detected')
  ) {
    throw new Error(
      `unexpected update output: ${normalize(output)} | installRequests=${installRequests.join(' -> ')} | updateRequests=${requestLog.join(' -> ')}`,
    )
  }

  server.stop(true)

  console.log('[PASS] native-update-cli-github-release-smoke')
  console.log(`  apiBaseUrl=${apiBaseUrl}`)
  console.log(`  version=${version}`)
  console.log(`  tag=${metadata.tagName}`)
  console.log(`  installedBinary=${installedBinary}`)
  console.log(`  updateOutput=${normalize(updateResult.stdout)}`)

  if (!options.keepTemp) {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
