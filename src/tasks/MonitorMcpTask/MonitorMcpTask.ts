import type { AppState } from '../../state/AppState.js'
import type { AgentId } from '../../types/ids.js'
import type { SetAppState, Task, TaskStateBase } from '../../Task.js'
import { updateTaskState } from '../../utils/task/framework.js'
import { evictTaskOutput } from '../../utils/task/diskOutput.js'

export type MonitorMcpTaskState = TaskStateBase & {
  type: 'monitor_mcp'
  agentId?: AgentId
  serverName?: string
}

export function killMonitorMcp(
  taskId: string,
  setAppState: SetAppState,
): void {
  updateTaskState(taskId, setAppState, task => {
    if (task.type !== 'monitor_mcp' || task.status !== 'running') {
      return task
    }

    return {
      ...task,
      status: 'killed',
      notified: true,
      endTime: Date.now(),
    }
  })
  void evictTaskOutput(taskId)
}

export function killMonitorMcpTasksForAgent(
  agentId: AgentId,
  getAppState: () => AppState,
  setAppState: SetAppState,
): void {
  const tasks = getAppState().tasks ?? {}
  for (const [taskId, task] of Object.entries(tasks)) {
    if (
      task.type === 'monitor_mcp' &&
      task.agentId === agentId &&
      task.status === 'running'
    ) {
      killMonitorMcp(taskId, setAppState)
    }
  }
}

export const MonitorMcpTask: Task = {
  name: 'Monitor MCP',
  type: 'monitor_mcp',
  async kill(taskId: string, setAppState: SetAppState): Promise<void> {
    killMonitorMcp(taskId, setAppState)
  },
}
