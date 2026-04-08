#!/usr/bin/env bun

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

type GithubReleaseMetadata = {
  version: string
  tagName: string
  releaseName: string
  signed: boolean
  signingStatus: string
  notesFile: string
  assetsDir: string
  primaryAsset: string
  installerAsset: string
  recommendedAssets: {
    installer: string
    directBinary: string
  }
  publishPolicy: {
    publishDefaults: {
      draft: boolean
      prerelease: boolean
    }
    promoteTargets: Record<
      string,
      {
        draft: boolean
        prerelease: boolean
        latest: boolean
      }
    >
  }
  assets: Array<{
    name: string
    kind: string
    size: number
    sha256: string
  }>
}

type SmokeOptions = {
  skipSignedWorkflow: boolean
  skipStageGithubRelease: boolean
}

function parseArgs(argv: string[]): SmokeOptions {
  let skipSignedWorkflow = false
  let skipStageGithubRelease = false

  for (const arg of argv) {
    if (arg === '--skip-signed-workflow') {
      skipSignedWorkflow = true
      continue
    }

    if (arg === '--skip-stage-github-release') {
      skipStageGithubRelease = true
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  return {
    skipSignedWorkflow,
    skipStageGithubRelease,
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

async function main(): Promise<void> {
  const repoRoot = process.cwd()
  const options = parseArgs(process.argv.slice(2))

  if (!options.skipSignedWorkflow) {
    console.log('[RUN] signed-release-publication-workflow')
    await runCommand(
      ['bun', 'run', 'scripts/signed-release-publication-workflow-smoke.ts'],
      repoRoot,
    )
  }

  if (!options.skipStageGithubRelease) {
    console.log('[RUN] stage-github-release')
    await runCommand(
      ['bun', 'run', 'scripts/stage-github-release.ts', '--skip-stage-deploy'],
      repoRoot,
    )
  }

  const packageJson = JSON.parse(
    await readFile(join(repoRoot, 'package.json'), 'utf8'),
  ) as { version: string }
  const version = packageJson.version
  const githubReleaseRoot = join(repoRoot, 'dist', 'github-release', version)
  const metadata = JSON.parse(
    await readFile(join(githubReleaseRoot, 'release-github.json'), 'utf8'),
  ) as GithubReleaseMetadata
  const notes = await readFile(join(githubReleaseRoot, metadata.notesFile), 'utf8')

  if (metadata.version !== version) {
    throw new Error('github release metadata version mismatch')
  }
  if (metadata.tagName !== `v${version}`) {
    throw new Error('github release tag mismatch')
  }
  if (metadata.releaseName !== `Neko Code v${version}`) {
    throw new Error('github release name mismatch')
  }
  if (!metadata.signed || metadata.signingStatus !== 'signed') {
    throw new Error('github release metadata is not signed')
  }
  if (!metadata.primaryAsset.endsWith('.exe')) {
    throw new Error('github release primary asset mismatch')
  }
  if (!metadata.installerAsset.endsWith('-portable-installer.zip')) {
    throw new Error('github release installer asset mismatch')
  }
  if (metadata.recommendedAssets.installer !== metadata.installerAsset) {
    throw new Error('github release recommended installer mismatch')
  }
  if (metadata.recommendedAssets.directBinary !== metadata.primaryAsset) {
    throw new Error('github release recommended direct binary mismatch')
  }
  if (
    metadata.publishPolicy.publishDefaults.draft !== true
    || metadata.publishPolicy.publishDefaults.prerelease !== true
  ) {
    throw new Error('github release publish defaults mismatch')
  }
  if (
    metadata.publishPolicy.promoteTargets.stable?.latest !== true
    || metadata.publishPolicy.promoteTargets.stable?.draft !== false
    || metadata.publishPolicy.promoteTargets.prerelease?.prerelease !== true
  ) {
    throw new Error('github release promote targets mismatch')
  }
  if (!Array.isArray(metadata.assets) || metadata.assets.length < 10) {
    throw new Error('github release asset list missing')
  }
  if (!notes.includes(`Neko Code ${version}`) || !notes.includes(metadata.primaryAsset)) {
    throw new Error('github release notes missing key content')
  }
  if (!notes.includes('## Recommended Downloads') || !notes.includes(metadata.installerAsset)) {
    throw new Error('github release notes missing recommended downloads')
  }
  if (!metadata.assets.some(asset => asset.kind === 'installer-script')) {
    throw new Error('github release installer script asset missing')
  }
  if (!metadata.assets.some(asset => asset.kind === 'installer-manifest')) {
    throw new Error('github release installer manifest asset missing')
  }
  if (!metadata.assets.some(asset => asset.kind === 'installer-package')) {
    throw new Error('github release installer package asset missing')
  }
  if (
    metadata.assets.filter(asset => asset.kind === 'installer-backend').length < 3
  ) {
    throw new Error('github release installer backend assets missing')
  }
  if (
    metadata.assets.some(
      asset => asset.size <= 0 || typeof asset.sha256 !== 'string' || asset.sha256.length !== 64,
    )
  ) {
    throw new Error('github release asset metadata invalid')
  }

  console.log('[PASS] stage-github-release-smoke')
  console.log(`  githubReleaseRoot=${githubReleaseRoot}`)
  console.log(`  primaryAsset=${metadata.primaryAsset}`)
  console.log(`  assetCount=${metadata.assets.length}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
