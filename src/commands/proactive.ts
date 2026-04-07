import type { Command } from '../types/command.js'
import { createUnavailableCommand } from './_snapshotPlaceholder.js'

const proactive = createUnavailableCommand(
  'proactive',
  'Enable proactive mode',
  'Proactive mode is not available in this repository snapshot.',
) satisfies Command

export default proactive
