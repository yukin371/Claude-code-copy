#!/usr/bin/env bun

import { spawn } from 'bun'

const rawDisabledServers = process.env.NEKO_CODE_DISABLED_MCP_SERVERS?.trim()
const disabledServers = rawDisabledServers
  ? rawDisabledServers
      .split(',')
      .map(name => name.trim())
      .filter(Boolean)
  : []

if (!disabledServers.includes('serena')) {
  disabledServers.push('serena')
}

const childEnv = {
  ...process.env,
  NEKO_CODE_DISABLED_MCP_SERVERS: disabledServers.join(','),
}

const commands = [
  {
    label: 'claude-config',
    args: ['bun', 'run', 'smoke:claude-config:no-serena'],
  },
  {
    label: 'mcp-state',
    args: ['bun', 'run', 'smoke:mcp-state'],
  },
  {
    label: 'plugin-install',
    args: ['bun', 'run', 'smoke:plugin-install'],
  },
  {
    label: 'plugin-state',
    args: ['bun', 'run', 'smoke:plugin-state'],
  },
  {
    label: 'phase3-system-regression',
    args: ['bun', 'run', 'smoke:phase3-system-regression'],
  },
] as const

async function run(): Promise<void> {
  const results: Array<{ label: string; exitCode: number }> = []

  for (const command of commands) {
    console.log(`\n[RUN] ${command.label}`)
    const child = spawn(command.args, {
      env: childEnv,
      stdout: 'inherit',
      stderr: 'inherit',
    })
    const exitCode = await child.exited
    results.push({ label: command.label, exitCode })

    if (exitCode !== 0) {
      console.error(`[FAIL] ${command.label} exited with ${exitCode}`)
      process.exit(exitCode ?? 1)
    }
  }

  console.log('\n[PASS] migrated-config-system-smoke')
  results.forEach(result => {
    console.log(`  ${result.label}: exit=${result.exitCode}`)
  })
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
