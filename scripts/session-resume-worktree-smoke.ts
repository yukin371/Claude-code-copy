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

type WorktreeSession = {
  originalCwd: string
  worktreePath: string
  worktreeName: string
  worktreeBranch?: string
  originalBranch?: string
  originalHeadCommit?: string
  sessionId: string
  hookBased?: boolean
}

type ResumeRun = {
  label: string
  sessionId: UUID
  worktreeSession?: WorktreeSession | null
  messages?: string[]
}

const keepTemp = process.argv.includes('--keep-temp')

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

async function writeSessionFile({
  workspaceDir,
  sessionId,
  lines,
}: {
  workspaceDir: string
  sessionId: UUID
  lines: unknown[]
}): Promise<void> {
  const projectDir = getProjectDir(workspaceDir)
  const transcriptPath = join(projectDir, `${sessionId}.jsonl`)
  await mkdir(dirname(transcriptPath), { recursive: true })
  await writeFile(
    transcriptPath,
    `${lines.map(line => JSON.stringify(line)).join('\n')}\n`,
    'utf8',
  )
}

function buildMessages({
  sessionId,
  cwd,
}: {
  sessionId: UUID
  cwd: string
}) {
  const user = createUserMessage({ content: 'resume smoke question', uuid: '44444444-4444-4444-8444-444444444444' as UUID, timestamp: '2026-04-08T12:00:00.000Z' })
  const assistant = createAssistantMessage({ content: 'resume smoke answer' })
  return [user, assistant]
}

async function runWorktreeStateCase(
  workspaceDir: string,
  sessionId: UUID,
): Promise<ResumeRun> {
  const [user, assistant] = buildMessages({ sessionId, cwd: workspaceDir })
  const worktreeSession: WorktreeSession = {
    originalCwd: workspaceDir,
    worktreePath: join(workspaceDir, 'worktree'),
    worktreeName: 'smoke-worktree',
    worktreeBranch: 'main',
    originalBranch: 'main',
    originalHeadCommit: 'abcdef',
    sessionId,
    hookBased: false,
  }

  await writeSessionFile({
    workspaceDir,
    sessionId,
    lines: [
      user,
      assistant,
      {
        type: 'worktree-state',
        sessionId,
        worktreeSession,
      },
    ],
  })

  const result = await loadConversationForResume(sessionId, undefined)
  assert(result, 'Expected resume to load stored log')
  assert(
    result.worktreeSession?.worktreeName === worktreeSession.worktreeName,
    'Expected worktree session name to round-trip',
  )

  return {
    label: 'worktree-state',
    sessionId,
    worktreeSession: result.worktreeSession ?? null,
    messages: result.messages.map(message => message.type),
  }
}

async function runWorktreeExitCase(
  workspaceDir: string,
  sessionId: UUID,
): Promise<ResumeRun> {
  const [user, assistant] = buildMessages({ sessionId, cwd: workspaceDir })
  await writeSessionFile({
    workspaceDir,
    sessionId,
    lines: [
      {
        type: 'worktree-state',
        sessionId,
        worktreeSession: null,
      },
      user,
      assistant,
    ],
  })

  const result = await loadConversationForResume(sessionId, undefined)
  assert(result, 'Expected resume to load worktree exit log')
  assert(result.worktreeSession === null, 'Expected worktree session to be null after exit')

  return {
    label: 'worktree-exit',
    sessionId,
    worktreeSession: result.worktreeSession,
  }
}

function formatRun(run: ResumeRun): string[] {
  return [
    `[PASS] ${run.label}`,
    `  sessionId=${run.sessionId}`,
    ...(run.worktreeSession === null
      ? ['  worktreeSession=null']
      : run.worktreeSession
        ? [`  worktreeName=${run.worktreeSession.worktreeName}`]
        : []),
    ...(run.messages ? [`  messageTypes=${run.messages.join(',')}`] : []),
  ]
}

const tempRoot = await mkdtemp(join(tmpdir(), 'neko-session-resume-worktree-smoke-'))
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
    await runWorktreeStateCase(
      workspaceDir,
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd' as UUID,
    ),
    await runWorktreeExitCase(
      workspaceDir,
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' as UUID,
    ),
  ]

  console.log(`Temp root: ${tempRoot}`)
  console.log(`Workspace: ${workspaceDir}`)
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
