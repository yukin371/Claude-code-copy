#!/usr/bin/env bun

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'

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

async function waitForFile(path: string): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (existsSync(path)) {
      return true
    }
    await Bun.sleep(500)
  }

  return existsSync(path)
}

function getContentType(path: string): string {
  const extension = extname(path).toLowerCase()
  if (extension === '.json') return 'application/json; charset=utf-8'
  if (extension === '.exe') return 'application/octet-stream'
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

async function sha256(filePath: string): Promise<string> {
  const content = await readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

async function stageSyntheticUpgrade(
  repoRoot: string,
  publishRoot: string,
  platform: string,
  nextVersion: string,
): Promise<void> {
  const nextBinaryDir = join(publishRoot, nextVersion, platform)
  const nextBinaryPath = join(nextBinaryDir, 'neko.exe')
  const nextManifestPath = join(publishRoot, nextVersion, 'manifest.json')
  const stubEntry = join(publishRoot, '__synthetic-update-entry.ts')

  await mkdir(nextBinaryDir, { recursive: true })
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
      `  console.log(\`Synthetic release payload \${version}\`);`,
      `}`,
      '',
    ].join('\n'),
    'utf8',
  )

  const buildResult = await runCommand(
    ['bun', 'build', '--compile', stubEntry, '--outfile', nextBinaryPath],
    repoRoot,
    process.env,
  )
  if (buildResult.exitCode !== 0) {
    throw new Error(
      `synthetic upgrade build failed: ${normalize(buildResult.stderr || buildResult.stdout)}`,
    )
  }

  const checksum = await sha256(nextBinaryPath)
  await writeFile(
    nextManifestPath,
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
  await writeFile(join(publishRoot, 'latest'), `${nextVersion}\n`, 'utf8')
  await writeFile(
    join(publishRoot, 'publish-ready', 'channels', 'latest.json'),
    `${JSON.stringify(
      {
        channel: 'latest',
        version: nextVersion,
        platform,
        generatedAt: new Date().toISOString(),
        artifact: `${nextVersion}/${platform}/neko.exe`,
        sha256: checksum,
        signed: false,
        signingStatus: 'synthetic-smoke',
        manifest: `${nextVersion}/manifest.json`,
        sourceArtifact: 'synthetic-update-entry.ts',
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  await rm(stubEntry, { force: true })
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
  const publishRoot = await mkdtemp(join(tmpdir(), 'neko-native-update-release-deploy-publish-'))
  const publishResult = await runCommand(
    [
      'bun',
      'run',
      'scripts/release-deploy-publish.ts',
      '--skip-stage-deploy',
      '--target-root',
      publishRoot,
    ],
    repoRoot,
    process.env,
  )
  if (publishResult.exitCode !== 0) {
    throw new Error(
      `release-deploy-publish failed: ${normalize(publishResult.stderr || publishResult.stdout)}`,
    )
  }

  const servedRoot = resolve(publishRoot)
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      const filePath = resolve(servedRoot, relativePath)

      if (!isPathInsideRoot(servedRoot, filePath)) {
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

  const beforeVersionResult = await runCommand([installedBinary, '--version'], tempRoot, {
    ...process.env,
    NEKO_CODE_DISABLED_MCP_SERVERS: process.env.NEKO_CODE_DISABLED_MCP_SERVERS
      ? `${process.env.NEKO_CODE_DISABLED_MCP_SERVERS},serena`
      : 'serena',
  })
  if (
    beforeVersionResult.exitCode !== 0
    || !beforeVersionResult.stdout.includes(`${deployMetadata.version} (Neko Code)`)
  ) {
    throw new Error(
      `installed --version before update failed: ${normalize(beforeVersionResult.stderr || beforeVersionResult.stdout)}`,
    )
  }

  const nextVersion = getNextPatchVersion(deployMetadata.version)
  await stageSyntheticUpgrade(repoRoot, publishRoot, deployMetadata.platform, nextVersion)
  const expectedInstalledVersionBinary = join(dataDir, 'claude', 'versions', nextVersion)
  const expectedPublishedBinary = join(
    publishRoot,
    nextVersion,
    deployMetadata.platform,
    'neko.exe',
  )

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

  if (!(await waitForFile(expectedInstalledVersionBinary))) {
    throw new Error(
      `updated version binary missing at ${expectedInstalledVersionBinary} | updateOutput=${normalize(updateResult.stdout || updateResult.stderr)}`,
    )
  }

  const [installedVersionChecksum, publishedVersionChecksum] = await Promise.all([
    sha256(expectedInstalledVersionBinary),
    sha256(expectedPublishedBinary),
  ])
  if (installedVersionChecksum !== publishedVersionChecksum) {
    throw new Error(
      `updated version binary checksum mismatch: installed=${installedVersionChecksum} expected=${publishedVersionChecksum}`,
    )
  }

  const afterVersionResult = await waitForVersion(
    installedBinary,
    tempRoot,
    childEnv,
    nextVersion,
  )
  const launcherUpgraded =
    afterVersionResult.exitCode === 0
    && afterVersionResult.stdout.includes(`${nextVersion} (Neko Code)`)

  server.stop(true)

  console.log('[PASS] native-update-cli-release-deploy-smoke')
  console.log(`  baseUrl=${baseUrl}`)
  console.log(`  version=${deployMetadata.version}`)
  console.log(`  upgradedVersion=${nextVersion}`)
  console.log(`  platform=${deployMetadata.platform}`)
  console.log(`  signed=${deployMetadata.signed}`)
  console.log(`  publishRoot=${publishRoot}`)
  console.log(`  installedBinary=${installedBinary}`)
  console.log(`  installedVersionBinary=${expectedInstalledVersionBinary}`)
  console.log(`  launcherUpgraded=${launcherUpgraded}`)
  console.log(
    `  updateOutput=${normalize(updateResult.stdout || updateResult.stderr) || '[no direct stdout captured]'}`,
  )

  if (!options.keepTemp) {
    await rm(tempRoot, { recursive: true, force: true })
    await rm(publishRoot, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
