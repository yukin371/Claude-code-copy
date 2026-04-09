#!/usr/bin/env bun

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

type PublishOptions = {
  version: string
  dryRun: boolean
}

type GithubReleaseMetadata = {
  version: string
  tagName: string
  releaseName: string
  notesFile: string
  assetsDir: string
  publishPolicy: {
    publishDefaults: {
      draft: boolean
      prerelease: boolean
    }
  }
  assets: Array<{
    name: string
  }>
}

type CommandResult = {
  exitCode: number
  stdout: string
  stderr: string
}

function parseArgs(argv: string[]): PublishOptions {
  let version: string | undefined
  let dryRun = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--version') {
      version = argv[index + 1]
      index += 1
      continue
    }

    if (arg === '--dry-run') {
      dryRun = true
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  if (!version) {
    throw new Error('Missing required argument: --version <semver>')
  }

  return {
    version,
    dryRun,
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

async function runCommandNoThrow(
  args: string[],
  cwd: string,
): Promise<CommandResult> {
  const child = Bun.spawn(args, {
    cwd,
    env: process.env,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])

  return {
    exitCode,
    stdout,
    stderr,
  }
}

async function main(): Promise<void> {
  const repoRoot = process.cwd()
  const options = parseArgs(process.argv.slice(2))
  const githubReleaseRoot = join(
    repoRoot,
    'dist',
    'github-release',
    options.version,
  )
  const metadata = JSON.parse(
    await readFile(join(githubReleaseRoot, 'release-github.json'), 'utf8'),
  ) as GithubReleaseMetadata
  const notesPath = join(githubReleaseRoot, metadata.notesFile)
  const assets = metadata.assets.map(asset =>
    join(githubReleaseRoot, metadata.assetsDir, asset.name),
  )
  const createArgs = [
    'gh',
    'release',
    'create',
    metadata.tagName,
    '--title',
    metadata.releaseName,
    '--notes-file',
    notesPath,
    ...(metadata.publishPolicy.publishDefaults.draft ? ['--draft'] : []),
    ...(metadata.publishPolicy.publishDefaults.prerelease
      ? ['--prerelease']
      : []),
    ...assets,
  ]
  const editArgs = [
    'gh',
    'release',
    'edit',
    metadata.tagName,
    '--title',
    metadata.releaseName,
    '--notes-file',
    notesPath,
    `--draft=${metadata.publishPolicy.publishDefaults.draft ? 'true' : 'false'}`,
    ...(metadata.publishPolicy.publishDefaults.prerelease
      ? ['--prerelease']
      : []),
  ]
  const uploadArgs = ['gh', 'release', 'upload', metadata.tagName, '--clobber', ...assets]

  if (options.dryRun) {
    console.log('[PLAN] publish-github-release')
    console.log(
      JSON.stringify(
        {
          version: metadata.version,
          tagName: metadata.tagName,
          releaseName: metadata.releaseName,
          notesPath,
          assetCount: assets.length,
          assets,
          createArgs,
          editArgs,
          uploadArgs,
        },
        null,
        2,
      ),
    )
    return
  }

  const viewResult = await runCommandNoThrow(
    ['gh', 'release', 'view', metadata.tagName],
    repoRoot,
  )

  if (viewResult.exitCode !== 0) {
    await runCommand(createArgs, repoRoot)
    console.log('[PASS] publish-github-release')
    console.log(`  tag=${metadata.tagName}`)
    console.log('  mode=create')
    console.log(`  assetCount=${assets.length}`)
    return
  }

  await runCommand(editArgs, repoRoot)
  await runCommand(uploadArgs, repoRoot)

  console.log('[PASS] publish-github-release')
  console.log(`  tag=${metadata.tagName}`)
  console.log('  mode=update')
  console.log(`  assetCount=${assets.length}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
