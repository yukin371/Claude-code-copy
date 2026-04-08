import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { withTokenCountVCR, withVCR } from './vcr.js'

type EnvSnapshot = Record<string, string | undefined>

const ENV_KEYS = ['CLAUDE_CODE_TEST_FIXTURES_ROOT'] as const
const tempPaths: string[] = []

function snapshotEnv(keys: readonly string[]): EnvSnapshot {
  return Object.fromEntries(keys.map(key => [key, process.env[key]]))
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key]
      continue
    }
    process.env[key] = value
  }
}

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempPaths.push(dir)
  return dir
}

afterEach(() => {
  for (const path of tempPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true })
  }
})

describe('withTokenCountVCR', () => {
  let envSnapshot: EnvSnapshot

  afterEach(() => {
    restoreEnv(envSnapshot)
  })

  test('keeps distinct fixtures for different token-count routes and models', async () => {
    envSnapshot = snapshotEnv(ENV_KEYS)
    const fixturesRoot = createTempDir('token-count-vcr-')
    process.env.CLAUDE_CODE_TEST_FIXTURES_ROOT = fixturesRoot

    const messages = [{ role: 'user', content: 'route-sensitive token count' }]
    const tools = [{ name: 'search' }]

    const mainResult = await withTokenCountVCR(
      messages,
      tools,
      {
        model: 'claude-sonnet-4-5',
        route: 'main',
      },
      async () => 111,
    )
    const reviewResult = await withTokenCountVCR(
      messages,
      tools,
      {
        model: 'claude-opus-4-1',
        route: 'review',
      },
      async () => 222,
    )

    expect(mainResult).toBe(111)
    expect(reviewResult).toBe(222)

    const fixturesDir = join(fixturesRoot, 'fixtures')
    expect(existsSync(fixturesDir)).toBe(true)
    expect(
      readdirSync(fixturesDir).filter(name => name.startsWith('token-count-')),
    ).toHaveLength(2)
  })

  test('reuses the same fixture when route and model are unchanged', async () => {
    envSnapshot = snapshotEnv(ENV_KEYS)
    const fixturesRoot = createTempDir('token-count-vcr-')
    process.env.CLAUDE_CODE_TEST_FIXTURES_ROOT = fixturesRoot

    const messages = [{ role: 'user', content: 'stable token count' }]
    const tools = [{ name: 'search' }]
    let invocationCount = 0

    const firstResult = await withTokenCountVCR(
      messages,
      tools,
      {
        model: 'claude-sonnet-4-5',
        route: 'main',
      },
      async () => {
        invocationCount += 1
        return 111
      },
    )
    const cachedResult = await withTokenCountVCR(
      messages,
      tools,
      {
        model: 'claude-sonnet-4-5',
        route: 'main',
      },
      async () => {
        invocationCount += 1
        return 222
      },
    )

    expect(firstResult).toBe(111)
    expect(cachedResult).toBe(111)
    expect(invocationCount).toBe(1)
  })
})

describe('withVCR', () => {
  let envSnapshot: EnvSnapshot

  afterEach(() => {
    restoreEnv(envSnapshot)
  })

  test('keeps distinct fixtures for identical messages under different query contexts', async () => {
    envSnapshot = snapshotEnv(ENV_KEYS)
    const fixturesRoot = createTempDir('message-vcr-')
    process.env.CLAUDE_CODE_TEST_FIXTURES_ROOT = fixturesRoot

    const messages = [
      {
        type: 'user',
        message: {
          content: 'shared prompt',
        },
      },
    ]

    const mainResult = await withVCR(
      messages,
      async () => [{ type: 'stream_event', event: 'main' }],
      {
        systemPrompt: ['main system prompt'],
        model: 'claude-sonnet-4-5',
        querySource: 'main',
      },
    )
    const reviewResult = await withVCR(
      messages,
      async () => [{ type: 'stream_event', event: 'review' }],
      {
        systemPrompt: ['review system prompt'],
        model: 'claude-opus-4-1',
        querySource: 'agent:builtin:general-purpose:route:review',
      },
    )

    expect(mainResult).toEqual([{ type: 'stream_event', event: 'main' }])
    expect(reviewResult).toEqual([{ type: 'stream_event', event: 'review' }])

    const fixturesDir = join(fixturesRoot, 'fixtures')
    expect(existsSync(fixturesDir)).toBe(true)
    expect(readdirSync(fixturesDir)).toHaveLength(2)
  })

  test('reuses the same fixture when the query context is unchanged', async () => {
    envSnapshot = snapshotEnv(ENV_KEYS)
    const fixturesRoot = createTempDir('message-vcr-')
    process.env.CLAUDE_CODE_TEST_FIXTURES_ROOT = fixturesRoot

    const messages = [
      {
        type: 'user',
        message: {
          content: 'shared prompt',
        },
      },
    ]
    const context = {
      systemPrompt: ['stable system prompt'],
      model: 'claude-sonnet-4-5',
      querySource: 'main',
    }
    let invocationCount = 0

    const firstResult = await withVCR(
      messages,
      async () => {
        invocationCount += 1
        return [{ type: 'stream_event', event: 'cached' }]
      },
      context,
    )
    const cachedResult = await withVCR(
      messages,
      async () => {
        invocationCount += 1
        return [{ type: 'stream_event', event: 'miss' }]
      },
      context,
    )

    expect(firstResult).toEqual([{ type: 'stream_event', event: 'cached' }])
    expect(cachedResult).toEqual([{ type: 'stream_event', event: 'cached' }])
    expect(invocationCount).toBe(1)
  })
})
