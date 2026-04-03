import type { Command, LocalCommandResult, LocalCommandModule } from 'src/types/command.js'

const assistantCommand: Command = {
  name: 'assistant',
  description: 'Placeholder assistant command (Kairos feature disabled in this snapshot)',
  type: 'local',
  supportsNonInteractive: false,
  load(): Promise<LocalCommandModule> {
    return Promise.resolve({
      call: (_args, _context) =>
        Promise.resolve<LocalCommandResult>({ type: 'skip' }),
    })
  },
}

export default assistantCommand
