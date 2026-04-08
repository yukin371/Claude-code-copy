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

async function tryNativeBinary(pathToBinary: string | undefined | null): Promise<boolean> {
  if (!pathToBinary) {
    return false
  }

  const resolvedCandidate = resolve(pathToBinary)
  const resolvedSelf = resolve(process.execPath)
  if (resolvedCandidate.toLowerCase() === resolvedSelf.toLowerCase()) {
    return false
  }

  try {
    const child = Bun.spawn({
      cmd: [resolvedCandidate, ...process.argv.slice(2)],
      cwd: dirname(resolvedCandidate),
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
      env: process.env,
    })

    const exitCode = await child.exited
    process.exit(exitCode)
    return true
  } catch (error) {
    console.error('Failed to launch native binary', pathToBinary, error)
    return false
  }
}

const exeDir = dirname(process.execPath)
const exeName = process.execPath.replace(/^.*[\\/]/, '')
const commandName = exeName.replace(/\.exe$/i, '')
const nativeCandidates = [
  process.env.NEKO_CODE_NATIVE_BINARY,
  process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'NekoCode', 'bin', `${commandName}.exe`)
    : undefined,
  join(exeDir, `${commandName}-native.exe`),
  join(exeDir, 'neko-native.exe'),
]

for (const candidate of nativeCandidates) {
  await tryNativeBinary(candidate)
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
