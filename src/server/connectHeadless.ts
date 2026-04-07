import { spawn } from 'child_process'
import { isInBundledMode } from '../utils/bundledMode.js'
import type { DirectConnectConfig } from './directConnectManager.js'

function getSpawnScriptArgs(): string[] {
  if (isInBundledMode() || !process.argv[1]) {
    return []
  }
  return [process.argv[1]]
}

export async function runConnectHeadless(
  config: DirectConnectConfig,
  prompt: string,
  outputFormat: string,
  interactive: boolean,
): Promise<void> {
  if (interactive) {
    throw new Error(
      'Direct connect headless currently requires an explicit prompt; stdin streaming is not supported yet.',
    )
  }

  if (outputFormat !== 'stream-json') {
    throw new Error(
      'Direct connect headless currently supports only --output-format=stream-json.',
    )
  }

  const args = [
    ...getSpawnScriptArgs(),
    '--print',
    '--sdk-url',
    config.wsUrl,
    '--session-id',
    config.sessionId,
    '--output-format',
    'stream-json',
    prompt,
  ]

  const child = spawn(process.execPath, args, {
    env: {
      ...process.env,
      CLAUDE_CODE_SESSION_ACCESS_TOKEN: config.authToken,
    },
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  })

  await new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Direct connect headless exited with signal ${signal}`))
        return
      }
      if (code && code !== 0) {
        reject(new Error(`Direct connect headless exited with code ${code}`))
        return
      }
      resolve()
    })
  })
}
