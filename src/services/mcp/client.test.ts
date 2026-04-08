import { describe, expect, test } from 'bun:test'
import { callMCPToolWithUrlElicitationRetry } from './client.js'

describe('callMCPToolWithUrlElicitationRetry', () => {
  test('forwards querySource to injected callToolFn', async () => {
    let receivedQuerySource: string | undefined

    const result = await callMCPToolWithUrlElicitationRetry({
      client: {} as never,
      clientConnection: {} as never,
      tool: 'search',
      args: { q: 'ping' },
      signal: AbortSignal.abort(),
      setAppState: prev => prev,
      querySource: 'chrome_mcp',
      callToolFn: async ({ querySource }) => {
        receivedQuerySource = querySource
        return { content: 'ok' }
      },
    })

    expect(receivedQuerySource).toBe('chrome_mcp')
    expect(result).toEqual({ content: 'ok' })
  })
})
