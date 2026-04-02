export type TaskRouteName =
  | 'main'
  | 'subagent'
  | 'frontend'
  | 'review'
  | 'explore'
  | 'plan'
  | 'guide'
  | 'statusline'

const TASK_ROUTE_MODEL_ENV: Record<TaskRouteName, string> = {
  main: 'NEKO_CODE_MAIN_MODEL',
  subagent: 'NEKO_CODE_SUBAGENT_MODEL',
  frontend: 'NEKO_CODE_FRONTEND_MODEL',
  review: 'NEKO_CODE_REVIEW_MODEL',
  explore: 'NEKO_CODE_EXPLORE_MODEL',
  plan: 'NEKO_CODE_PLAN_MODEL',
  guide: 'NEKO_CODE_GUIDE_MODEL',
  statusline: 'NEKO_CODE_STATUSLINE_MODEL',
}

const FRONTEND_TASK_RE =
  /(front[- ]?end|frontend|ui|user interface|前端|界面|页面|react|tsx|component|components|css|tailwind|vue|svelte)/i
const REVIEW_TASK_RE =
  /(review|code review|verification|verify|审查|审核|检查|验证|审阅)/i

function normalizeAgentType(agentType?: string): string {
  return agentType?.trim().toLowerCase() ?? ''
}

function looksLikeFrontendTask(taskPrompt?: string): boolean {
  return taskPrompt ? FRONTEND_TASK_RE.test(taskPrompt) : false
}

function looksLikeReviewTask(taskPrompt?: string): boolean {
  return taskPrompt ? REVIEW_TASK_RE.test(taskPrompt) : false
}

export function resolveTaskRouteName(params: {
  agentType?: string
  taskPrompt?: string
  taskHints?: readonly string[]
}): TaskRouteName {
  const agentType = normalizeAgentType(params.agentType)
  const taskPrompt = params.taskPrompt ?? ''
  const taskHints = new Set(
    params.taskHints?.map(hint => hint.trim().toLowerCase()).filter(Boolean) ??
      [],
  )

  if (
    agentType === 'verification' ||
    taskHints.has('review') ||
    looksLikeReviewTask(taskPrompt)
  ) {
    return 'review'
  }

  if (
    agentType === 'explore' ||
    agentType === 'plan' ||
    agentType === 'claude-code-guide' ||
    agentType === 'statusline-setup'
  ) {
    return agentType === 'explore'
      ? 'explore'
      : agentType === 'plan'
        ? 'plan'
        : agentType === 'claude-code-guide'
          ? 'guide'
          : 'statusline'
  }

  if (taskHints.has('frontend') || looksLikeFrontendTask(taskPrompt)) {
    return 'frontend'
  }

  if (agentType === 'general-purpose' || agentType === 'subagent') {
    return 'subagent'
  }

  return 'subagent'
}

export function getTaskRouteModelOverride(route: TaskRouteName): string | undefined {
  const envName = TASK_ROUTE_MODEL_ENV[route]
  const envValue = process.env[envName]?.trim()
  if (envValue) {
    return envValue
  }

  switch (route) {
    case 'frontend':
      return 'gemini'
    case 'review':
      return 'codex'
    case 'subagent':
      return process.env.CLAUDE_CODE_SUBAGENT_MODEL?.trim() || undefined
    default:
      return undefined
  }
}
