#!/usr/bin/env bun

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { UUID } from 'node:crypto'
import { createAssistantMessage, createUserMessage } from '../src/utils/messages.js'
import { loadConversationForResume } from '../src/utils/conversationRecovery.js'
import { getProjectDir } from '../src/utils/sessionStorage.js'
import { setCwdState, setOriginalCwd } from '../src/bootstrap/state.js'

type EnvKey =
  | 'NEKO_CODE_CONFIG_DIR'
  | 'CLAUDE_CODE_PLUGIN_CACHE_DIR'
  | 'CLAUDE_CODE_SIMPLE'

type ResumeRun = {
  label: string
  sessionId: string
  messageTypes?: string[]
  customTitle?: string
  mode?: string
  agentSetting?: string
}

const keepTemp = process.argv.includes('--keep-temp')

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function createSerializedUserMessage({
  sessionId,
  cwd,
  uuid,
  timestamp,
  content,
  parentUuid,
}: {
  sessionId: string
  cwd: string
  uuid: UUID
  timestamp: string
  content: string
  parentUuid: UUID | null
}) {
  const message = createUserMessage({ content, uuid, timestamp })
  return {
    ...message,
    parentUuid,
    cwd,
    userType: 'external',
    sessionId,
    version: 'session-smoke',
  }
}

function createSerializedAssistantMessage({
  sessionId,
  cwd,
  uuid,
  timestamp,
  content,
  parentUuid,
}: {
  sessionId: string
  cwd: string
  uuid: UUID
  timestamp: string
  content: string
  parentUuid: UUID
}) {
  const message = createAssistantMessage({ content })
  return {
    ...message,
    uuid,
    timestamp,
    parentUuid,
    cwd,
    userType: 'external',
    sessionId,
    version: 'session-smoke',
  }
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

function formatRun(run: ResumeRun): string[] {
  return [
    `[PASS] ${run.label}`,
    `  sessionId=${run.sessionId}`,
    ...(run.messageTypes
      ? [`  messageTypes=${run.messageTypes.join(',')}`]
      : []),
    ...(run.customTitle ? [`  customTitle=${run.customTitle}`] : []),
    ...(run.agentSetting ? [`  agentSetting=${run.agentSetting}`] : []),
    ...(run.mode ? [`  mode=${run.mode}`] : []),
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
    await runUserTailCase(
      workspaceDir,
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc' as UUID,
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
