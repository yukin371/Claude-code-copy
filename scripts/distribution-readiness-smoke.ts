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
    label: 'start-help',
    args: ['bun', 'run', 'start:help:no-serena'],
  },
  {
    label: 'start-provider-help',
    args: ['bun', 'run', 'start:provider-help:no-serena'],
  },
  {
    label: 'start-model-provider-help',
    args: ['bun', 'run', 'start:model-provider-help:no-serena'],
  },
  {
    label: 'start-doctor-help',
    args: ['bun', 'run', 'start:doctor-help:no-serena'],
  },
  {
    label: 'start-install-help',
    args: ['bun', 'run', 'start:install-help:no-serena'],
  },
  {
    label: 'start-update-help',
    args: ['bun', 'run', 'start:update-help:no-serena'],
  },
  {
    label: 'release-facing-diagnostics',
    args: ['bun', 'run', 'smoke:release-facing-diagnostics'],
  },
  {
    label: 'migrated-config-system',
    args: ['bun', 'run', 'smoke:migrated-config-system'],
  },
  {
    label: 'native-distribution',
    args: ['bun', 'run', 'smoke:native-distribution:no-serena'],
  },
  {
    label: 'native-local-install',
    args: ['bun', 'run', 'smoke:native-local-install:no-serena'],
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

  console.log('\n[PASS] distribution-readiness-smoke')
  results.forEach(result => {
    console.log(`  ${result.label}: exit=${result.exitCode}`)
  })
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
