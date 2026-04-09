#!/usr/bin/env bun

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

type CommandPlan = {
  tag: string
  target: string
  draft: string
  prerelease: string
  latest: string
  readEndpoint: string
  patchEndpoint: string
  command: string
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

function parsePlan(output: string): CommandPlan {
  const lines = output
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  const result = Object.fromEntries(
    lines
      .filter(line => line.includes('='))
      .map(line => {
        const [key, ...rest] = line.split('=')
        return [key, rest.join('=')]
      }),
  ) as Partial<CommandPlan>

  if (!result.tag || !result.command) {
    throw new Error(`Unexpected promote output: ${output}`)
  }

  return result as CommandPlan
}

async function main(): Promise<void> {
  const repoRoot = process.cwd()
  const packageJson = JSON.parse(
    await readFile(join(repoRoot, 'package.json'), 'utf8'),
  ) as { version: string }
  const version = packageJson.version

  const draftPlan = parsePlan(
    await runCommand(
      [
        'bun',
        'run',
        'scripts/promote-github-release.ts',
        '--version',
        version,
        '--target',
        'draft',
        '--dry-run',
      ],
      repoRoot,
    ),
  )
  const prereleasePlan = parsePlan(
    await runCommand(
      [
        'bun',
        'run',
        'scripts/promote-github-release.ts',
        '--version',
        version,
        '--target',
        'prerelease',
        '--dry-run',
      ],
      repoRoot,
    ),
  )

  const stablePlan = parsePlan(
    await runCommand(
      [
        'bun',
        'run',
        'scripts/promote-github-release.ts',
        '--version',
        version,
        '--target',
        'stable',
        '--dry-run',
      ],
      repoRoot,
    ),
  )
  const manualPlan = parsePlan(
    await runCommand(
      [
        'bun',
        'run',
        'scripts/promote-github-release.ts',
        '--version',
        version,
        '--draft',
        'false',
        '--prerelease',
        'false',
        '--latest',
        'false',
        '--dry-run',
      ],
      repoRoot,
    ),
  )

  if (draftPlan.tag !== `v${version}`) {
    throw new Error('draft promotion tag mismatch')
  }
  if (draftPlan.target !== 'draft') {
    throw new Error('draft promotion target mismatch')
  }
  if (draftPlan.readEndpoint !== `repos/{owner}/{repo}/releases/tags/v${version}`) {
    throw new Error('draft promotion read endpoint mismatch')
  }
  if (!draftPlan.command.includes('gh api --method PATCH')) {
    throw new Error('draft promotion should use gh api patch')
  }
  if (!draftPlan.command.includes('-F draft=true')) {
    throw new Error('draft promotion draft flag mismatch')
  }
  if (!draftPlan.command.includes('-F prerelease=true')) {
    throw new Error('draft promotion prerelease flag mismatch')
  }
  if (!draftPlan.command.includes('-F make_latest=false')) {
    throw new Error('draft promotion latest flag mismatch')
  }

  if (prereleasePlan.tag !== `v${version}`) {
    throw new Error('prerelease promotion tag mismatch')
  }
  if (prereleasePlan.target !== 'prerelease') {
    throw new Error('prerelease promotion target mismatch')
  }
  if (!prereleasePlan.command.includes('-F draft=false')) {
    throw new Error('prerelease promotion draft flag mismatch')
  }
  if (!prereleasePlan.command.includes('-F prerelease=true')) {
    throw new Error('prerelease promotion prerelease flag mismatch')
  }
  if (!prereleasePlan.command.includes('-F make_latest=false')) {
    throw new Error('prerelease promotion latest flag mismatch')
  }

  if (stablePlan.tag !== `v${version}`) {
    throw new Error('stable promotion tag mismatch')
  }
  if (stablePlan.target !== 'stable') {
    throw new Error('stable promotion target mismatch')
  }
  if (!stablePlan.command.includes('-F draft=false')) {
    throw new Error('stable promotion draft flag mismatch')
  }
  if (!stablePlan.command.includes('-F prerelease=false')) {
    throw new Error('stable promotion prerelease flag mismatch')
  }
  if (!stablePlan.command.includes('-F make_latest=true')) {
    throw new Error('stable promotion latest flag mismatch')
  }
  if (stablePlan.patchEndpoint !== 'repos/{owner}/{repo}/releases/<release-id-from-tag>') {
    throw new Error('stable promotion patch endpoint mismatch')
  }

  if (manualPlan.target !== 'prerelease') {
    throw new Error('manual promotion target inference mismatch')
  }
  if (!manualPlan.command.includes('-F draft=false')) {
    throw new Error('manual promotion draft flag mismatch')
  }
  if (!manualPlan.command.includes('-F prerelease=false')) {
    throw new Error('manual promotion prerelease flag mismatch')
  }
  if (!manualPlan.command.includes('-F make_latest=false')) {
    throw new Error('manual promotion latest flag mismatch')
  }

  console.log('[PASS] promote-github-release-smoke')
  console.log(`  draft=${draftPlan.command}`)
  console.log(`  prerelease=${prereleasePlan.command}`)
  console.log(`  stable=${stablePlan.command}`)
  console.log(`  manual=${manualPlan.command}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
