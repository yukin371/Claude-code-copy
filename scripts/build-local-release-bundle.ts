#!/usr/bin/env bun

import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

type BundleOptions = {
  skipBuild: boolean
}

function parseArgs(argv: string[]): BundleOptions {
  let skipBuild = false

  for (const arg of argv) {
    if (arg === '--skip-build') {
      skipBuild = true
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  return { skipBuild }
}

async function runCommand(args: string[], cwd: string): Promise<void> {
  const child = Bun.spawn(args, {
    cwd,
    env: process.env,
    stdout: 'inherit',
    stderr: 'inherit',
  })

  const exitCode = await child.exited
  if (exitCode !== 0) {
    throw new Error(`${args.join(' ')} exited with ${exitCode}`)
  }
}

function getCurrentPlatform(): string {
  const platform =
    process.platform === 'win32' || process.platform === 'darwin'
      ? process.platform
      : 'linux'
  const arch =
    process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : null

  if (!arch) {
    throw new Error(`Unsupported architecture: ${process.arch}`)
  }

  return `${platform}-${arch}`
}

function getBinaryName(platform: string): string {
  return platform.startsWith('win32') ? 'neko.exe' : 'neko'
}

async function main(): Promise<void> {
  const repoRoot = process.cwd()
  const options = parseArgs(process.argv.slice(2))

  if (!options.skipBuild) {
    console.log('[RUN] build:native')
    await runCommand(['bun', 'run', 'build:native'], repoRoot)
  }

  const packageJson = JSON.parse(
    await readFile(join(repoRoot, 'package.json'), 'utf8'),
  ) as { version: string }
  const version = packageJson.version
  const platform = getCurrentPlatform()
  const binaryName = getBinaryName(platform)

  const binarySource = join(repoRoot, 'dist', 'neko-code.exe')
  const bundleRoot = join(repoRoot, 'dist', 'release-local')
  const versionRoot = join(bundleRoot, version)
  const platformRoot = join(versionRoot, platform)
  const bundledBinary = join(platformRoot, binaryName)
  const metadataPath = join(bundleRoot, 'release.json')

  await rm(bundleRoot, { recursive: true, force: true })
  await mkdir(platformRoot, { recursive: true })
  await copyFile(binarySource, bundledBinary)

  const binaryBuffer = await readFile(bundledBinary)
  const checksum = createHash('sha256').update(binaryBuffer).digest('hex')

  const manifest = {
    version,
    generatedAt: new Date().toISOString(),
    platforms: {
      [platform]: {
        checksum,
      },
    },
  }

  await writeFile(join(bundleRoot, 'latest'), `${version}\n`, 'utf8')
  await writeFile(join(bundleRoot, 'stable'), `${version}\n`, 'utf8')
  await writeFile(
    join(versionRoot, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
  await writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        version,
        platform,
        binaryName,
        checksum,
        bundleRoot,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  console.log('[PASS] build-local-release-bundle')
  console.log(`  version=${version}`)
  console.log(`  platform=${platform}`)
  console.log(`  binary=${bundledBinary}`)
  console.log(`  checksum=${checksum}`)
  console.log(`  metadata=${metadataPath}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
