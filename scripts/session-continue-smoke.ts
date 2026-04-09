#!/usr/bin/env bun

import type { UUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileSuffixForOauthConfig } from '../src/constants/oauth.js'
import { GLOBAL_CONFIG_BASENAME } from '../src/constants/product.js'
import { migrateClaudeConfigDirectory } from '../src/migrations/migrateClaudeConfigToNekoHome.js'
import {
  createAssistantMessage,
  createCompactBoundaryMessage,
  createUserMessage,
} from '../src/utils/messages.js'
import { getProjectDir } from '../src/utils/sessionStorage.js'
import { SKIP_PRECOMPACT_THRESHOLD } from '../src/utils/sessionStoragePortable.js'

type EnvKey =
  | 'NEKO_CODE_CONFIG_DIR'
  | 'CLAUDE_CODE_PLUGIN_CACHE_DIR'
  | 'CLAUDE_CODE_SIMPLE'
  | 'NEKO_CODE_DISABLED_MCP_SERVERS'

type SmokeEnvironment = {
  tempRoot: string
  workspaceDir: string
  configDir: string
  pluginCacheDir: string
}

type SmokeOptions = {
  keepTemp: boolean
  sourceDir: string
  disableMcpServers?: string
}

type CommandResult = {
  args: string[]
  exitCode: number
  stdout: string
  stderr: string
}

type MockChatCompletionRequest = {
  messages?: Array<{
    role?: string
    content?: string | Array<{ type?: string; text?: string }>
  }>
  model?: string
  stream?: boolean
}

const trackedEnvVars: EnvKey[] = [
  'NEKO_CODE_CONFIG_DIR',
  'CLAUDE_CODE_PLUGIN_CACHE_DIR',
  'CLAUDE_CODE_SIMPLE',
  'NEKO_CODE_DISABLED_MCP_SERVERS',
]

const repoRoot = process.cwd()
const cliEntrypoint = join(repoRoot, 'src/entrypoints/cli.tsx')
const firstPrompt = 'Reply with exactly FIRST'
const secondPrompt = 'Reply with exactly SECOND'
const compactedContinuePrompt = 'Reply with exactly COMPACT'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function parseArgs(argv: string[]): SmokeOptions {
  let keepTemp = false
  let sourceDir = join(homedir(), '.claude')
  let disableMcpServers: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--keep-temp') {
      keepTemp = true
      continue
    }

    if (arg === '--source-dir') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('--source-dir requires a path value')
      }
      sourceDir = resolve(value)
      index += 1
      continue
    }

    if (arg === '--disable-mcp-servers') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('--disable-mcp-servers requires a csv value')
      }
      disableMcpServers = value
      index += 1
      continue
    }

    if (arg === '--disable-serena') {
      disableMcpServers = disableMcpServers
        ? `${disableMcpServers},serena`
        : 'serena'
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  return {
    keepTemp,
    sourceDir,
    disableMcpServers,
  }
}

function getTargetGlobalConfigPath(configDir: string): string {
  return join(
    configDir,
    `${GLOBAL_CONFIG_BASENAME}${fileSuffixForOauthConfig()}.json`,
  )
}

function writeMergedGlobalConfig(
  targetGlobalConfigPath: string,
  legacyConfig: Record<string, unknown>,
): boolean {
  const { migrationVersion: _ignoredMigrationVersion, ...rest } = legacyConfig
  const currentConfig =
    existsSync(targetGlobalConfigPath)
      ? (JSON.parse(readFileSync(targetGlobalConfigPath, 'utf8')) as Record<
          string,
          unknown
        >)
      : {}
  const mergedConfig: Record<string, unknown> = { ...currentConfig }
  let changed = false

  for (const [key, value] of Object.entries(rest)) {
    if (
      key === 'mcpServers' &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      const currentServers =
        currentConfig.mcpServers &&
        typeof currentConfig.mcpServers === 'object' &&
        !Array.isArray(currentConfig.mcpServers)
          ? (currentConfig.mcpServers as Record<string, unknown>)
          : undefined
      const legacyServers = value as Record<string, unknown>

      if (!currentServers) {
        mergedConfig.mcpServers = { ...legacyServers }
        changed = true
        continue
      }

      const missingEntries = Object.entries(legacyServers).filter(
        ([serverName]) => currentServers[serverName] === undefined,
      )
      if (missingEntries.length > 0) {
        mergedConfig.mcpServers = {
          ...legacyServers,
          ...currentServers,
        }
        changed = true
      }
      continue
    }

    if (mergedConfig[key] === undefined) {
      mergedConfig[key] = value
      changed = true
    }
  }

  if (!changed) {
    return false
  }

  mkdirSync(dirname(targetGlobalConfigPath), { recursive: true })
  writeFileSync(
    targetGlobalConfigPath,
    `${JSON.stringify(mergedConfig, null, 2)}\n`,
    'utf8',
  )
  return true
}

async function createEnvironment(): Promise<SmokeEnvironment> {
  const tempRoot = await mkdtemp(join(tmpdir(), 'neko-session-continue-smoke-'))
  const workspaceDir = join(tempRoot, 'workspace')
  const configDir = join(tempRoot, 'config')
  const pluginCacheDir = join(tempRoot, 'plugin-cache')

  mkdirSync(workspaceDir, { recursive: true })
  mkdirSync(configDir, { recursive: true })
  mkdirSync(pluginCacheDir, { recursive: true })

  return {
    tempRoot,
    workspaceDir,
    configDir,
    pluginCacheDir,
  }
}

async function listTranscriptFiles(projectDir: string): Promise<string[]> {
  const files: string[] = []

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
        continue
      }
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        files.push(fullPath)
      }
    }
  }

  await walk(projectDir)
  return files.sort((left, right) => left.localeCompare(right))
}

async function countTranscriptLines(path: string): Promise<number> {
  const content = await readFile(path, 'utf8')
  return content
    .split('\n')
    .filter(line => line.trim().length > 0).length
}

function normalizeOutput(text: string): string {
  return text.replace(/\r/g, '').trim()
}

function printCommandResult(label: string, result: CommandResult): void {
  console.log(`[${label}] exit=${result.exitCode}`)
  console.log(`  args=${result.args.join(' ')}`)
  console.log(`  stdout=${normalizeOutput(result.stdout) || '[empty]'}`)
  if (normalizeOutput(result.stderr)) {
    console.log(`  stderr=${normalizeOutput(result.stderr)}`)
  }
}

async function runCommand(
  args: string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
): Promise<CommandResult> {
  const bunPath = Bun.which('bun') ?? process.execPath
  const proc = Bun.spawn([bunPath, ...args], {
    cwd,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  return {
    args,
    exitCode,
    stdout,
    stderr,
  }
}

function extractPromptText(
  content: MockChatCompletionRequest['messages'][number]['content'],
): string {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .map(block => (typeof block?.text === 'string' ? block.text : ''))
    .join('\n')
}

function getMockReply(body: MockChatCompletionRequest): string {
  const prompt = (body.messages ?? [])
    .filter(message => message.role === 'user')
    .map(message => extractPromptText(message.content))
    .join('\n')

  if (prompt.includes(compactedContinuePrompt)) {
    return 'COMPACT'
  }
  if (prompt.includes(secondPrompt)) {
    return 'SECOND'
  }
  if (prompt.includes(firstPrompt)) {
    return 'FIRST'
  }
  return 'OK'
}

function createMockOpenAIResponse(
  body: MockChatCompletionRequest,
  content: string,
): Response {
  const model = body.model ?? 'smoke-model'
  if (body.stream) {
    const encoder = new TextEncoder()
    const frames = [
      `data: ${JSON.stringify({
        id: 'chatcmpl-smoke',
        model,
        choices: [{ index: 0, delta: { role: 'assistant', content } }],
      })}\n\n`,
      `data: ${JSON.stringify({
        id: 'chatcmpl-smoke',
        model,
        choices: [{ index: 0, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 8,
          completion_tokens: 1,
          total_tokens: 9,
        },
      })}\n\n`,
      'data: [DONE]\n\n',
    ]

    return new Response(
      new ReadableStream({
        start(controller) {
          for (const frame of frames) {
            controller.enqueue(encoder.encode(frame))
          }
          controller.close()
        },
      }),
      {
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'request-id': 'req_session_continue_smoke',
        },
      },
    )
  }

  return Response.json(
    {
      id: 'chatcmpl-smoke',
      model,
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content,
          },
        },
      ],
      usage: {
        prompt_tokens: 8,
        completion_tokens: 1,
        total_tokens: 9,
      },
    },
    {
      status: 200,
      headers: {
        'request-id': 'req_session_continue_smoke',
      },
    },
  )
}

function serializeTranscriptMessage<T extends { uuid: UUID | string; timestamp: string }>(
  message: T,
  {
    sessionId,
    cwd,
    parentUuid,
  }: {
    sessionId: string
    cwd: string
    parentUuid: UUID | null
  },
) {
  return {
    ...message,
    parentUuid,
    cwd,
    userType: 'external',
    sessionId,
    version: 'session-continue-smoke',
  }
}

function createSerializedUserMessage({
  sessionId,
  cwd,
  uuid,
  timestamp,
  content,
  parentUuid,
  isCompactSummary,
}: {
  sessionId: string
  cwd: string
  uuid: UUID
  timestamp: string
  content: string
  parentUuid: UUID | null
  isCompactSummary?: true
}) {
  const message = createUserMessage({
    content,
    uuid,
    timestamp,
    ...(isCompactSummary ? { isCompactSummary: true } : {}),
  })
  return serializeTranscriptMessage(message, { sessionId, cwd, parentUuid })
}

function createSerializedAssistantMessage({
  sessionId,
  cwd,
  uuid,
  timestamp,
  content,
  parentUuid,
  usage,
}: {
  sessionId: string
  cwd: string
  uuid: UUID
  timestamp: string
  content: string
  parentUuid: UUID
  usage?: Parameters<typeof createAssistantMessage>[0]['usage']
}) {
  const message = createAssistantMessage({ content, usage })
  return serializeTranscriptMessage(
    { ...message, uuid, timestamp },
    { sessionId, cwd, parentUuid },
  )
}

async function seedCompactedTranscript(workspaceDir: string): Promise<{
  transcriptPath: string
  initialLineCount: number
}> {
  const sessionId = 'f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0' as UUID
  const introUserUuid = '16161616-1616-4616-8616-161616161616' as UUID
  const introAssistantUuid = '17171717-1717-4717-8717-171717171717' as UUID
  const preservedUserUuid = '18181818-1818-4818-8818-181818181818' as UUID
  const preservedAssistantUuid = '19191919-1919-4919-8919-191919191919' as UUID
  const summaryUuid = '20202020-2020-4020-8020-202020202020' as UUID
  const postUserUuid = '21212121-2121-4121-8121-212121212121' as UUID
  const postAssistantUuid = '22222222-2222-4222-8222-222222222222' as UUID
  const projectDir = getProjectDir(workspaceDir)
  const transcriptPath = join(projectDir, `${sessionId}.jsonl`)
  const largePreCompactText = 'legacy compact context '.repeat(
    Math.ceil(
      (SKIP_PRECOMPACT_THRESHOLD + 2048) / 'legacy compact context '.length,
    ),
  )
  const boundary = createCompactBoundaryMessage(
    'manual',
    6_144,
    preservedAssistantUuid,
    'Preserve only the latest exchange before continue.',
    4,
  )
  boundary.timestamp = '2026-04-09T08:09:00.000Z'
  boundary.compactMetadata = {
    ...boundary.compactMetadata,
    preservedSegment: {
      headUuid: preservedUserUuid,
      anchorUuid: summaryUuid,
      tailUuid: preservedAssistantUuid,
    },
  }

  const lines = [
    createSerializedUserMessage({
      sessionId,
      cwd: workspaceDir,
      uuid: introUserUuid,
      timestamp: '2026-04-09T08:00:00.000Z',
      content: 'Pre-compact continue prompt',
      parentUuid: null,
    }),
    createSerializedAssistantMessage({
      sessionId,
      cwd: workspaceDir,
      uuid: introAssistantUuid,
      timestamp: '2026-04-09T08:00:01.000Z',
      content: largePreCompactText,
      parentUuid: introUserUuid,
    }),
    createSerializedUserMessage({
      sessionId,
      cwd: workspaceDir,
      uuid: preservedUserUuid,
      timestamp: '2026-04-09T08:05:00.000Z',
      content: 'Keep this latest user exchange before continue',
      parentUuid: introAssistantUuid,
    }),
    createSerializedAssistantMessage({
      sessionId,
      cwd: workspaceDir,
      uuid: preservedAssistantUuid,
      timestamp: '2026-04-09T08:05:01.000Z',
      content: 'Keep this latest assistant exchange before continue',
      parentUuid: preservedUserUuid,
      usage: {
        input_tokens: 190_000,
        output_tokens: 512,
        cache_creation_input_tokens: 17,
        cache_read_input_tokens: 33,
      },
    }),
    {
      type: 'custom-title',
      sessionId,
      customTitle: 'Compacted Continue Session',
    },
    {
      type: 'agent-setting',
      sessionId,
      agentSetting: 'compact-continue-agent',
    },
    {
      type: 'mode',
      sessionId,
      mode: 'normal',
    },
    serializeTranscriptMessage(boundary, {
      sessionId,
      cwd: workspaceDir,
      parentUuid: null,
    }),
    createSerializedUserMessage({
      sessionId,
      cwd: workspaceDir,
      uuid: summaryUuid,
      timestamp: '2026-04-09T08:09:01.000Z',
      content: 'Compact summary: preserved the latest exchange for continue.',
      parentUuid: boundary.uuid,
      isCompactSummary: true,
    }),
    createSerializedUserMessage({
      sessionId,
      cwd: workspaceDir,
      uuid: postUserUuid,
      timestamp: '2026-04-09T08:10:00.000Z',
      content: 'Ask one more thing after compaction.',
      parentUuid: preservedAssistantUuid,
    }),
    createSerializedAssistantMessage({
      sessionId,
      cwd: workspaceDir,
      uuid: postAssistantUuid,
      timestamp: '2026-04-09T08:10:01.000Z',
      content: 'Here is the post-compact answer before continue.',
      parentUuid: postUserUuid,
    }),
  ]

  mkdirSync(projectDir, { recursive: true })
  await writeFile(
    transcriptPath,
    `${lines.map(line => JSON.stringify(line)).join('\n')}\n`,
    'utf8',
  )

  const transcriptStats = await stat(transcriptPath)
  assert(
    transcriptStats.size > SKIP_PRECOMPACT_THRESHOLD,
    `Expected compacted continue transcript to exceed ${SKIP_PRECOMPACT_THRESHOLD} bytes, got ${transcriptStats.size}`,
  )

  return {
    transcriptPath,
    initialLineCount: lines.length,
  }
}

const options = parseArgs(process.argv.slice(2))
assert(
  existsSync(options.sourceDir),
  `Claude config source dir not found: ${options.sourceDir}`,
)

const oldEnv = new Map<EnvKey, string | undefined>()
for (const key of trackedEnvVars) {
  oldEnv.set(key, process.env[key])
}

const environment = await createEnvironment()
const mockServer = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url)
    if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
      const body = (await request.json()) as MockChatCompletionRequest
      return createMockOpenAIResponse(body, getMockReply(body))
    }
    return new Response('not found', { status: 404 })
  },
})

try {
  const targetGlobalConfigPath = getTargetGlobalConfigPath(environment.configDir)
  migrateClaudeConfigDirectory({
    sourceDir: options.sourceDir,
    targetDir: environment.configDir,
    targetPluginsDir: environment.pluginCacheDir,
    targetGlobalConfigPath,
    mergeGlobalConfig: legacyConfig =>
      writeMergedGlobalConfig(targetGlobalConfigPath, legacyConfig),
  })

  process.env.NEKO_CODE_CONFIG_DIR = environment.configDir
  process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR = environment.pluginCacheDir
  process.env.CLAUDE_CODE_SIMPLE = '1'
  if (options.disableMcpServers) {
    process.env.NEKO_CODE_DISABLED_MCP_SERVERS = options.disableMcpServers
  } else {
    delete process.env.NEKO_CODE_DISABLED_MCP_SERVERS
  }

  const childEnv = {
    ...process.env,
    OPENAI_API_KEY: 'smoke-key',
    OPENAI_BASE_URL: `http://127.0.0.1:${mockServer.port}/v1`,
    NEKO_CODE_OPENAI_COMPATIBLE_API_KEY: 'smoke-key',
    NEKO_CODE_OPENAI_COMPATIBLE_BASE_URL: `http://127.0.0.1:${mockServer.port}/v1`,
    NEKO_CODE_MAIN_PROVIDER: 'openai-compatible',
    NEKO_CODE_MAIN_API_STYLE: 'openai-compatible',
    NEKO_CODE_MAIN_API_KEY: 'smoke-key',
    NEKO_CODE_MAIN_BASE_URL: `http://127.0.0.1:${mockServer.port}/v1`,
  }
  const liveProjectDir = getProjectDir(environment.workspaceDir)

  const firstRun = await runCommand(
    [cliEntrypoint, '-p', '--max-turns', '1', firstPrompt],
    childEnv,
    environment.workspaceDir,
  )
  printCommandResult('first-run', firstRun)
  assert(firstRun.exitCode === 0, 'First print run failed')
  assert(
    normalizeOutput(firstRun.stdout) === 'FIRST',
    `Expected first run stdout FIRST, got ${normalizeOutput(firstRun.stdout) || '[empty]'}`,
  )

  const transcriptsAfterFirst = await listTranscriptFiles(liveProjectDir)
  assert(
    transcriptsAfterFirst.length === 1,
    `Expected exactly one transcript after first run, found ${transcriptsAfterFirst.length}`,
  )
  const liveTranscriptPath = transcriptsAfterFirst[0]!
  const liveFirstLineCount = await countTranscriptLines(liveTranscriptPath)

  const secondRun = await runCommand(
    [cliEntrypoint, '-p', '--continue', '--max-turns', '1', secondPrompt],
    childEnv,
    environment.workspaceDir,
  )
  printCommandResult('continue-run', secondRun)
  assert(secondRun.exitCode === 0, 'Continue print run failed')
  assert(
    normalizeOutput(secondRun.stdout) === 'SECOND',
    `Expected continue run stdout SECOND, got ${normalizeOutput(secondRun.stdout) || '[empty]'}`,
  )

  const transcriptsAfterSecond = await listTranscriptFiles(liveProjectDir)
  assert(
    transcriptsAfterSecond.length === 1,
    `Expected exactly one transcript after continue run, found ${transcriptsAfterSecond.length}`,
  )
  assert(
    transcriptsAfterSecond[0] === liveTranscriptPath,
    'Expected --continue to append to the existing transcript instead of creating a new one',
  )

  const liveSecondLineCount = await countTranscriptLines(liveTranscriptPath)
  assert(
    liveSecondLineCount > liveFirstLineCount,
    `Expected transcript line count to increase after --continue (${liveFirstLineCount} -> ${liveSecondLineCount})`,
  )

  const compactedWorkspaceDir = join(environment.tempRoot, 'workspace-compacted')
  mkdirSync(compactedWorkspaceDir, { recursive: true })
  const compactedProjectDir = getProjectDir(compactedWorkspaceDir)
  const {
    transcriptPath: compactedTranscriptPath,
    initialLineCount: compactedFirstLineCount,
  } = await seedCompactedTranscript(compactedWorkspaceDir)
  const compactedRun = await runCommand(
    [cliEntrypoint, '-p', '--continue', '--max-turns', '1', compactedContinuePrompt],
    childEnv,
    compactedWorkspaceDir,
  )
  printCommandResult('compacted-continue-run', compactedRun)
  assert(compactedRun.exitCode === 0, 'Compacted continue print run failed')
  assert(
    normalizeOutput(compactedRun.stdout) === 'COMPACT',
    `Expected compacted continue stdout COMPACT, got ${normalizeOutput(compactedRun.stdout) || '[empty]'}`,
  )

  const compactedTranscriptsAfter = await listTranscriptFiles(compactedProjectDir)
  assert(
    compactedTranscriptsAfter.length === 1,
    `Expected exactly one transcript after compacted continue run, found ${compactedTranscriptsAfter.length}`,
  )
  assert(
    compactedTranscriptsAfter[0] === compactedTranscriptPath,
    'Expected compacted --continue to append to the seeded transcript instead of creating a new one',
  )
  const compactedSecondLineCount = await countTranscriptLines(compactedTranscriptPath)
  assert(
    compactedSecondLineCount > compactedFirstLineCount,
    `Expected compacted transcript line count to increase after --continue (${compactedFirstLineCount} -> ${compactedSecondLineCount})`,
  )

  console.log('')
  console.log(`[PASS] session-continue-smoke`)
  console.log(`  tempRoot=${environment.tempRoot}`)
  console.log(`  liveProjectDir=${liveProjectDir}`)
  console.log(`  liveTranscript=${relative(environment.tempRoot, liveTranscriptPath)}`)
  console.log(`  liveTranscriptLines=${liveFirstLineCount} -> ${liveSecondLineCount}`)
  console.log(`  compactedProjectDir=${compactedProjectDir}`)
  console.log(
    `  compactedTranscript=${relative(environment.tempRoot, compactedTranscriptPath)}`,
  )
  console.log(
    `  compactedTranscriptLines=${compactedFirstLineCount} -> ${compactedSecondLineCount}`,
  )
  console.log(`  disabledMcpServers=${options.disableMcpServers ?? '(none)'}`)
} finally {
  mockServer.stop(true)

  for (const key of trackedEnvVars) {
    const value = oldEnv.get(key)
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  if (!options.keepTemp) {
    await rm(environment.tempRoot, { recursive: true, force: true })
  }
}
