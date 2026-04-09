#!/usr/bin/env bun

type PromoteOptions = {
  version: string
  target: 'draft' | 'prerelease' | 'stable'
  draft: boolean
  prerelease: boolean
  latest: boolean
  dryRun: boolean
}

type CommandOutput = {
  exitCode: number
  stdout: string
  stderr: string
}

const promoteTargets = {
  draft: {
    draft: true,
    prerelease: true,
    latest: false,
  },
  prerelease: {
    draft: false,
    prerelease: true,
    latest: false,
  },
  stable: {
    draft: false,
    prerelease: false,
    latest: true,
  },
} as const

function parseBoolean(value: string, flag: string): boolean {
  if (value === 'true') {
    return true
  }

  if (value === 'false') {
    return false
  }

  throw new Error(`Invalid value for ${flag}: ${value}. Use true or false.`)
}

function parseArgs(argv: string[]): PromoteOptions {
  let version: string | undefined
  let target: PromoteOptions['target'] | undefined
  let draft: boolean | undefined
  let prerelease: boolean | undefined
  let latest: boolean | undefined
  let dryRun = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--version') {
      version = argv[index + 1]
      index += 1
      continue
    }

    if (arg === '--target') {
      const value = argv[index + 1] as PromoteOptions['target'] | undefined
      if (!value || !(value in promoteTargets)) {
        throw new Error(`Invalid value for --target: ${argv[index + 1]}. Use draft, prerelease, or stable.`)
      }
      target = value
      index += 1
      continue
    }

    if (arg === '--draft') {
      draft = parseBoolean(argv[index + 1] ?? '', '--draft')
      index += 1
      continue
    }

    if (arg === '--prerelease') {
      prerelease = parseBoolean(argv[index + 1] ?? '', '--prerelease')
      index += 1
      continue
    }

    if (arg === '--latest') {
      latest = parseBoolean(argv[index + 1] ?? '', '--latest')
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

  if (target) {
    const policy = promoteTargets[target]
    return {
      version,
      target,
      draft: policy.draft,
      prerelease: policy.prerelease,
      latest: policy.latest,
      dryRun,
    }
  }

  if (draft === undefined) {
    throw new Error('Missing required argument: --target <draft|prerelease|stable> or --draft <true|false>')
  }
  if (prerelease === undefined) {
    throw new Error('Missing required argument: --target <draft|prerelease|stable> or --prerelease <true|false>')
  }
  if (latest === undefined) {
    throw new Error('Missing required argument: --target <draft|prerelease|stable> or --latest <true|false>')
  }

  const fallbackTarget: PromoteOptions['target'] =
    draft ? 'draft' : prerelease ? 'prerelease' : latest ? 'stable' : 'prerelease'

  return {
    version,
    target: fallbackTarget,
    draft,
    prerelease,
    latest,
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

async function runCommandCapture(
  args: string[],
  cwd: string,
): Promise<CommandOutput> {
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
  const tag = `v${options.version}`
  const readEndpoint = `repos/{owner}/{repo}/releases/tags/${tag}`
  const patchEndpoint = 'repos/{owner}/{repo}/releases/<release-id-from-tag>'
  const patchArgs = [
    'gh',
    'api',
    '--method',
    'PATCH',
    patchEndpoint,
    '-F',
    `draft=${options.draft ? 'true' : 'false'}`,
    '-F',
    `prerelease=${options.prerelease ? 'true' : 'false'}`,
    '-F',
    `make_latest=${options.latest ? 'true' : 'false'}`,
  ]

  if (options.dryRun) {
    console.log('[PLAN] promote-github-release')
    console.log(`tag=${tag}`)
    console.log(`target=${options.target}`)
    console.log(`draft=${options.draft}`)
    console.log(`prerelease=${options.prerelease}`)
    console.log(`latest=${options.latest}`)
    console.log(`readEndpoint=${readEndpoint}`)
    console.log(`patchEndpoint=${patchEndpoint}`)
    console.log(`command=${patchArgs.join(' ')}`)
    return
  }

  const resolveReleaseId = await runCommandCapture(
    ['gh', 'api', readEndpoint, '--jq', '.id'],
    repoRoot,
  )
  if (resolveReleaseId.exitCode !== 0) {
    throw new Error(resolveReleaseId.stderr || resolveReleaseId.stdout)
  }

  const releaseId = resolveReleaseId.stdout.trim()
  if (!/^\d+$/.test(releaseId)) {
    throw new Error(`Unexpected GitHub release id for ${tag}: ${releaseId}`)
  }

  await runCommand(
    [
      'gh',
      'api',
      '--method',
      'PATCH',
      `repos/{owner}/{repo}/releases/${releaseId}`,
      '-F',
      `draft=${options.draft ? 'true' : 'false'}`,
      '-F',
      `prerelease=${options.prerelease ? 'true' : 'false'}`,
      '-F',
      `make_latest=${options.latest ? 'true' : 'false'}`,
    ],
    repoRoot,
  )

  console.log('[PASS] promote-github-release')
  console.log(`  tag=${tag}`)
  console.log(`  releaseId=${releaseId}`)
  console.log(`  target=${options.target}`)
  console.log(`  draft=${options.draft}`)
  console.log(`  prerelease=${options.prerelease}`)
  console.log(`  latest=${options.latest}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
