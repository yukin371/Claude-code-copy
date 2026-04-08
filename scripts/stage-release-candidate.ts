#!/usr/bin/env bun

import { createHash } from 'node:crypto'
import { cp, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

type StageOptions = {
  skipBuild: boolean
}

type BundleMetadata = {
  version: string
  platform: string
  binaryName: string
  checksum: string
  bundleRoot: string
}

function parseArgs(argv: string[]): StageOptions {
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

async function sha256(filePath: string): Promise<string> {
  const content = await readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

async function main(): Promise<void> {
  const repoRoot = process.cwd()
  const options = parseArgs(process.argv.slice(2))

  if (!options.skipBuild) {
    console.log('[RUN] build:native')
    await runCommand(['bun', 'run', 'build:native'], repoRoot)
  }

  console.log('[RUN] build-local-release-bundle')
  await runCommand(
    options.skipBuild
      ? ['bun', 'run', 'scripts/build-local-release-bundle.ts', '--skip-build']
      : ['bun', 'run', 'build:local-release-bundle'],
    repoRoot,
  )

  const releaseMetadata = JSON.parse(
    await readFile(join(repoRoot, 'dist', 'release-local', 'release.json'), 'utf8'),
  ) as BundleMetadata

  const version = releaseMetadata.version
  const platform = releaseMetadata.platform
  const candidateRoot = join(repoRoot, 'dist', 'release-candidate', version)
  const bundleSourceRoot = join(repoRoot, 'dist', 'release-local')
  const bundleTargetRoot = join(candidateRoot, 'bundle')
  const binarySource = join(repoRoot, 'dist', 'neko-code.exe')
  const binaryTarget = join(candidateRoot, `neko-code-${version}-${platform}-unsigned.exe`)
  const installerScriptSource = join(repoRoot, 'scripts', 'install-local-launcher.ps1')
  const installerScriptTarget = join(candidateRoot, 'install-local-launcher.ps1')
  const metadataTarget = join(candidateRoot, 'release-candidate.json')
  const publishReadyRoot = join(candidateRoot, 'publish-ready')
  const publishChannelsRoot = join(publishReadyRoot, 'channels')
  const signingManifestTarget = join(candidateRoot, 'signing-manifest.json')
  const checksumsTarget = join(candidateRoot, 'SHA256SUMS.txt')

  await rm(candidateRoot, { recursive: true, force: true })
  await mkdir(publishChannelsRoot, { recursive: true })
  await cp(bundleSourceRoot, bundleTargetRoot, { recursive: true })
  await copyFile(binarySource, binaryTarget)
  await copyFile(installerScriptSource, installerScriptTarget)

  const generatedAt = new Date().toISOString()
  const bundleRelativeBinary = join(
    'bundle',
    version,
    platform,
    releaseMetadata.binaryName,
  ).replace(/\\/g, '/')
  const releaseArtifact = relative(candidateRoot, binaryTarget).replace(/\\/g, '/')
  const installerScript = relative(candidateRoot, installerScriptTarget).replace(/\\/g, '/')
  const signingManifest = relative(candidateRoot, signingManifestTarget).replace(/\\/g, '/')
  const signedArtifact = `signed/neko-code-${version}-${platform}.exe`
  const releaseArtifactSha = await sha256(binaryTarget)
  const channelEntries = (['latest', 'stable'] as const).map(channel => ({
    channel,
    relativePath: `publish-ready/channels/${channel}.json`,
    target: join(publishChannelsRoot, `${channel}.json`),
    payload: {
      channel,
      version,
      platform,
      generatedAt,
      artifact: releaseArtifact,
      sha256: releaseArtifactSha,
      signed: false,
      signingStatus: 'unsigned',
      bundleMetadata: 'bundle/release.json',
      installerInputBinary: bundleRelativeBinary,
      releaseCandidateMetadata: 'release-candidate.json',
    },
  }))

  for (const entry of channelEntries) {
    await writeFile(entry.target, `${JSON.stringify(entry.payload, null, 2)}\n`, 'utf8')
  }

  const signingManifestContent = {
    version,
    platform,
    generatedAt,
    signingStatus: 'unsigned',
    unsignedInput: {
      path: releaseArtifact,
      sha256: releaseArtifactSha,
    },
    expectedSignedOutput: {
      path: signedArtifact,
      binaryName: `neko-code-${version}-${platform}.exe`,
    },
    publishChannels: channelEntries.map(entry => entry.relativePath),
  }
  await writeFile(
    signingManifestTarget,
    `${JSON.stringify(signingManifestContent, null, 2)}\n`,
    'utf8',
  )

  const metadata = {
    version,
    generatedAt,
    channelFiles: ['bundle/latest', 'bundle/stable'],
    publishChannels: channelEntries.map(entry => entry.relativePath),
    platform,
    unsigned: true,
    signingStatus: 'unsigned',
    releaseArtifact,
    installerInputBinary: bundleRelativeBinary,
    installerScript,
    bundleMetadata: 'bundle/release.json',
    signingManifest,
    nextBlockers: [
      'Windows 签名产物尚未接入',
      'GitHub Release draft/prerelease 发布尚未执行',
      'auto-update 正式渠道尚未接入',
    ],
  }

  await writeFile(
    metadataTarget,
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8',
  )

  const checksumEntries = [
    {
      file: releaseArtifact,
      hash: releaseArtifactSha,
    },
    {
      file: installerScript,
      hash: await sha256(installerScriptTarget),
    },
    {
      file: relative(candidateRoot, metadataTarget).replace(/\\/g, '/'),
      hash: await sha256(metadataTarget),
    },
    {
      file: signingManifest,
      hash: await sha256(signingManifestTarget),
    },
    {
      file: 'bundle/release.json',
      hash: await sha256(join(bundleTargetRoot, 'release.json')),
    },
    {
      file: bundleRelativeBinary,
      hash: await sha256(join(candidateRoot, bundleRelativeBinary)),
    },
  ]

  for (const entry of channelEntries) {
    checksumEntries.push({
      file: entry.relativePath,
      hash: await sha256(entry.target),
    })
  }

  await writeFile(
    checksumsTarget,
    `${checksumEntries.map(entry => `${entry.hash}  ${entry.file}`).join('\n')}\n`,
    'utf8',
  )

  console.log('[PASS] stage-release-candidate')
  console.log(`  candidateRoot=${candidateRoot}`)
  console.log(`  version=${version}`)
  console.log(`  platform=${platform}`)
  console.log(`  releaseArtifact=${binaryTarget}`)
  console.log(`  metadata=${metadataTarget}`)
  console.log(`  publishReady=${publishReadyRoot}`)
  console.log(`  signingManifest=${signingManifestTarget}`)
  console.log(`  checksums=${checksumsTarget}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
