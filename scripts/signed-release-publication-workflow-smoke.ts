#!/usr/bin/env bun

import { cp, copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type SmokeOptions = {
  keepTemp: boolean
  skipBuild: boolean
  skipStageCandidate: boolean
}

type ReleaseCandidateMetadata = {
  releaseArtifact: string
}

type SigningManifest = {
  expectedSignedOutput: {
    path: string
  }
}

type PublicationMetadata = {
  signed: boolean
  signingStatus: string
}

type DeployMetadata = {
  signed: boolean
  signingStatus: string
}

export function parseArgs(argv: string[]): SmokeOptions {
  let keepTemp = false
  let skipBuild = false
  let skipStageCandidate = false

  for (const arg of argv) {
    if (arg === '--keep-temp') {
      keepTemp = true
      continue
    }

    if (arg === '--skip-build') {
      skipBuild = true
      continue
    }

    if (arg === '--skip-stage-candidate') {
      skipStageCandidate = true
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  return { keepTemp, skipBuild, skipStageCandidate }
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

  if (!options.skipBuild) {
    console.log('[RUN] build:native')
    await runCommand(['bun', 'run', 'build:native'], repoRoot)
  }

  if (!options.skipStageCandidate) {
    console.log('[RUN] stage-release-candidate')
    await runCommand(
      ['bun', 'run', 'scripts/stage-release-candidate.ts', '--skip-build'],
      repoRoot,
    )
  }

  const packageJson = JSON.parse(
    await readFile(join(repoRoot, 'package.json'), 'utf8'),
  ) as { version: string }
  const version = packageJson.version
  const candidateRoot = join(repoRoot, 'dist', 'release-candidate', version)
  const candidateMetadata = JSON.parse(
    await readFile(join(candidateRoot, 'release-candidate.json'), 'utf8'),
  ) as ReleaseCandidateMetadata
  const signingManifest = JSON.parse(
    await readFile(join(candidateRoot, 'signing-manifest.json'), 'utf8'),
  ) as SigningManifest

  const tempRoot = await mkdtemp(
    join(tmpdir(), 'neko-signed-release-workflow-smoke-'),
  )
  const unsignedArtifactDir = join(tempRoot, 'unsigned-artifact')
  const signedArtifactDir = join(tempRoot, 'signed-artifact')
  const signedBinary = join(signedArtifactDir, 'neko-code-signed.exe')

  await cp(candidateRoot, unsignedArtifactDir, { recursive: true })
  await rm(candidateRoot, { recursive: true, force: true })
  await cp(unsignedArtifactDir, candidateRoot, { recursive: true })
  await rm(join(candidateRoot, 'signed'), { recursive: true, force: true })

  await mkdir(signedArtifactDir, { recursive: true })
  await copyFile(join(candidateRoot, candidateMetadata.releaseArtifact), signedBinary)

  console.log('[RUN] apply-signed-release-artifact')
  await runCommand(
    [
      'bun',
      'run',
      'scripts/apply-signed-release-artifact.ts',
      '--version',
      version,
      '--signed-binary',
      signedBinary,
    ],
    repoRoot,
  )

  console.log('[RUN] stage-release-deploy')
  await runCommand(
    ['bun', 'run', 'scripts/stage-release-deploy.ts', '--skip-stage-publication'],
    repoRoot,
  )

  console.log('[RUN] native-installer-release-publication')
  await runCommand(
    [
      'bun',
      'run',
      'scripts/native-installer-release-publication-smoke.ts',
      '--skip-stage-publication',
    ],
    repoRoot,
  )

  console.log('[RUN] release-deploy-publish')
  await runCommand(
    [
      'bun',
      'run',
      'scripts/release-deploy-publish-smoke.ts',
      '--skip-stage-deploy',
    ],
    repoRoot,
  )

  console.log('[RUN] native-update-cli-release-deploy')
  await runCommand(
    [
      'bun',
      'run',
      'scripts/native-update-cli-release-deploy-smoke.ts',
      '--skip-stage-deploy',
    ],
    repoRoot,
  )

  const publication = JSON.parse(
    await readFile(
      join(
        repoRoot,
        'dist',
        'release-publication',
        version,
        'release-publication.json',
      ),
      'utf8',
    ),
  ) as PublicationMetadata
  const deploy = JSON.parse(
    await readFile(
      join(repoRoot, 'dist', 'release-deploy', version, 'release-deploy.json'),
      'utf8',
    ),
  ) as DeployMetadata

  if (!publication.signed || publication.signingStatus !== 'signed') {
    throw new Error('publication did not remain signed after workflow smoke')
  }

  if (!deploy.signed || deploy.signingStatus !== 'signed') {
    throw new Error('deploy did not remain signed after workflow smoke')
  }

  const signedTarget = join(candidateRoot, signingManifest.expectedSignedOutput.path)

  console.log('[PASS] signed-release-publication-workflow-smoke')
  console.log(`  version=${version}`)
  console.log(`  unsignedArtifactDir=${unsignedArtifactDir}`)
  console.log(`  signedArtifactDir=${signedArtifactDir}`)
  console.log(`  signedBinary=${signedBinary}`)
  console.log(`  signedTarget=${signedTarget}`)

  if (!options.keepTemp) {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  main().catch(error => {
    console.error(error)
    process.exit(1)
  })
}
