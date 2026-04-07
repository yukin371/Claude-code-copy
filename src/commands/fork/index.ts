import type { Command } from '../../types/command.js'
import { createUnavailableCommand } from '../_snapshotPlaceholder.js'

const fork = createUnavailableCommand(
  'fork',
  'Fork the current session into a subagent branch',
  'Fork subagent support is not available in this repository snapshot.',
) satisfies Command

export default fork
