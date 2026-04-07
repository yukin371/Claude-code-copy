import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { Dialog } from '../design-system/Dialog.js'
import type { CommandResultDisplay } from '../../commands.js'
import type { LocalWorkflowTaskState } from '../../tasks/LocalWorkflowTask/LocalWorkflowTask.js'
import type { AgentId } from '../../types/ids.js'
import type { DeepImmutable } from '../../types/utils.js'

type Props = {
  workflow: DeepImmutable<LocalWorkflowTaskState>
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void
  onKill?: () => void
  onSkipAgent?: (agentId: AgentId) => void
  onRetryAgent?: (agentId: AgentId) => void
  onBack?: () => void
}

export function WorkflowDetailDialog({
  workflow,
  onDone,
  onKill,
  onBack,
}: Props): React.ReactNode {
  return (
    <Dialog
      title={workflow.workflowName ?? workflow.summary ?? workflow.description}
      onClose={() => onDone('Closed workflow detail', { display: 'system' })}
    >
      <Box flexDirection="column" gap={1}>
        <Text>Status: {workflow.status}</Text>
        <Text>Agents: {workflow.agentCount}</Text>
        <Text dimColor>{workflow.description}</Text>
        {onBack && <Text dimColor>Esc to go back</Text>}
        {onKill && workflow.status === 'running' && (
          <Text dimColor>Press Ctrl+C to stop the workflow task</Text>
        )}
      </Box>
    </Dialog>
  )
}
