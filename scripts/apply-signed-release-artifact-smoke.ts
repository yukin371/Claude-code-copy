#!/usr/bin/env bun

import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type SmokeOptions = {
  keepTemp: boolean
}

function parseArgs(argv: string[]): SmokeOptions {
  let keepTemp = false

  for (const arg of argv) {
    if (arg === '--keep-temp') {
      keepTemp = true
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  return { keepTemp }
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

  console.log('[RUN] stage-release-candidate')
  await runCommand(['bun', 'run', 'scripts/stage-release-candidate.ts', '--skip-build'], repoRoot)

  const packageJson = JSON.parse(
    await readFile(join(repoRoot, 'package.json'), 'utf8'),
  ) as { version: string }
  const version = packageJson.version
  const candidateRoot = join(repoRoot, 'dist', 'release-candidate', version)
  const candidateMetadata = JSON.parse(
    await readFile(join(candidateRoot, 'release-candidate.json'), 'utf8'),
  ) as { releaseArtifact: string }
  const signingManifest = JSON.parse(
    await readFile(join(candidateRoot, 'signing-manifest.json'), 'utf8'),
  ) as { expectedSignedOutput: { path: string } }

  const tempRoot = await mkdtemp(join(tmpdir(), 'neko-apply-signed-release-smoke-'))
  const signedBinarySource = join(tempRoot, 'signed-input.exe')

  await copyFile(join(candidateRoot, candidateMetadata.releaseArtifact), signedBinarySource)

  console.log('[RUN] apply-signed-release-artifact')
  await runCommand(
    [
      'bun',
      'run',
      'scripts/apply-signed-release-artifact.ts',
      '--version',
      version,
      '--signed-binary',
      signedBinarySource,
    ],
    repoRoot,
  )

  const publication = JSON.parse(
    await readFile(
      join(repoRoot, 'dist', 'release-publication', version, 'release-publication.json'),
      'utf8',
    ),
  ) as {
    signed: boolean
    signingStatus: string
    sourceArtifact: string
  }

  if (!publication.signed) {
    throw new Error('publication did not switch to signed=true')
  }
  if (publication.signingStatus !== 'signed') {
    throw new Error('publication signingStatus did not switch to signed')
  }
  if (publication.sourceArtifact !== signingManifest.expectedSignedOutput.path) {
    throw new Error('publication sourceArtifact does not point to signed path')
  }

  console.log('[PASS] apply-signed-release-artifact-smoke')
  console.log(`  version=${version}`)
  console.log(`  signedInput=${signedBinarySource}`)
  console.log(`  signedTarget=${join(candidateRoot, signingManifest.expectedSignedOutput.path)}`)

  if (!options.keepTemp) {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
