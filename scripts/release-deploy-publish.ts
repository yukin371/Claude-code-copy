#!/usr/bin/env bun

import { mkdir, readFile, rm, stat, copyFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve, relative } from 'node:path'

type PublishOptions = {
  version?: string
  targetRoot: string
  skipStageDeploy: boolean
  cleanTarget: boolean
}

type DeployMetadata = {
  version: string
  platform: string
  signed: boolean
  signingStatus: string
  payloadRoot: string
  uploadManifest: string
  publishedBinary: string
}

type UploadManifest = {
  version: string
  platform: string
  signed: boolean
  entries: Array<{
    source: string
    destination: string
  }>
}

function parseArgs(argv: string[]): PublishOptions {
  let version: string | undefined
  let targetRoot: string | undefined
  let skipStageDeploy = false
  let cleanTarget = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--version') {
      version = argv[index + 1]
      if (!version) {
        throw new Error('--version requires a semver value')
      }
      index += 1
      continue
    }

    if (arg === '--target-root') {
      targetRoot = argv[index + 1]
      if (!targetRoot) {
        throw new Error('--target-root requires a filesystem path')
      }
      index += 1
      continue
    }

    if (arg === '--skip-stage-deploy') {
      skipStageDeploy = true
      continue
    }

    if (arg === '--clean-target') {
      cleanTarget = true
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  if (!targetRoot) {
    throw new Error('Missing required argument: --target-root <path>')
  }

  return {
    version,
    targetRoot,
    skipStageDeploy,
    cleanTarget,
  }
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function assertPathInsideRoot(
  rootPath: string,
  candidatePath: string,
  label: string,
): void {
  const normalizedRoot = resolve(rootPath)
  const normalizedCandidate = resolve(candidatePath)
  const relativePath = relative(normalizedRoot, normalizedCandidate)

  if (
    relativePath === ''
    || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
  ) {
    return
  }

  throw new Error(`Refusing to access ${label} outside ${normalizedRoot}: ${normalizedCandidate}`)
}

async function main(): Promise<void> {
  const repoRoot = process.cwd()
  const options = parseArgs(process.argv.slice(2))

  if (!options.skipStageDeploy) {
    console.log('[RUN] stage-release-deploy')
    await runCommand(['bun', 'run', 'scripts/stage-release-deploy.ts'], repoRoot)
  }

  const packageJson = JSON.parse(
    await readFile(join(repoRoot, 'package.json'), 'utf8'),
  ) as { version: string }
  const version = options.version ?? packageJson.version
  const deployRoot = join(repoRoot, 'dist', 'release-deploy', version)
  const deployMetadata = JSON.parse(
    await readFile(join(deployRoot, 'release-deploy.json'), 'utf8'),
  ) as DeployMetadata
  const uploadManifest = JSON.parse(
    await readFile(join(deployRoot, deployMetadata.uploadManifest), 'utf8'),
  ) as UploadManifest

  if (uploadManifest.version !== version) {
    throw new Error(
      `Upload manifest version mismatch: expected ${version}, got ${uploadManifest.version}`,
    )
  }
  if (uploadManifest.platform !== deployMetadata.platform) {
    throw new Error('Upload manifest platform does not match deploy metadata')
  }
  if (uploadManifest.signed !== deployMetadata.signed) {
    throw new Error('Upload manifest signed flag does not match deploy metadata')
  }

  const payloadRoot = resolve(deployRoot, deployMetadata.payloadRoot)
  const targetRoot = resolve(options.targetRoot)
  if (options.cleanTarget) {
    await rm(targetRoot, { recursive: true, force: true })
  }
  await mkdir(targetRoot, { recursive: true })

  let copiedCount = 0
  for (const entry of uploadManifest.entries) {
    const sourcePath = resolve(deployRoot, entry.source)
    const destinationPath = resolve(targetRoot, entry.destination)

    assertPathInsideRoot(payloadRoot, sourcePath, 'deploy payload source')
    assertPathInsideRoot(targetRoot, destinationPath, 'publish target')

    if (!(await pathExists(sourcePath))) {
      throw new Error(`Deploy payload source missing: ${relative(repoRoot, sourcePath)}`)
    }

    await mkdir(dirname(destinationPath), { recursive: true })
    await copyFile(sourcePath, destinationPath)
    copiedCount += 1
  }

  console.log('[PASS] release-deploy-publish')
  console.log(`  version=${version}`)
  console.log(`  platform=${deployMetadata.platform}`)
  console.log(`  signed=${deployMetadata.signed}`)
  console.log(`  targetRoot=${targetRoot}`)
  console.log(`  publishedBinary=${deployMetadata.publishedBinary}`)
  console.log(`  copiedEntries=${copiedCount}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
