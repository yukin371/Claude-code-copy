import type { Command } from '../../types/command.js'
import { createUnavailableCommand } from '../_snapshotPlaceholder.js'

const buddy = createUnavailableCommand(
  'buddy',
  'Open the buddy companion workflow',
  'Buddy mode is not available in this repository snapshot.',
) satisfies Command

export default buddy
