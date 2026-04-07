import type { AppState } from '../../state/AppState.js'
import type { AgentId } from '../../types/ids.js'
import type { SetAppState, Task, TaskStateBase } from '../../Task.js'
import { updateTaskState } from '../../utils/task/framework.js'
import { evictTaskOutput } from '../../utils/task/diskOutput.js'

type WorkflowAgentController = {
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'killed'
}

export type LocalWorkflowTaskState = TaskStateBase & {
  type: 'local_workflow'
  workflowName?: string
  summary?: string
  agentCount: number
  agentControllers?: Record<AgentId, WorkflowAgentController>
}

export function killWorkflowTask(
  taskId: string,
  setAppState: SetAppState,
): void {
  updateTaskState(taskId, setAppState, task => {
    if (task.type !== 'local_workflow' || task.status !== 'running') {
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

export function skipWorkflowAgent(
  _taskId: string,
  _agentId: AgentId,
  _setAppState: SetAppState,
): void {}

export function retryWorkflowAgent(
  _taskId: string,
  _agentId: AgentId,
  _setAppState: SetAppState,
): void {}

export const LocalWorkflowTask: Task = {
  name: 'Workflow',
  type: 'local_workflow',
  async kill(taskId: string, setAppState: SetAppState): Promise<void> {
    killWorkflowTask(taskId, setAppState)
  },
}

export function isLocalWorkflowTask(
  task: AppState['tasks'][string] | undefined,
): task is LocalWorkflowTaskState {
  return task?.type === 'local_workflow'
}
