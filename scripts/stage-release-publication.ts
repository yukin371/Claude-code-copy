#!/usr/bin/env bun

import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'

type PublicationOptions = {
  skipStageCandidate: boolean
}

type ReleaseCandidateMetadata = {
  version: string
  platform: string
  releaseArtifact: string
  signingStatus: string
  publishChannels?: string[]
}

type SigningManifest = {
  version: string
  platform: string
  signingStatus: string
  unsignedInput: {
    path: string
    sha256: string
  }
  expectedSignedOutput: {
    path: string
    binaryName: string
  }
  publishChannels: string[]
}

type BundleMetadata = {
  version: string
  platform: string
  binaryName: string
  checksum: string
}

type BundleManifest = {
  version: string
  generatedAt: string
  platforms: Record<string, { checksum: string }>
}

function parseArgs(argv: string[]): PublicationOptions {
  let skipStageCandidate = false

  for (const arg of argv) {
    if (arg === '--skip-stage-candidate') {
      skipStageCandidate = true
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  return { skipStageCandidate }
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

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  const repoRoot = process.cwd()
  const options = parseArgs(process.argv.slice(2))

  if (!options.skipStageCandidate) {
    console.log('[RUN] stage-release-candidate')
    await runCommand(['bun', 'run', 'scripts/stage-release-candidate.ts'], repoRoot)
  }

  const packageJson = JSON.parse(
    await readFile(join(repoRoot, 'package.json'), 'utf8'),
  ) as { version: string }
  const version = packageJson.version
  const candidateRoot = join(repoRoot, 'dist', 'release-candidate', version)
  const publicationRoot = join(repoRoot, 'dist', 'release-publication', version)
  const publishReadyRoot = join(publicationRoot, 'publish-ready')
  const publishChannelsRoot = join(publishReadyRoot, 'channels')
  const publicationMetadataTarget = join(publicationRoot, 'release-publication.json')

  const releaseCandidate = JSON.parse(
    await readFile(join(candidateRoot, 'release-candidate.json'), 'utf8'),
  ) as ReleaseCandidateMetadata
  const signingManifest = JSON.parse(
    await readFile(join(candidateRoot, 'signing-manifest.json'), 'utf8'),
  ) as SigningManifest
  const bundleMetadata = JSON.parse(
    await readFile(join(candidateRoot, 'bundle', 'release.json'), 'utf8'),
  ) as BundleMetadata
  const bundleManifest = JSON.parse(
    await readFile(join(candidateRoot, 'bundle', version, 'manifest.json'), 'utf8'),
  ) as BundleManifest

  const unsignedArtifactSource = join(candidateRoot, releaseCandidate.releaseArtifact)
  const signedArtifactSource = join(candidateRoot, signingManifest.expectedSignedOutput.path)
  const hasSignedArtifact = await pathExists(signedArtifactSource)
  const selectedSource = hasSignedArtifact ? signedArtifactSource : unsignedArtifactSource
  const selectedSourceRelative = relative(candidateRoot, selectedSource).replace(/\\/g, '/')
  const publishedBinaryRelative = join(
    version,
    releaseCandidate.platform,
    bundleMetadata.binaryName,
  ).replace(/\\/g, '/')
  const publishedBinaryTarget = join(publicationRoot, publishedBinaryRelative)
  const generatedAt = new Date().toISOString()

  await rm(publicationRoot, { recursive: true, force: true })
  await mkdir(dirname(publishedBinaryTarget), { recursive: true })
  await mkdir(publishChannelsRoot, { recursive: true })
  await copyFile(selectedSource, publishedBinaryTarget)

  const publishedBinarySha = await sha256(publishedBinaryTarget)

  await writeFile(join(publicationRoot, 'latest'), `${version}\n`, 'utf8')
  await writeFile(join(publicationRoot, 'stable'), `${version}\n`, 'utf8')
  await writeFile(
    join(publicationRoot, version, 'manifest.json'),
    `${JSON.stringify(
      {
        ...bundleManifest,
        generatedAt,
        platforms: {
          ...bundleManifest.platforms,
          [releaseCandidate.platform]: {
            checksum: publishedBinarySha,
          },
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  const channelEntries = (['latest', 'stable'] as const).map(channel => ({
    channel,
    relativePath: `publish-ready/channels/${channel}.json`,
    target: join(publishChannelsRoot, `${channel}.json`),
    payload: {
      channel,
      version,
      platform: releaseCandidate.platform,
      generatedAt,
      artifact: publishedBinaryRelative,
      sha256: publishedBinarySha,
      signed: hasSignedArtifact,
      signingStatus: hasSignedArtifact ? 'signed' : releaseCandidate.signingStatus,
      manifest: `${version}/manifest.json`,
      sourceArtifact: selectedSourceRelative,
    },
  }))

  for (const entry of channelEntries) {
    await writeFile(entry.target, `${JSON.stringify(entry.payload, null, 2)}\n`, 'utf8')
  }

  const publicationMetadata = {
    version,
    platform: releaseCandidate.platform,
    generatedAt,
    signed: hasSignedArtifact,
    signingStatus: hasSignedArtifact ? 'signed' : releaseCandidate.signingStatus,
    sourceArtifact: selectedSourceRelative,
    sourceCandidateRoot: relative(repoRoot, candidateRoot).replace(/\\/g, '/'),
    publishedBinary: publishedBinaryRelative,
    publishedBinarySha256: publishedBinarySha,
    manifest: `${version}/manifest.json`,
    channelPointers: ['latest', 'stable'],
    publishChannels: channelEntries.map(entry => entry.relativePath),
    nextBlockers: hasSignedArtifact
      ? ['GitHub Release draft/prerelease 发布尚未执行', '真实 auto-update 渠道尚未接入']
      : ['Windows 签名产物尚未接入', 'GitHub Release draft/prerelease 发布尚未执行', '真实 auto-update 渠道尚未接入'],
  }

  await writeFile(
    publicationMetadataTarget,
    `${JSON.stringify(publicationMetadata, null, 2)}\n`,
    'utf8',
  )

  console.log('[PASS] stage-release-publication')
  console.log(`  publicationRoot=${publicationRoot}`)
  console.log(`  version=${version}`)
  console.log(`  platform=${releaseCandidate.platform}`)
  console.log(`  signed=${hasSignedArtifact}`)
  console.log(`  sourceArtifact=${selectedSource}`)
  console.log(`  publishedBinary=${publishedBinaryTarget}`)
  console.log(`  metadata=${publicationMetadataTarget}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
