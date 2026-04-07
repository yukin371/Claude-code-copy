import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

function findRepoRoot(): string {
  const exeDir = dirname(process.execPath)
  const candidates = [
    resolve(process.cwd()),
    resolve(exeDir, '..'),
    resolve(exeDir),
  ]

  for (const candidate of candidates) {
    if (
      existsSync(join(candidate, 'src', 'entrypoints', 'cli.tsx')) &&
      existsSync(join(candidate, 'package.json'))
    ) {
      return candidate
    }
  }

  throw new Error(
    'Unable to locate repository root. Run this launcher from the repo root or keep it under <repo>/dist.',
  )
}

const repoRoot = findRepoRoot()
const entrypoint = join(repoRoot, 'src', 'entrypoints', 'cli.tsx')

const child = Bun.spawn({
  cmd: ['bun', entrypoint, ...process.argv.slice(2)],
  cwd: repoRoot,
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
  env: process.env,
})

const exitCode = await child.exited
process.exit(exitCode)
