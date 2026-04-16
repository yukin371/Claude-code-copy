#!/usr/bin/env bun

import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'

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

type GitHubReleaseAsset = {
  name: string
  browser_download_url: string
}

type GitHubReleaseResponse = {
  tag_name: string
  draft: boolean
  prerelease: boolean
  assets: GitHubReleaseAsset[]
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

async function waitForVersion(
  binaryPath: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  expectedVersion: string,
): Promise<CommandResult> {
  let lastResult = await runCommand([binaryPath, '--version'], cwd, env)
  if (
    lastResult.exitCode === 0
    && lastResult.stdout.includes(`${expectedVersion} (Neko Code)`)
  ) {
    return lastResult
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await Bun.sleep(500)
    lastResult = await runCommand([binaryPath, '--version'], cwd, env)
    if (
      lastResult.exitCode === 0
      && lastResult.stdout.includes(`${expectedVersion} (Neko Code)`)
    ) {
      return lastResult
    }
  }

  return lastResult
}

function getContentType(path: string): string {
  const extension = extname(path).toLowerCase()
  if (extension === '.json') return 'application/json; charset=utf-8'
  if (extension === '.exe') return 'application/octet-stream'
  if (extension === '.md') return 'text/markdown; charset=utf-8'
  return 'text/plain; charset=utf-8'
}

function isPathInsideRoot(rootPath: string, candidatePath: string): boolean {
  const normalizedRoot = resolve(rootPath)
  const normalizedCandidate = resolve(candidatePath)
  const relativePath = relative(normalizedRoot, normalizedCandidate)

  return (
    relativePath === ''
    || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
  )
}

function getNextPatchVersion(version: string): string {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(.*)?$/)
  if (!match) {
    throw new Error(`Unsupported semver for upgrade smoke: ${version}`)
  }

  const [, major, minor, patch, suffix = ''] = match
  return `${major}.${minor}.${Number(patch) + 1}${suffix}`
}

function getPlatformFromPrimaryAsset(assetName: string, version: string): string {
  const prefix = `neko-code-${version}-`
  if (!assetName.startsWith(prefix) || !assetName.endsWith('.exe')) {
    throw new Error(`Unable to infer platform from primary asset: ${assetName}`)
  }

  return assetName.slice(prefix.length, -'.exe'.length)
}

async function sha256(filePath: string): Promise<string> {
  const content = await readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

async function createSyntheticGitHubAssets(
  repoRoot: string,
  assetsRoot: string,
  currentVersion: string,
  platform: string,
): Promise<{
  nextVersion: string
  binaryAssetName: string
  manifestAssetName: string
}> {
  const nextVersion = getNextPatchVersion(currentVersion)
  const binaryAssetName = `neko-code-${nextVersion}-${platform}.exe`
  const manifestAssetName = `neko-code-${nextVersion}-${platform}-manifest.json`
  const stubEntry = join(assetsRoot, '__synthetic-github-release-entry.ts')
  const binaryPath = join(assetsRoot, binaryAssetName)
  const manifestPath = join(assetsRoot, manifestAssetName)

  await writeFile(
    stubEntry,
    [
      `const version = ${JSON.stringify(nextVersion)};`,
      `const args = process.argv.slice(2);`,
      `if (args.includes('--version')) {`,
      `  console.log(\`\${version} (Neko Code)\`);`,
      `} else if (args.includes('--help')) {`,
      `  console.log('Usage: neko [options] [command] [prompt]');`,
      `} else {`,
      `  console.log(\`Synthetic GitHub release payload \${version}\`);`,
      `}`,
      '',
    ].join('\n'),
    'utf8',
  )

  const buildResult = await runCommand(
    ['bun', 'build', '--compile', stubEntry, '--outfile', binaryPath],
    repoRoot,
    process.env,
  )
  if (buildResult.exitCode !== 0) {
    throw new Error(
      `synthetic GitHub release build failed: ${normalize(buildResult.stderr || buildResult.stdout)}`,
    )
  }

  const checksum = await sha256(binaryPath)
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        version: nextVersion,
        generatedAt: new Date().toISOString(),
        platforms: {
          [platform]: {
            checksum,
          },
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  await rm(stubEntry, { force: true })

  return {
    nextVersion,
    binaryAssetName,
    manifestAssetName,
  }
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
  const installReleaseResponse: GitHubReleaseResponse = {
    tag_name: metadata.tagName,
    draft: false,
    prerelease: true,
    assets: metadata.assets.map(asset => ({
      name: asset.name,
      browser_download_url: `__BASE_URL__/download/${asset.name}`,
    })),
  }
  const syntheticAssets = await createSyntheticGitHubAssets(
    repoRoot,
    assetsRoot,
    metadata.version,
    getPlatformFromPrimaryAsset(metadata.primaryAsset, metadata.version),
  )
  const updateReleaseResponse: GitHubReleaseResponse = {
    tag_name: `v${syntheticAssets.nextVersion}`,
    draft: false,
    prerelease: true,
    assets: [
      {
        name: syntheticAssets.binaryAssetName,
        browser_download_url: `__BASE_URL__/download/${syntheticAssets.binaryAssetName}`,
      },
      {
        name: syntheticAssets.manifestAssetName,
        browser_download_url: `__BASE_URL__/download/${syntheticAssets.manifestAssetName}`,
      },
    ],
  }
  let releaseResponse: GitHubReleaseResponse = installReleaseResponse

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

      if (url.pathname === `/repos/test/repo/releases/tags/${releaseResponse.tag_name}`) {
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

        if (!isPathInsideRoot(serveRoot, filePath)) {
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

  const beforeVersionResult = await runCommand([installedBinary, '--version'], tempRoot, {
    ...process.env,
    NEKO_CODE_DISABLED_MCP_SERVERS: process.env.NEKO_CODE_DISABLED_MCP_SERVERS
      ? `${process.env.NEKO_CODE_DISABLED_MCP_SERVERS},serena`
      : 'serena',
  })
  if (
    beforeVersionResult.exitCode !== 0
    || !beforeVersionResult.stdout.includes(`${version} (Neko Code)`)
  ) {
    throw new Error(
      `installed --version before update failed: ${normalize(beforeVersionResult.stderr || beforeVersionResult.stdout)}`,
    )
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

  releaseResponse = updateReleaseResponse
  const updateResult = await runCommand([installedBinary, 'update'], tempRoot, childEnv)
  if (updateResult.exitCode !== 0) {
    throw new Error(
      `installed update failed: ${normalize(updateResult.stderr || updateResult.stdout)} | installRequests=${installRequests.join(' -> ')} | updateRequests=${requestLog.join(' -> ')}`,
    )
  }

  const output = `${updateResult.stdout}\n${updateResult.stderr}`
  const updateRequests = [...requestLog]
  const releaseLookupObserved = updateRequests.some(
    request =>
      request === '/repos/test/repo/releases?per_page=20'
      || request === `/repos/test/repo/releases/tags/v${syntheticAssets.nextVersion}`,
  )
  const assetDownloadObserved = updateRequests.some(
    request =>
      request === `/download/${syntheticAssets.binaryAssetName}`
      || request === `/download/${syntheticAssets.manifestAssetName}`,
  )
  const afterVersionResult = await waitForVersion(
    installedBinary,
    tempRoot,
    childEnv,
    syntheticAssets.nextVersion,
  )
  const launcherUpgraded =
    afterVersionResult.exitCode === 0
    && afterVersionResult.stdout.includes(`${syntheticAssets.nextVersion} (Neko Code)`)

  server.stop(true)

  console.log('[PASS] native-update-cli-github-release-smoke')
  console.log(`  apiBaseUrl=${apiBaseUrl}`)
  console.log(`  version=${version}`)
  console.log(`  upgradedVersion=${syntheticAssets.nextVersion}`)
  console.log(`  tag=${metadata.tagName}`)
  console.log(`  installedBinary=${installedBinary}`)
  console.log(`  releaseLookupObserved=${releaseLookupObserved}`)
  console.log(`  assetDownloadObserved=${assetDownloadObserved}`)
  console.log(`  launcherUpgraded=${launcherUpgraded}`)
  console.log(`  installRequests=${installRequests.join(' -> ') || '[none]'}`)
  console.log(`  updateRequests=${updateRequests.join(' -> ') || '[none]'}`)
  console.log(
    `  updateOutput=${normalize(output) || '[no direct stdout captured]'}`,
  )

  if (!options.keepTemp) {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
