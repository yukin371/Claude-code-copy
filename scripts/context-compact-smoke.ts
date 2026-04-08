#!/usr/bin/env bun

import {
  createAssistantMessage,
  createCompactBoundaryMessage,
  createUserMessage,
  getMessagesAfterCompactBoundary,
} from '../src/utils/messages.js'
import { projectView } from '../src/services/contextCollapse/operations.js'

type SmokeOptions = {
  disableSerena: boolean
}

function parseArgs(argv: string[]): SmokeOptions {
  return {
    disableSerena: argv.includes('--disable-serena'),
  }
}

function buildMessages() {
  const firstUser = createUserMessage({ content: 'Explain why tokens matter.' })
  const firstAssistant = createAssistantMessage({
    content: 'They represent usage of the context window.',
  })
  const secondUser = createUserMessage({
    content: 'Now summarize that meaty explanation.',
  })
  const secondAssistant = createAssistantMessage({
    content: 'Summary: tokens measure context usage.',
  })

  const summaryUser = createUserMessage({
    content: 'Summary: tokens capture context weight.',
    isCompactSummary: true,
  })

  const boundary = createCompactBoundaryMessage(
    'manual',
    2_048,
    secondAssistant.uuid ?? undefined,
  )

  const postUser = createUserMessage({
    content: 'Ask a new question after compaction.',
  })
  const postAssistant = createAssistantMessage({
    content: 'Here is the post-compact answer.',
  })

  const preCompact = [firstUser, firstAssistant, secondUser, secondAssistant]
  const postCompact = [
    ...preCompact,
    boundary,
    summaryUser,
    postUser,
    postAssistant,
  ]

  return { preCompact, postCompact }
}

function getTokenEstimate(message: ReturnType<typeof createUserMessage>) {
  const content =
    (typeof message.message?.content !== 'undefined'
      ? message.message?.content
      : message.content) ?? ''
  if (typeof content === 'string') {
    return Math.max(1, Math.ceil(content.length / 4))
  }
  return content.reduce((sum, block) => {
    const text =
      typeof block === 'string'
        ? block
        : typeof block.text === 'string'
          ? block.text
          : typeof block.summary === 'string'
            ? block.summary
            : ''
    return sum + Math.max(1, Math.ceil(text.length / 4))
  }, 0)
}

function computeStats(messages: ReturnType<typeof createUserMessage>[]) {
  return {
    totalTokens: messages.reduce((sum, message) => sum + getTokenEstimate(message), 0),
    count: messages.length,
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (options.disableSerena) {
    process.env.NEKO_CODE_DISABLED_MCP_SERVERS = process.env.NEKO_CODE_DISABLED_MCP_SERVERS
      ? `${process.env.NEKO_CODE_DISABLED_MCP_SERVERS},serena`
      : 'serena'
  }

  const { preCompact, postCompact } = buildMessages()

  const preStats = computeStats(preCompact)
  const hasBoundary = postCompact.some(
    message => message.subtype === 'compact_boundary',
  )
  if (!hasBoundary) {
    throw new Error('Compact boundary message not found')
  }
  const afterBoundary = getMessagesAfterCompactBoundary(postCompact)
  const afterPayload = afterBoundary.filter(message => message.type !== 'system')
  const afterStats = computeStats(afterPayload)
  if (afterStats.totalTokens >= preStats.totalTokens) {
    throw new Error('Post-boundary stats should be lighter than pre-compact')
  }

  if (!postCompact.some(message => message.compactMetadata)) {
    throw new Error('Compact boundary metadata is missing after compaction')
  }

  if (!postCompact.some(message => message.isCompactSummary)) {
    throw new Error('Compact summary message is not present after boundary')
  }

  const collapsed = projectView(afterBoundary)
  const collapsedStats = computeStats(collapsed.filter(m => m.type !== 'system'))
  if (collapsedStats.totalTokens !== afterStats.totalTokens) {
    throw new Error('Context collapse stub altered the local stats')
  }

  console.log('[PASS] context-compact-smoke')
  console.log(`  tokensBefore=${preStats.totalTokens}`)
  console.log(`  tokensAfter=${afterStats.totalTokens}`)
  console.log(`  collapseTokens=${collapsedStats.totalTokens}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
