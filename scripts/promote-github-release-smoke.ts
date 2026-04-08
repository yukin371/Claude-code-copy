#!/usr/bin/env bun

type CommandPlan = {
  tag: string
  target: string
  draft: string
  prerelease: string
  latest: string
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

  const prereleasePlan = parsePlan(
    await runCommand(
      [
        'bun',
        'run',
        'scripts/promote-github-release.ts',
        '--version',
        '0.1.0',
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
        '0.1.0',
        '--target',
        'stable',
        '--dry-run',
      ],
      repoRoot,
    ),
  )

  if (prereleasePlan.tag !== 'v0.1.0') {
    throw new Error('prerelease promotion tag mismatch')
  }
  if (prereleasePlan.target !== 'prerelease') {
    throw new Error('prerelease promotion target mismatch')
  }
  if (!prereleasePlan.command.includes('--draft=false')) {
    throw new Error('prerelease promotion draft flag mismatch')
  }
  if (!prereleasePlan.command.includes('--prerelease')) {
    throw new Error('prerelease promotion prerelease flag mismatch')
  }
  if (!prereleasePlan.command.includes('--latest=false')) {
    throw new Error('prerelease promotion latest flag mismatch')
  }

  if (stablePlan.tag !== 'v0.1.0') {
    throw new Error('stable promotion tag mismatch')
  }
  if (stablePlan.target !== 'stable') {
    throw new Error('stable promotion target mismatch')
  }
  if (!stablePlan.command.includes('--draft=false')) {
    throw new Error('stable promotion draft flag mismatch')
  }
  if (stablePlan.command.includes('--prerelease')) {
    throw new Error('stable promotion should not include prerelease flag')
  }
  if (!stablePlan.command.includes('--latest=true')) {
    throw new Error('stable promotion latest flag mismatch')
  }

  console.log('[PASS] promote-github-release-smoke')
  console.log(`  prerelease=${prereleasePlan.command}`)
  console.log(`  stable=${stablePlan.command}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
