#!/usr/bin/env bun

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

type PublishPlan = {
  version: string
  tagName: string
  releaseName: string
  notesPath: string
  assetCount: number
  assets: string[]
  createArgs: string[]
  editArgs: string[]
  uploadArgs: string[]
}

type SmokeOptions = {
  skipStageGithubRelease: boolean
}

function parseArgs(argv: string[]): SmokeOptions {
  let skipStageGithubRelease = false

  for (const arg of argv) {
    if (arg === '--skip-stage-github-release') {
      skipStageGithubRelease = true
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  return { skipStageGithubRelease }
}

async function runCommand(args: string[], cwd: string): Promise<string> {
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

  if (exitCode !== 0) {
    throw new Error(stderr || stdout)
  }

  return stdout
}

function parsePlan(output: string): PublishPlan {
  const normalized = output.replace(/\r/g, '')
  const jsonStart = normalized.indexOf('{')
  if (jsonStart < 0) {
    throw new Error(`Unexpected publish plan output: ${output}`)
  }
  return JSON.parse(normalized.slice(jsonStart)) as PublishPlan
}

async function main(): Promise<void> {
  const repoRoot = process.cwd()
  const options = parseArgs(process.argv.slice(2))

  if (!options.skipStageGithubRelease) {
    await runCommand(
      ['bun', 'run', 'scripts/stage-github-release-smoke.ts'],
      repoRoot,
    )
  }

  const packageJson = JSON.parse(
    await readFile(join(repoRoot, 'package.json'), 'utf8'),
  ) as { version: string }
  const plan = parsePlan(
    await runCommand(
      [
        'bun',
        'run',
        'scripts/publish-github-release.ts',
        '--version',
        packageJson.version,
        '--dry-run',
      ],
      repoRoot,
    ),
  )

  if (plan.version !== packageJson.version) {
    throw new Error('publish plan version mismatch')
  }
  if (plan.tagName !== `v${packageJson.version}`) {
    throw new Error('publish plan tag mismatch')
  }
  if (plan.releaseName !== `Neko Code v${packageJson.version}`) {
    throw new Error('publish plan release name mismatch')
  }
  if (!plan.notesPath.endsWith('release-notes.md')) {
    throw new Error('publish plan notes path mismatch')
  }
  if (plan.assetCount <= 0 || plan.assets.length !== plan.assetCount) {
    throw new Error('publish plan assets missing')
  }
  if (!plan.assets.some(asset => asset.endsWith('.exe'))) {
    throw new Error('publish plan direct binary asset missing')
  }
  if (!plan.assets.some(asset => asset.endsWith('-portable-installer.zip'))) {
    throw new Error('publish plan installer asset missing')
  }
  if (!plan.createArgs.includes('--draft')) {
    throw new Error('publish create args missing draft flag')
  }
  if (!plan.createArgs.includes('--prerelease')) {
    throw new Error('publish create args missing prerelease flag')
  }
  if (!plan.createArgs.some(arg => arg.endsWith('.exe'))) {
    throw new Error('publish create args missing direct binary upload')
  }
  if (
    !plan.createArgs.some(arg => arg.endsWith('-portable-installer.zip'))
  ) {
    throw new Error('publish create args missing installer upload')
  }
  if (!plan.uploadArgs.includes('--clobber')) {
    throw new Error('publish upload args missing clobber flag')
  }
  if (!plan.uploadArgs.some(arg => arg.endsWith('.exe'))) {
    throw new Error('publish upload args missing direct binary upload')
  }
  if (
    !plan.uploadArgs.some(arg => arg.endsWith('-portable-installer.zip'))
  ) {
    throw new Error('publish upload args missing installer upload')
  }

  console.log('[PASS] publish-github-release-smoke')
  console.log(`  version=${plan.version}`)
  console.log(`  tag=${plan.tagName}`)
  console.log(`  assetCount=${plan.assetCount}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
