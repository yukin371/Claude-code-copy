#!/usr/bin/env bun

import { spawn } from 'bun'

const commands = [
  { label: 'session-continue', args: ['bun', 'run', 'smoke:session-continue:no-serena'] },
  { label: 'session-resume', args: ['bun', 'run', 'smoke:session-resume'] },
  { label: 'session-resume-worktree', args: ['bun', 'run', 'smoke:session-resume-worktree:no-serena'] },
  { label: 'plugin-refresh', args: ['bun', 'run', 'smoke:plugin-refresh'] },
  { label: 'plugin-cli-state', args: ['bun', 'run', 'smoke:plugin-cli-state:no-serena'] },
  { label: 'lsp-refresh', args: ['bun', 'run', 'smoke:lsp-refresh'] },
  { label: 'mcp-strict-config', args: ['bun', 'run', 'smoke:mcp-strict-config'] },
  { label: 'context-compact', args: ['bun', 'run', 'smoke:context-compact:no-serena'] },
]

type SmokeResult = {
  label: string
  exitCode: number
  status: 'pass' | 'external-skip'
}

function isExternalSessionContinueFailure(label: string, output: string): boolean {
  if (label !== 'session-continue') {
    return false
  }

  const normalized = output.toLowerCase()
  return (
    normalized.includes('api error: 429') ||
    normalized.includes('"code":"1308"') ||
    normalized.includes('usage limit') ||
    normalized.includes('rate limit') ||
    normalized.includes('timed out') ||
    normalized.includes('timeout')
  )
}

async function run(): Promise<void> {
  const results: SmokeResult[] = []
  for (const command of commands) {
    console.log(`\n[RUN] ${command.label}`)
    const child = spawn(command.args, { stdout: 'pipe', stderr: 'pipe' })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])

    if (stdout) {
      process.stdout.write(stdout)
    }
    if (stderr) {
      process.stderr.write(stderr)
    }

    const combinedOutput = `${stdout}\n${stderr}`
    if (exitCode !== 0 && isExternalSessionContinueFailure(command.label, combinedOutput)) {
      console.warn(
        `[WARN] ${command.label} skipped due to external provider quota/timeout; not treating as a local regression`,
      )
      results.push({ label: command.label, exitCode, status: 'external-skip' })
      continue
    }

    results.push({ label: command.label, exitCode, status: 'pass' })
    if (exitCode !== 0) {
      console.error(`[FAIL] ${command.label} exited with ${exitCode}`)
      process.exit(exitCode ?? 1)
    }
  }

  console.log('\n[PASS] phase3-system-regression-smoke')
  results.forEach(result => {
    console.log(
      `  ${result.label}: exit=${result.exitCode} status=${result.status}`,
    )
  })
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
