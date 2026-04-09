#!/usr/bin/env bun

import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { UUID } from 'node:crypto'
import {
  createAssistantMessage,
  createCompactBoundaryMessage,
  createUserMessage,
} from '../src/utils/messages.js'
import type { PersistedWorktreeSession } from '../src/types/logs.js'
import {
  loadConversationForResume,
  truncateResumeMessagesAt,
} from '../src/utils/conversationRecovery.js'
import { getProjectDir } from '../src/utils/sessionStorage.js'
import { parseSessionIdentifier } from '../src/utils/sessionUrl.js'
import { SKIP_PRECOMPACT_THRESHOLD } from '../src/utils/sessionStoragePortable.js'
import { setCwdState, setOriginalCwd } from '../src/bootstrap/state.js'

type EnvKey =
  | 'NEKO_CODE_CONFIG_DIR'
  | 'CLAUDE_CODE_PLUGIN_CACHE_DIR'
  | 'CLAUDE_CODE_SIMPLE'

type ResumeRun = {
  label: string
  sessionId: string
  messageTypes?: string[]
  messageKinds?: string[]
  customTitle?: string
  mode?: string
  agentSetting?: string
  fullPath?: string
  note?: string
}

const keepTemp = process.argv.includes('--keep-temp')

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
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
    version: 'session-smoke',
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

async function writeSessionFile({
  workspaceDir,
  sessionId,
  lines,
}: {
  workspaceDir: string
  sessionId: string
  lines: unknown[]
}): Promise<string> {
  const projectDir = getProjectDir(workspaceDir)
  const transcriptPath = join(projectDir, `${sessionId}.jsonl`)
  await mkdir(dirname(transcriptPath), { recursive: true })
  await writeFile(
    transcriptPath,
    `${lines.map(line => JSON.stringify(line)).join('\n')}\n`,
    'utf8',
  )
  return transcriptPath
}

async function runMissingSessionCase(sessionId: UUID): Promise<ResumeRun> {
  const result = await loadConversationForResume(sessionId, undefined)
  assert(result === null, 'Expected missing session lookup to return null')

  return {
    label: 'missing-session-id',
    sessionId,
  }
}

async function runStoredSessionCase(
  workspaceDir: string,
  sessionId: UUID,
): Promise<ResumeRun> {
  const userUuid = '11111111-1111-4111-8111-111111111111' as UUID
  const assistantUuid = '22222222-2222-4222-8222-222222222222' as UUID

  await writeSessionFile({
    workspaceDir,
    sessionId,
    lines: [
      createSerializedUserMessage({
        sessionId,
        cwd: workspaceDir,
        uuid: userUuid,
        timestamp: '2026-04-07T10:00:00.000Z',
        content: 'Resume smoke prompt',
        parentUuid: null,
      }),
      createSerializedAssistantMessage({
        sessionId,
        cwd: workspaceDir,
        uuid: assistantUuid,
        timestamp: '2026-04-07T10:00:01.000Z',
        content: 'Resume smoke reply',
        parentUuid: userUuid,
      }),
      {
        type: 'custom-title',
        sessionId,
        customTitle: 'Smoke Resume Session',
      },
      {
        type: 'agent-setting',
        sessionId,
        agentSetting: 'smoke-agent',
      },
      {
        type: 'mode',
        sessionId,
        mode: 'normal',
      },
    ],
  })

  const result = await loadConversationForResume(sessionId, undefined)
  assert(result, 'Expected stored session lookup to return a session')
  assert(
    result.sessionId === sessionId,
    `Expected resumed sessionId ${sessionId}, got ${result.sessionId ?? '(none)'}`,
  )
  assert(
    result.messages.map(message => message.type).join(',') === 'user,assistant',
    `Expected resumed message types user,assistant, got ${result.messages.map(message => message.type).join(',')}`,
  )
  assert(
    result.customTitle === 'Smoke Resume Session',
    `Expected custom title to round-trip, got ${result.customTitle ?? '(none)'}`,
  )
  assert(
    result.agentSetting === 'smoke-agent',
    `Expected agent setting to round-trip, got ${result.agentSetting ?? '(none)'}`,
  )
  assert(
    result.mode === 'normal',
    `Expected mode to round-trip, got ${result.mode ?? '(none)'}`,
  )

  return {
    label: 'stored-session-id',
    sessionId,
    messageTypes: result.messages.map(message => message.type),
    customTitle: result.customTitle,
    mode: result.mode,
    agentSetting: result.agentSetting,
  }
}

async function runJsonlPathCase(
  workspaceDir: string,
  sessionId: UUID,
): Promise<ResumeRun> {
  const userUuid = '23232323-2323-4232-8232-232323232323' as UUID
  const assistantUuid = '24242424-2424-4242-8242-242424242424' as UUID
  const worktreeSession: PersistedWorktreeSession = {
    originalCwd: workspaceDir,
    worktreePath: join(workspaceDir, '.worktrees', 'resume'),
    worktreeName: 'resume-worktree',
    worktreeBranch: 'resume-branch',
    originalBranch: 'main',
    originalHeadCommit: 'abc123',
    sessionId,
    tmuxSessionName: undefined,
    hookBased: false,
  }

  const transcriptPath = join(dirname(workspaceDir), 'external-jsonl', `${sessionId}.jsonl`)
  await mkdir(dirname(transcriptPath), { recursive: true })
  await writeFile(
    transcriptPath,
    `${[
      createSerializedUserMessage({
        sessionId,
        cwd: workspaceDir,
        uuid: userUuid,
        timestamp: '2026-04-07T10:20:00.000Z',
        content: 'Resume this transcript from a jsonl path',
        parentUuid: null,
      }),
      createSerializedAssistantMessage({
        sessionId,
        cwd: workspaceDir,
        uuid: assistantUuid,
        timestamp: '2026-04-07T10:20:01.000Z',
        content: 'Jsonl path resume response',
        parentUuid: userUuid,
      }),
      {
        type: 'custom-title',
        sessionId,
        customTitle: 'Jsonl Resume Session',
      },
      {
        type: 'agent-setting',
        sessionId,
        agentSetting: 'jsonl-agent',
      },
      {
        type: 'mode',
        sessionId,
        mode: 'coordinator',
      },
      {
        type: 'worktree-state',
        sessionId,
        worktreeSession,
      },
      {
        type: 'pr-link',
        sessionId,
        prNumber: 42,
        prUrl: 'https://example.com/pr/42',
        prRepository: 'owner/repo',
      },
    ]
      .map(line => JSON.stringify(line))
      .join('\n')}\n`,
    'utf8',
  )

  const parsed = parseSessionIdentifier(transcriptPath)
  assert(parsed, 'Expected jsonl transcript path to parse as a resume target')
  assert(parsed.isJsonlFile, 'Expected transcript path to be treated as jsonl')
  assert(
    parsed.jsonlFile === transcriptPath,
    `Expected parsed jsonl path to round-trip, got ${parsed.jsonlFile ?? '(none)'}`,
  )
  assert(
    parsed.sessionId !== sessionId,
    'Expected jsonl path parsing to use a synthetic sessionId before transcript load',
  )

  const result = await loadConversationForResume(
    parsed.sessionId,
    parsed.jsonlFile || undefined,
  )
  assert(result, 'Expected jsonl path resume to load a session')
  assert(
    result.sessionId === sessionId,
    `Expected jsonl path resume to restore sessionId ${sessionId}, got ${result.sessionId ?? '(none)'}`,
  )
  assert(
    result.fullPath === transcriptPath,
    `Expected jsonl path resume to preserve fullPath ${transcriptPath}, got ${result.fullPath ?? '(none)'}`,
  )
  assert(
    result.customTitle === 'Jsonl Resume Session',
    `Expected jsonl path resume title to round-trip, got ${result.customTitle ?? '(none)'}`,
  )
  assert(
    result.agentSetting === 'jsonl-agent',
    `Expected jsonl path resume agent setting to round-trip, got ${result.agentSetting ?? '(none)'}`,
  )
  assert(
    result.mode === 'coordinator',
    `Expected jsonl path resume mode to round-trip, got ${result.mode ?? '(none)'}`,
  )
  assert(
    result.worktreeSession?.worktreeName === worktreeSession.worktreeName,
    `Expected jsonl path resume worktree to round-trip, got ${result.worktreeSession?.worktreeName ?? '(none)'}`,
  )
  assert(
    result.prNumber === 42 &&
      result.prUrl === 'https://example.com/pr/42' &&
      result.prRepository === 'owner/repo',
    `Expected jsonl path resume PR metadata to round-trip, got ${JSON.stringify({
      prNumber: result.prNumber,
      prUrl: result.prUrl,
      prRepository: result.prRepository,
    })}`,
  )

  return {
    label: 'jsonl-path-session',
    sessionId,
    messageTypes: result.messages.map(message => message.type),
    customTitle: result.customTitle,
    mode: result.mode,
    agentSetting: result.agentSetting,
    fullPath: result.fullPath,
  }
}

function formatMessageKind(
  message: NonNullable<Awaited<ReturnType<typeof loadConversationForResume>>>['messages'][number],
): string {
  if (message.type === 'system') {
    return `system:${message.subtype}`
  }
  if (message.type === 'user' && message.isCompactSummary) {
    return 'user:compact_summary'
  }
  return message.type
}

function flattenMessageText(
  message: NonNullable<Awaited<ReturnType<typeof loadConversationForResume>>>['messages'][number],
): string {
  if (message.type === 'system') {
    return typeof message.content === 'string' ? message.content : ''
  }
  const content = message.message.content
  if (typeof content === 'string') {
    return content
  }
  return content
    .map(block => {
      if (typeof block === 'string') {
        return block
      }
      if (typeof block.text === 'string') {
        return block.text
      }
      if ('summary' in block && typeof block.summary === 'string') {
        return block.summary
      }
      return ''
    })
    .join('\n')
}

async function runCompactedLargeSessionCase(
  workspaceDir: string,
  sessionId: UUID,
): Promise<ResumeRun> {
  const introUserUuid = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' as UUID
  const introAssistantUuid = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' as UUID
  const preservedUserUuid = 'ffffffff-ffff-4fff-8fff-ffffffffffff' as UUID
  const preservedAssistantUuid = '12121212-1212-4212-8212-121212121212' as UUID
  const summaryUuid = '13131313-1313-4313-8313-131313131313' as UUID
  const postUserUuid = '14141414-1414-4414-8414-141414141414' as UUID
  const postAssistantUuid = '15151515-1515-4515-8515-151515151515' as UUID
  const largePreCompactText = 'legacy context '.repeat(
    Math.ceil((SKIP_PRECOMPACT_THRESHOLD + 2048) / 'legacy context '.length),
  )
  const boundary = createCompactBoundaryMessage(
    'manual',
    6_144,
    preservedAssistantUuid,
    'Keep the latest exchange only.',
    4,
  )
  boundary.timestamp = '2026-04-07T10:09:00.000Z'
  boundary.compactMetadata = {
    ...boundary.compactMetadata,
    preservedSegment: {
      headUuid: preservedUserUuid,
      anchorUuid: summaryUuid,
      tailUuid: preservedAssistantUuid,
    },
  }

  const transcriptPath = await writeSessionFile({
    workspaceDir,
    sessionId,
    lines: [
      createSerializedUserMessage({
        sessionId,
        cwd: workspaceDir,
        uuid: introUserUuid,
        timestamp: '2026-04-07T10:00:00.000Z',
        content: 'Pre-compact intro prompt',
        parentUuid: null,
      }),
      createSerializedAssistantMessage({
        sessionId,
        cwd: workspaceDir,
        uuid: introAssistantUuid,
        timestamp: '2026-04-07T10:00:01.000Z',
        content: largePreCompactText,
        parentUuid: introUserUuid,
      }),
      createSerializedUserMessage({
        sessionId,
        cwd: workspaceDir,
        uuid: preservedUserUuid,
        timestamp: '2026-04-07T10:05:00.000Z',
        content: 'Keep this latest user turn',
        parentUuid: introAssistantUuid,
      }),
      createSerializedAssistantMessage({
        sessionId,
        cwd: workspaceDir,
        uuid: preservedAssistantUuid,
        timestamp: '2026-04-07T10:05:01.000Z',
        content: 'Keep this latest assistant turn',
        parentUuid: preservedUserUuid,
        usage: {
          input_tokens: 190_000,
          output_tokens: 400,
          cache_creation_input_tokens: 11,
          cache_read_input_tokens: 29,
        },
      }),
      {
        type: 'custom-title',
        sessionId,
        customTitle: 'Compacted Resume Session',
      },
      {
        type: 'agent-setting',
        sessionId,
        agentSetting: 'compact-agent',
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
        timestamp: '2026-04-07T10:09:01.000Z',
        content: 'Compact summary: preserved latest exchange.',
        parentUuid: boundary.uuid,
        isCompactSummary: true,
      }),
      createSerializedUserMessage({
        sessionId,
        cwd: workspaceDir,
        uuid: postUserUuid,
        timestamp: '2026-04-07T10:10:00.000Z',
        content: 'Continue after compact',
        parentUuid: preservedAssistantUuid,
      }),
      createSerializedAssistantMessage({
        sessionId,
        cwd: workspaceDir,
        uuid: postAssistantUuid,
        timestamp: '2026-04-07T10:10:01.000Z',
        content: 'Post-compact reply',
        parentUuid: postUserUuid,
      }),
    ],
  })

  const transcriptStats = await stat(transcriptPath)
  assert(
    transcriptStats.size > SKIP_PRECOMPACT_THRESHOLD,
    `Expected compacted smoke transcript to exceed ${SKIP_PRECOMPACT_THRESHOLD} bytes, got ${transcriptStats.size}`,
  )

  const result = await loadConversationForResume(sessionId, undefined)
  assert(result, 'Expected compacted session lookup to return a session')
  assert(
    result.customTitle === 'Compacted Resume Session',
    `Expected compacted session title to round-trip, got ${result.customTitle ?? '(none)'}`,
  )
  assert(
    result.agentSetting === 'compact-agent',
    `Expected compacted session agent setting to round-trip, got ${result.agentSetting ?? '(none)'}`,
  )
  assert(
    result.mode === 'normal',
    `Expected compacted session mode to round-trip, got ${result.mode ?? '(none)'}`,
  )

  const expectedUuids = [
    boundary.uuid,
    summaryUuid,
    preservedUserUuid,
    preservedAssistantUuid,
    postUserUuid,
    postAssistantUuid,
  ]
  const resumedChain = result.messages.filter(message =>
    expectedUuids.includes(message.uuid as UUID),
  )
  const resumedKinds = resumedChain.map(formatMessageKind)
  assert(
    resumedKinds.join(',') ===
      'system:compact_boundary,user:compact_summary,user,assistant,user,assistant',
    `Expected compacted resume chain to start at boundary, got ${resumedKinds.join(',')}`,
  )
  assert(
    !result.messages.some(
      message =>
        message.uuid === introUserUuid || message.uuid === introAssistantUuid,
    ),
    'Expected pre-compact messages to stay pruned after resume',
  )

  const resumedText = result.messages.map(flattenMessageText).join('\n')
  assert(
    !resumedText.includes('Pre-compact intro prompt'),
    'Expected pre-compact prompt text to stay pruned after resume',
  )

  const preservedAssistant = result.messages.find(
    message => message.uuid === preservedAssistantUuid,
  )
  assert(
    preservedAssistant?.type === 'assistant',
    'Expected preserved assistant message to survive compact resume',
  )
  const usage = preservedAssistant.message.usage ?? {}
  assert(
    usage.input_tokens === 0 &&
      usage.output_tokens === 0 &&
      usage.cache_creation_input_tokens === 0 &&
      usage.cache_read_input_tokens === 0,
    `Expected preserved assistant usage to be zeroed after compact resume, got ${JSON.stringify(usage)}`,
  )

  return {
    label: 'compacted-large-session',
    sessionId,
    messageKinds: resumedKinds,
    customTitle: result.customTitle,
    mode: result.mode,
    agentSetting: result.agentSetting,
  }
}

async function runUserTailCase(
  workspaceDir: string,
  sessionId: UUID,
): Promise<ResumeRun> {
  await writeSessionFile({
    workspaceDir,
    sessionId,
    lines: [
      createSerializedUserMessage({
        sessionId,
        cwd: workspaceDir,
        uuid: '33333333-3333-4333-8333-333333333333' as UUID,
        timestamp: '2026-04-07T10:05:00.000Z',
        content: 'Continue from this point',
        parentUuid: null,
      }),
    ],
  })

  const result = await loadConversationForResume(sessionId, undefined)
  assert(result, 'Expected user-tail session lookup to return a session')
  assert(
    result.messages.length === 2,
    `Expected user-tail resume to append a synthetic assistant sentinel, got ${result.messages.length} messages`,
  )
  assert(
    result.messages[0]?.type === 'user' &&
      result.messages[1]?.type === 'assistant',
    `Expected user-tail resume message types user,assistant, got ${result.messages.map(message => message.type).join(',')}`,
  )

  return {
    label: 'user-tail-sentinel',
    sessionId,
    messageTypes: result.messages.map(message => message.type),
  }
}

async function runResumeSessionAtCase(
  workspaceDir: string,
  sessionId: UUID,
): Promise<ResumeRun> {
  const firstUserUuid = '25252525-2525-4252-8252-252525252525' as UUID
  const firstAssistantUuid = '26262626-2626-4262-8262-262626262626' as UUID
  const secondUserUuid = '27272727-2727-4272-8272-272727272727' as UUID
  const secondAssistantUuid = '28282828-2828-4282-8282-282828282828' as UUID

  await writeSessionFile({
    workspaceDir,
    sessionId,
    lines: [
      createSerializedUserMessage({
        sessionId,
        cwd: workspaceDir,
        uuid: firstUserUuid,
        timestamp: '2026-04-07T10:30:00.000Z',
        content: 'First turn',
        parentUuid: null,
      }),
      createSerializedAssistantMessage({
        sessionId,
        cwd: workspaceDir,
        uuid: firstAssistantUuid,
        timestamp: '2026-04-07T10:30:01.000Z',
        content: 'First answer',
        parentUuid: firstUserUuid,
      }),
      createSerializedUserMessage({
        sessionId,
        cwd: workspaceDir,
        uuid: secondUserUuid,
        timestamp: '2026-04-07T10:31:00.000Z',
        content: 'Second turn',
        parentUuid: firstAssistantUuid,
      }),
      createSerializedAssistantMessage({
        sessionId,
        cwd: workspaceDir,
        uuid: secondAssistantUuid,
        timestamp: '2026-04-07T10:31:01.000Z',
        content: 'Second answer',
        parentUuid: secondUserUuid,
      }),
    ],
  })

  const result = await loadConversationForResume(sessionId, undefined)
  assert(result, 'Expected resume-session-at smoke session to load')

  const truncated = truncateResumeMessagesAt(result.messages, firstAssistantUuid)
  assert(
    truncated.map(message => message.type).join(',') === 'user,assistant',
    `Expected resume-session-at to truncate at assistant boundary, got ${truncated.map(message => message.type).join(',')}`,
  )
  assert(
    truncated.at(-1)?.uuid === firstAssistantUuid,
    `Expected resume-session-at to keep assistant ${firstAssistantUuid}, got ${truncated.at(-1)?.uuid ?? '(none)'}`,
  )

  let nonAssistantError: string | undefined
  try {
    truncateResumeMessagesAt(result.messages, firstUserUuid)
  } catch (error) {
    nonAssistantError = error instanceof Error ? error.message : String(error)
  }
  assert(
    nonAssistantError?.includes('not an assistant message'),
    `Expected user UUID to be rejected for resume-session-at, got ${nonAssistantError ?? '(none)'}`,
  )

  let missingError: string | undefined
  try {
    truncateResumeMessagesAt(
      result.messages,
      '29292929-2929-4292-8292-292929292929' as UUID,
    )
  } catch (error) {
    missingError = error instanceof Error ? error.message : String(error)
  }
  assert(
    missingError?.includes('No message found with message.uuid'),
    `Expected missing UUID to be rejected for resume-session-at, got ${missingError ?? '(none)'}`,
  )

  return {
    label: 'resume-session-at',
    sessionId,
    messageTypes: truncated.map(message => message.type),
    note: 'assistant-only truncation and missing-id errors verified',
  }
}

function formatRun(run: ResumeRun): string[] {
  return [
    `[PASS] ${run.label}`,
    `  sessionId=${run.sessionId}`,
    ...(run.messageTypes
      ? [`  messageTypes=${run.messageTypes.join(',')}`]
      : []),
    ...(run.messageKinds
      ? [`  messageKinds=${run.messageKinds.join(',')}`]
      : []),
    ...(run.customTitle ? [`  customTitle=${run.customTitle}`] : []),
    ...(run.agentSetting ? [`  agentSetting=${run.agentSetting}`] : []),
    ...(run.mode ? [`  mode=${run.mode}`] : []),
    ...(run.fullPath ? [`  fullPath=${run.fullPath}`] : []),
    ...(run.note ? [`  note=${run.note}`] : []),
  ]
}

const tempRoot = await mkdtemp(join(tmpdir(), 'neko-session-resume-smoke-'))
const workspaceDir = join(tempRoot, 'workspace')
const configDir = join(tempRoot, 'config')
const pluginCacheDir = join(tempRoot, 'plugin-cache')

const trackedEnvVars: EnvKey[] = [
  'NEKO_CODE_CONFIG_DIR',
  'CLAUDE_CODE_PLUGIN_CACHE_DIR',
  'CLAUDE_CODE_SIMPLE',
]
const oldEnv = new Map<EnvKey, string | undefined>()
const previousCwd = process.cwd()

try {
  await mkdir(workspaceDir, { recursive: true })
  await mkdir(configDir, { recursive: true })
  await mkdir(pluginCacheDir, { recursive: true })

  for (const key of trackedEnvVars) {
    oldEnv.set(key, process.env[key])
  }

  process.env.NEKO_CODE_CONFIG_DIR = configDir
  process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR = pluginCacheDir
  process.env.CLAUDE_CODE_SIMPLE = '1'

  process.chdir(workspaceDir)
  setOriginalCwd(workspaceDir)
  setCwdState(workspaceDir)

  const runs = [
    await runMissingSessionCase(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID,
    ),
    await runStoredSessionCase(
      workspaceDir,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as UUID,
    ),
    await runJsonlPathCase(
      workspaceDir,
      'bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc' as UUID,
    ),
    await runCompactedLargeSessionCase(
      workspaceDir,
      'abababab-abab-4bab-8bab-abababababab' as UUID,
    ),
    await runUserTailCase(
      workspaceDir,
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc' as UUID,
    ),
    await runResumeSessionAtCase(
      workspaceDir,
      'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd' as UUID,
    ),
  ]

  console.log(`Temp root: ${tempRoot}`)
  console.log(`Workspace: ${workspaceDir}`)
  console.log(`Config dir: ${configDir}`)
  console.log(`Project dir: ${getProjectDir(workspaceDir)}`)
  console.log('')

  for (const run of runs) {
    for (const line of formatRun(run)) {
      console.log(line)
    }
    console.log('')
  }
} finally {
  process.chdir(previousCwd)
  setOriginalCwd(previousCwd)
  setCwdState(previousCwd)

  for (const key of trackedEnvVars) {
    const value = oldEnv.get(key)
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  if (!keepTemp) {
    await rm(tempRoot, { recursive: true, force: true })
  }
}
