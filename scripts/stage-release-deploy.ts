#!/usr/bin/env bun

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

type DeployOptions = {
  skipStagePublication: boolean
}

type PublicationMetadata = {
  version: string
  platform: string
  signed: boolean
  signingStatus: string
  publishedBinary: string
  publishedBinarySha256: string
  manifest: string
  channelPointers: string[]
  publishChannels: string[]
}

function parseArgs(argv: string[]): DeployOptions {
  let skipStagePublication = false

  for (const arg of argv) {
    if (arg === '--skip-stage-publication') {
      skipStagePublication = true
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  return { skipStagePublication }
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
  const options = parseArgs(process.argv.slice(2))

  if (!options.skipStagePublication) {
    console.log('[RUN] stage-release-publication')
    await runCommand(['bun', 'run', 'scripts/stage-release-publication.ts'], repoRoot)
  }

  const packageJson = JSON.parse(
    await readFile(join(repoRoot, 'package.json'), 'utf8'),
  ) as { version: string }
  const version = packageJson.version
  const publicationRoot = join(repoRoot, 'dist', 'release-publication', version)
  const deployRoot = join(repoRoot, 'dist', 'release-deploy', version)
  const payloadRoot = join(deployRoot, 'payload')
  const metadataTarget = join(deployRoot, 'release-deploy.json')
  const uploadManifestTarget = join(deployRoot, 'upload-manifest.json')
  const publication = JSON.parse(
    await readFile(join(publicationRoot, 'release-publication.json'), 'utf8'),
  ) as PublicationMetadata

  await rm(deployRoot, { recursive: true, force: true })
  await mkdir(payloadRoot, { recursive: true })
  await cp(publicationRoot, payloadRoot, { recursive: true })

  const uploadEntries = [
    'latest',
    'stable',
    publication.manifest,
    publication.publishedBinary,
    ...publication.publishChannels,
    'release-publication.json',
  ].map(path => ({
    source: `payload/${path}`,
    destination: path,
  }))

  const deployMetadata = {
    version,
    platform: publication.platform,
    generatedAt: new Date().toISOString(),
    signed: publication.signed,
    signingStatus: publication.signingStatus,
    payloadRoot: 'payload',
    uploadManifest: 'upload-manifest.json',
    payloadPointers: publication.channelPointers,
    publishedBinary: publication.publishedBinary,
    publishedBinarySha256: publication.publishedBinarySha256,
    payloadPublishChannels: publication.publishChannels,
    nextAction:
      '将 payload/ 下文件按 upload-manifest.json 上传到对象存储或下载页根目录',
  }

  const uploadManifest = {
    version,
    platform: publication.platform,
    generatedAt: new Date().toISOString(),
    signed: publication.signed,
    entries: uploadEntries,
  }

  await writeFile(metadataTarget, `${JSON.stringify(deployMetadata, null, 2)}\n`, 'utf8')
  await writeFile(
    uploadManifestTarget,
    `${JSON.stringify(uploadManifest, null, 2)}\n`,
    'utf8',
  )

  console.log('[PASS] stage-release-deploy')
  console.log(`  deployRoot=${deployRoot}`)
  console.log(`  payloadRoot=${payloadRoot}`)
  console.log(`  metadata=${metadataTarget}`)
  console.log(`  uploadManifest=${uploadManifestTarget}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
