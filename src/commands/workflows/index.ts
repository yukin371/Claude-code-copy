import type { Command } from '../../types/command.js'
import { createUnavailableCommand } from '../_snapshotPlaceholder.js'

const workflows = createUnavailableCommand(
  'workflows',
  'Manage workflow-backed commands',
  'Workflow commands are not available in this repository snapshot.',
) satisfies Command

export default workflows
