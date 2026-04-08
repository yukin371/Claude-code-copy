#!/usr/bin/env bun

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

type DeployMetadata = {
  version: string
  platform: string
  signed: boolean
  signingStatus: string
  payloadRoot: string
  uploadManifest: string
  payloadPointers: string[]
  publishedBinary: string
  payloadPublishChannels: string[]
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

async function main(): Promise<void> {
  const repoRoot = process.cwd()

  console.log('[RUN] stage-release-deploy')
  await runCommand(
    ['bun', 'run', 'scripts/stage-release-deploy.ts', '--skip-stage-publication'],
    repoRoot,
  )

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
  const publication = JSON.parse(
    await readFile(
      join(repoRoot, 'dist', 'release-publication', version, 'release-publication.json'),
      'utf8',
    ),
  ) as {
    platform: string
    signed: boolean
    signingStatus: string
    publishedBinary: string
    manifest: string
    channelPointers: string[]
    publishChannels: string[]
  }

  if (deployMetadata.version !== version) {
    throw new Error('deploy metadata version mismatch')
  }
  if (deployMetadata.platform !== publication.platform) {
    throw new Error('deploy metadata platform mismatch')
  }
  if (deployMetadata.signed !== publication.signed) {
    throw new Error('deploy metadata signed mismatch')
  }
  if (deployMetadata.signingStatus !== publication.signingStatus) {
    throw new Error('deploy metadata signing status mismatch')
  }
  if (deployMetadata.payloadRoot !== 'payload') {
    throw new Error('deploy payload root mismatch')
  }
  if (deployMetadata.uploadManifest !== 'upload-manifest.json') {
    throw new Error('deploy upload manifest path mismatch')
  }
  if (deployMetadata.publishedBinary !== publication.publishedBinary) {
    throw new Error('deploy published binary mismatch')
  }
  if (deployMetadata.payloadPointers.join(',') !== publication.channelPointers.join(',')) {
    throw new Error('deploy pointer list mismatch')
  }
  if (deployMetadata.payloadPublishChannels.join(',') !== publication.publishChannels.join(',')) {
    throw new Error('deploy publish channel list mismatch')
  }

  if (uploadManifest.version !== version) {
    throw new Error('upload manifest version mismatch')
  }
  if (uploadManifest.platform !== publication.platform) {
    throw new Error('upload manifest platform mismatch')
  }
  if (uploadManifest.signed !== publication.signed) {
    throw new Error('upload manifest signed mismatch')
  }

  const expectedDestinations = [
    'latest',
    'stable',
    publication.manifest,
    publication.publishedBinary,
    ...publication.publishChannels,
    'release-publication.json',
  ]
  const actualDestinations = uploadManifest.entries.map(entry => entry.destination)
  if (actualDestinations.join(',') !== expectedDestinations.join(',')) {
    throw new Error('upload manifest destinations mismatch')
  }
  if (uploadManifest.entries.some(entry => !entry.source.startsWith('payload/'))) {
    throw new Error('upload manifest source path mismatch')
  }

  console.log('[PASS] stage-release-deploy-smoke')
  console.log(`  deployRoot=${deployRoot}`)
  console.log(`  signed=${publication.signed}`)
  console.log(`  publishedBinary=${publication.publishedBinary}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
