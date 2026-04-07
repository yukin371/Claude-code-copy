import type { Command } from '../../types/command.js'
import { createUnavailableCommand } from '../_snapshotPlaceholder.js'

const peers = createUnavailableCommand(
  'peers',
  'Manage peer inbox features',
  'Peer inbox features are not available in this repository snapshot.',
) satisfies Command

export default peers
