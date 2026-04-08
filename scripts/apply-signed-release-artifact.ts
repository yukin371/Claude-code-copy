#!/usr/bin/env bun

import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path'

type ApplyOptions = {
  signedBinary: string
  version?: string
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

function parseArgs(argv: string[]): ApplyOptions {
  let signedBinary: string | undefined
  let version: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--signed-binary') {
      signedBinary = argv[index + 1]
      index += 1
      continue
    }

    if (arg === '--version') {
      version = argv[index + 1]
      index += 1
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  if (!signedBinary) {
    throw new Error('Missing required argument: --signed-binary <path>')
  }

  return { signedBinary, version }
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
  const packageJson = JSON.parse(
    await readFile(join(repoRoot, 'package.json'), 'utf8'),
  ) as { version: string }
  const version = options.version ?? packageJson.version
  const candidateRoot = join(repoRoot, 'dist', 'release-candidate', version)
  const signingManifestPath = join(candidateRoot, 'signing-manifest.json')
  const signingManifest = JSON.parse(
    await readFile(signingManifestPath, 'utf8'),
  ) as SigningManifest

  if (signingManifest.version !== version) {
    throw new Error(
      `Signing manifest version mismatch: expected ${version}, got ${signingManifest.version}`,
    )
  }

  const signedBinarySource = isAbsolute(options.signedBinary)
    ? normalize(options.signedBinary)
    : resolve(repoRoot, options.signedBinary)
  const sourceStats = await stat(signedBinarySource)

  if (!sourceStats.isFile() || sourceStats.size < 1024) {
    throw new Error(`Signed binary is invalid: ${signedBinarySource}`)
  }

  if (!signedBinarySource.toLowerCase().endsWith('.exe')) {
    throw new Error(`Signed binary must be an .exe: ${signedBinarySource}`)
  }

  const signedBinaryTarget = join(
    candidateRoot,
    signingManifest.expectedSignedOutput.path,
  )
  await mkdir(dirname(signedBinaryTarget), { recursive: true })
  await copyFile(signedBinarySource, signedBinaryTarget)

  console.log('[RUN] stage-release-publication')
  await runCommand(
    ['bun', 'run', 'scripts/stage-release-publication.ts', '--skip-stage-candidate'],
    repoRoot,
  )

  console.log('[PASS] apply-signed-release-artifact')
  console.log(`  version=${version}`)
  console.log(`  source=${signedBinarySource}`)
  console.log(`  target=${signedBinaryTarget}`)
  console.log(`  publicationRoot=${join(repoRoot, 'dist', 'release-publication', version)}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
