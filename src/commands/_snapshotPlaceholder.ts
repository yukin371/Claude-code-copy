import type { Command, LocalCommandCall } from '../types/command.js'

function createUnavailableCall(message: string): LocalCommandCall {
  return async () => ({
    type: 'text',
    value: message,
  })
}

export function createUnavailableCommand(
  name: string,
  description: string,
  message: string,
): Command {
  return {
    type: 'local',
    name,
    description,
    supportsNonInteractive: true,
    load: () => Promise.resolve({ call: createUnavailableCall(message) }),
  }
}
