#!/usr/bin/env bun

import { existsSync } from 'node:fs'
import { copyFile, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createOpenAICompatibleSmokeEnv,
  startOpenAICompatibleSmokeServer,
} from './openai-compatible-smoke-server.js'

type CommandResult = {
  args: string[]
  exitCode: number
  stdout: string
  stderr: string
}

type SmokeOptions = {
  keepTemp: boolean
  disableMcpServers?: string
}

const COMMAND_TIMEOUT_MS = 180_000
const PYTHON_RUNNER = `
import base64, json, subprocess, sys
payload = json.loads(base64.b64decode(sys.argv[1]).decode('utf-8'))
completed = subprocess.run(
    payload["args"],
    cwd=payload["cwd"],
    env=payload["env"],
    capture_output=True,
    text=True,
    timeout=payload["timeout_ms"] / 1000,
)
print(json.dumps({
    "exitCode": completed.returncode,
    "stdout": completed.stdout,
    "stderr": completed.stderr,
}))
`.trim()

function parseArgs(argv: string[]): SmokeOptions {
  let keepTemp = false
  let disableMcpServers: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--keep-temp') {
      keepTemp = true
      continue
    }

    if (arg === '--disable-serena') {
      disableMcpServers = disableMcpServers
        ? `${disableMcpServers},serena`
        : 'serena'
      continue
    }

    if (arg === '--disable-mcp-servers') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('--disable-mcp-servers requires a comma separated value')
      }
      disableMcpServers = value
      index += 1
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  return {
    keepTemp,
    disableMcpServers,
  }
}

function normalize(text: string): string {
  return text.replace(/\r/g, '').trim()
}

async function runCommand(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  const pythonPath = Bun.which('python') ?? Bun.which('py')
  if (!pythonPath) {
    throw new Error('Python runtime is required for native-distribution-smoke')
  }

  const payload = Buffer.from(
    JSON.stringify({
      args,
      cwd,
      env,
      timeout_ms: COMMAND_TIMEOUT_MS,
    }),
    'utf8',
  ).toString('base64')

  const child = Bun.spawn([pythonPath, '-c', PYTHON_RUNNER, payload], {
    stdout: 'pipe',
    stderr: 'pipe',
    windowsHide: true,
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])

  if (exitCode !== 0) {
    throw new Error(
      `Python command runner failed with exit ${exitCode}: ${normalize(stderr || stdout)}`,
    )
  }

  const result = JSON.parse(stdout) as Omit<CommandResult, 'args'>
  return {
    args,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

async function readTranscriptResult(configDir: string): Promise<string> {
  const transcriptGlob = new Bun.Glob('projects/**/*.jsonl')
  let latestPath: string | undefined
  let latestMtime = -1

  for await (const relativePath of transcriptGlob.scan({ cwd: configDir })) {
    const absolutePath = join(configDir, relativePath)
    const stat = await Bun.file(absolutePath).stat()
    const mtime = stat.mtime?.getTime() ?? 0
    if (mtime > latestMtime) {
      latestMtime = mtime
      latestPath = absolutePath
    }
  }

  if (!latestPath) {
    return ''
  }

  const content = await readFile(latestPath, 'utf8')
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (!line) {
      continue
    }

    try {
      const entry = JSON.parse(line) as {
        type?: string
        message?: {
          role?: string
          content?: Array<{ type?: string; text?: string }>
        }
      }
      if (entry.type !== 'assistant' || entry.message?.role !== 'assistant') {
        continue
      }

      const textBlock = entry.message.content
        ?.slice()
        .reverse()
        .find(block => block?.type === 'text' && typeof block.text === 'string')

      if (textBlock?.text) {
        return normalize(textBlock.text)
      }
    } catch {}
  }

  return ''
}

function assertZeroExit(result: CommandResult, description: string): void {
  if (result.exitCode !== 0) {
    throw new Error(
      `${description} failed with exit ${result.exitCode}: ${normalize(
        result.stderr || result.stdout,
      )}`,
    )
  }
}

async function main(): Promise<void> {
  const repoRoot = process.cwd()
  const distBinary = join(repoRoot, 'dist', 'neko-code.exe')
  const options = parseArgs(process.argv.slice(2))
  const keepTemp = options.keepTemp
  const baseEnv = { ...process.env }
  if (options.disableMcpServers) {
    baseEnv.NEKO_CODE_DISABLED_MCP_SERVERS = options.disableMcpServers
  }

  const bunPath = Bun.which('bun') ?? process.execPath
  console.log('[RUN] bun run build:native')
  const buildResult = await runCommand([bunPath, 'run', 'build:native'], repoRoot, baseEnv)
  if (buildResult.exitCode !== 0) {
    console.error('[FAIL] build:native failed', buildResult.stderr || buildResult.stdout)
    process.exit(buildResult.exitCode ?? 1)
  }

  if (!existsSync(distBinary)) {
    throw new Error(`Compiled binary missing at ${distBinary}`)
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'neko-native-distribution-'))
  const stagedBinary = join(tempDir, 'neko-code.exe')
  await copyFile(distBinary, stagedBinary)

  console.log(`[INFO] Copied binary to temp dir ${tempDir}`)

  const mockServer = startOpenAICompatibleSmokeServer({ defaultReply: 'OK' })

  try {
    const nativeConfigDir = join(tempDir, 'native-config')
    const nativePluginCacheDir = join(tempDir, 'native-plugin-cache')
    const sourceConfigDir = join(tempDir, 'source-config')
    const sourcePluginCacheDir = join(tempDir, 'source-plugin-cache')
    await Promise.all([
      mkdir(nativeConfigDir, { recursive: true }),
      mkdir(nativePluginCacheDir, { recursive: true }),
      mkdir(sourceConfigDir, { recursive: true }),
      mkdir(sourcePluginCacheDir, { recursive: true }),
    ])

    const nativeEnv = createOpenAICompatibleSmokeEnv(
      {
        ...baseEnv,
        NEKO_CODE_CONFIG_DIR: nativeConfigDir,
        CLAUDE_CODE_PLUGIN_CACHE_DIR: nativePluginCacheDir,
        CLAUDE_CODE_SIMPLE: '1',
      },
      mockServer.baseUrl,
    )
    const sourceEnv = createOpenAICompatibleSmokeEnv(
      {
        ...baseEnv,
        NEKO_CODE_CONFIG_DIR: sourceConfigDir,
        CLAUDE_CODE_PLUGIN_CACHE_DIR: sourcePluginCacheDir,
        CLAUDE_CODE_SIMPLE: '1',
      },
      mockServer.baseUrl,
    )

    console.log('[RUN] staged --version')
    const versionResult = await runCommand([stagedBinary, '--version'], tempDir, nativeEnv)
    if (versionResult.exitCode !== 0) {
      throw new Error(`--version failed: ${normalize(versionResult.stderr || versionResult.stdout)}`)
    }

    console.log('[RUN] staged --help')
    const helpResult = await runCommand([stagedBinary, '--help'], tempDir, nativeEnv)
    if (helpResult.exitCode !== 0) {
      throw new Error(`--help failed: ${normalize(helpResult.stderr || helpResult.stdout)}`)
    }

    const smokePrompt = 'Reply with exactly OK'
    const nativeSmokeArgs = [
      stagedBinary,
      '--bare',
      '-p',
      '--max-turns',
      '1',
      smokePrompt,
    ]
    const sourceSmokeArgs = [
      bunPath,
      join(repoRoot, 'src/entrypoints/cli.tsx'),
      '--bare',
      '-p',
      '--max-turns',
      '1',
      smokePrompt,
    ]

    console.log('[RUN] staged -p smoke')
    const nativeSmoke = await runCommand(nativeSmokeArgs, tempDir, nativeEnv)
    console.log('[RUN] source -p smoke')
    const sourceSmoke = await runCommand(sourceSmokeArgs, tempDir, sourceEnv)

    assertZeroExit(nativeSmoke, 'native (-p)')
    assertZeroExit(sourceSmoke, 'source (-p)')

    const nativeOutput =
      normalize(nativeSmoke.stdout) || (await readTranscriptResult(nativeConfigDir))
    const sourceOutput =
      normalize(sourceSmoke.stdout) || (await readTranscriptResult(sourceConfigDir))
    const expectedSmokeOutput = 'OK'

    if (nativeOutput !== expectedSmokeOutput || sourceOutput !== expectedSmokeOutput) {
      throw new Error(
        `Smoke output mismatch:\n  nativeExit=${nativeSmoke.exitCode}\n  nativeStdout=${JSON.stringify(nativeSmoke.stdout)}\n  nativeStderr=${JSON.stringify(nativeSmoke.stderr)}\n  sourceExit=${sourceSmoke.exitCode}\n  sourceStdout=${JSON.stringify(sourceSmoke.stdout)}\n  sourceStderr=${JSON.stringify(sourceSmoke.stderr)}\n  expected=${expectedSmokeOutput}`,
      )
    }

    if (nativeOutput !== sourceOutput) {
      throw new Error(
        `Native (-p) output mismatch:\n  native: ${nativeOutput}\n  source: ${sourceOutput}`,
      )
    }

    console.log('[PASS] native-distribution-smoke')
    console.log(`  tempDir=${tempDir}`)
    console.log(`  version=${normalize(versionResult.stdout)}`)
    console.log(`  help=${normalize(helpResult.stdout.split('\n')[0] ?? '')}`)
    console.log(`  nativeExit=${nativeSmoke.exitCode}`)
    console.log(`  nativeOutput=${nativeOutput}`)
    console.log(`  sourceExit=${sourceSmoke.exitCode}`)
    console.log(`  sourceOutput=${sourceOutput}`)
  } finally {
    mockServer.stop()

    if (!keepTemp) {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
