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

async function run(): Promise<void> {
  const results: Array<{ label: string; exitCode: number }> = []
  for (const command of commands) {
    console.log(`\n[RUN] ${command.label}`)
    const child = spawn(command.args, { stdout: 'inherit', stderr: 'inherit' })
    const exitCode = await child.exited
    results.push({ label: command.label, exitCode })
    if (exitCode !== 0) {
      console.error(`[FAIL] ${command.label} exited with ${exitCode}`)
      process.exit(exitCode ?? 1)
    }
  }

  console.log('\n[PASS] phase3-system-regression-smoke')
  results.forEach(result => {
    console.log(`  ${result.label}: exit=${result.exitCode}`)
  })
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
