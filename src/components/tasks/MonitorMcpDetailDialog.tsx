import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { Dialog } from '../design-system/Dialog.js'
import type { MonitorMcpTaskState } from '../../tasks/MonitorMcpTask/MonitorMcpTask.js'
import type { DeepImmutable } from '../../types/utils.js'

type Props = {
  task: DeepImmutable<MonitorMcpTaskState>
  onKill?: () => void
  onBack?: () => void
}

export function MonitorMcpDetailDialog({
  task,
  onKill,
}: Props): React.ReactNode {
  return (
    <Dialog title={task.description} onClose={() => undefined}>
      <Box flexDirection="column" gap={1}>
        <Text>Status: {task.status}</Text>
        {task.serverName && <Text>Server: {task.serverName}</Text>}
        {onKill && task.status === 'running' && (
          <Text dimColor>Press Ctrl+C to stop the monitor task</Text>
        )}
      </Box>
    </Dialog>
  )
}
