import type { PermissionMode } from '../permissions/PermissionMode.js'
import { getInitialSettings } from '../settings/settings.js'
import { MODEL_ALIASES, type ModelAlias } from './aliases.js'
import { applyBedrockRegionPrefix, getBedrockRegionPrefix } from './bedrock.js'
import {
  getCanonicalName,
  getRuntimeMainLoopModel,
  normalizeModelStringForAPI,
  parseUserSpecifiedModel,
  renderModelName,
} from './model.js'
import { getModelOptions } from './modelOptions.js'
import { getAPIProvider } from './providers.js'
import {
  getTaskRouteExecutionTarget,
  resolveTaskRouteName,
} from './taskRouting.js'

export const AGENT_MODEL_OPTIONS = [...MODEL_ALIASES, 'inherit'] as const
export const SUBAGENT_ROUTE_DEFAULT_OPTION_VALUE = '__subagent_route_default__'
export type AgentModelAlias = (typeof AGENT_MODEL_OPTIONS)[number]

export type AgentModelOption = {
  value: string
  label: string
  description: string
}

/**
 * Get the final fallback subagent model.
 * Route-level defaults and env overrides are resolved before this runs.
 */
export function getDefaultSubagentModel(): string {
  return 'inherit'
}

function normalizeConfiguredModel(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function getConfiguredSubagentRouteModel():
  | {
      model: string
      source: string
    }
  | undefined {
  const routeEnvModel = normalizeConfiguredModel(process.env.NEKO_CODE_SUBAGENT_MODEL)
  if (routeEnvModel) {
    return {
      model: routeEnvModel,
      source: 'NEKO_CODE_SUBAGENT_MODEL',
    }
  }

  const settings = getInitialSettings() as {
    defaults?: {
      subagent?: string
    }
    taskRoutes?: {
      subagent?: {
        model?: string
      }
    }
  }

  const defaultModel = normalizeConfiguredModel(settings.defaults?.subagent)
  if (defaultModel) {
    return {
      model: defaultModel,
      source: 'defaults.subagent',
    }
  }

  const legacyRouteModel = normalizeConfiguredModel(
    settings.taskRoutes?.subagent?.model,
  )
  if (legacyRouteModel) {
    return {
      model: legacyRouteModel,
      source: 'taskRoutes.subagent.model',
    }
  }

  const legacyEnvModel = normalizeConfiguredModel(
    process.env.CLAUDE_CODE_SUBAGENT_MODEL,
  )
  if (legacyEnvModel) {
    return {
      model: legacyEnvModel,
      source: 'CLAUDE_CODE_SUBAGENT_MODEL',
    }
  }

  return undefined
}

function getSubagentRouteDefaultInfo(): {
  description: string
  display: string
} {
  const configured = getConfiguredSubagentRouteModel()

  if (!configured) {
    return {
      display: 'Subagent route default (default; inherits from parent)',
      description:
        'No subagent route model is configured; falls back to inherit from parent',
    }
  }

  return {
    display: `Subagent route default (default; ${configured.model} via ${configured.source})`,
    description: `Currently ${configured.model} from ${configured.source}`,
  }
}

/**
 * Get the effective model string for an agent.
 *
 * For Bedrock, if the parent model uses a cross-region inference prefix (e.g., "eu.", "us."),
 * that prefix is inherited by subagents using alias models (e.g., "sonnet", "haiku", "opus").
 * This ensures subagents use the same region as the parent, which is necessary when
 * IAM permissions are scoped to specific cross-region inference profiles.
 */
export function getAgentModel(
  agentModel: string | undefined,
  parentModel: string,
  toolSpecifiedModel?: string,
  permissionMode?: PermissionMode,
  agentType?: string,
  taskPrompt?: string,
): string {
  // Extract Bedrock region prefix from parent model to inherit for subagents.
  // This ensures subagents use the same cross-region inference profile (e.g., "eu.", "us.")
  // as the parent, which is required when IAM permissions only allow specific regions.
  const parentRegionPrefix = getBedrockRegionPrefix(parentModel)

  // Helper to apply parent region prefix for Bedrock models.
  // `originalSpec` is the raw model string before resolution (alias or full ID).
  // If the user explicitly specified a full model ID that already carries its own
  // region prefix (e.g., "eu.anthropic.…"), we preserve it instead of overwriting
  // with the parent's prefix. This prevents silent data-residency violations when
  // an agent config intentionally pins to a different region than the parent.
  function applyInheritedRegionPrefix(
    resolvedModel: string,
    originalSpec: string,
  ): string {
    if (parentRegionPrefix && getAPIProvider() === 'bedrock') {
      if (getBedrockRegionPrefix(originalSpec)) return resolvedModel
      return applyBedrockRegionPrefix(resolvedModel, parentRegionPrefix)
    }
    return resolvedModel
  }

  if (toolSpecifiedModel) {
    if (aliasMatchesParentTier(toolSpecifiedModel, parentModel)) {
      return parentModel
    }
    const model = parseUserSpecifiedModel(toolSpecifiedModel)
    return applyInheritedRegionPrefix(model, toolSpecifiedModel)
  }

  const route = resolveTaskRouteName({ agentType, taskPrompt })
  const routeTarget = getTaskRouteExecutionTarget(route)
  if (routeTarget.model) {
    return routeTarget.apiStyle === 'anthropic'
      ? parseUserSpecifiedModel(routeTarget.model)
      : normalizeModelStringForAPI(routeTarget.model)
  }

  if (route === 'subagent' && process.env.CLAUDE_CODE_SUBAGENT_MODEL) {
    return parseUserSpecifiedModel(process.env.CLAUDE_CODE_SUBAGENT_MODEL)
  }

  const agentModelWithExp = agentModel ?? getDefaultSubagentModel()

  if (agentModelWithExp === 'inherit') {
    // Apply runtime model resolution for inherit to get the effective model
    // This ensures agents using 'inherit' get opusplan→Opus resolution in plan mode
    return getRuntimeMainLoopModel({
      permissionMode: permissionMode ?? 'default',
      mainLoopModel: parentModel,
      exceeds200kTokens: false,
    })
  }

  if (aliasMatchesParentTier(agentModelWithExp, parentModel)) {
    return parentModel
  }
  const model = parseUserSpecifiedModel(agentModelWithExp)
  return applyInheritedRegionPrefix(model, agentModelWithExp)
}

/**
 * Check if a bare family alias (opus/sonnet/haiku) matches the parent model's
 * tier. When it does, the subagent inherits the parent's exact model string
 * instead of resolving the alias to a provider default.
 *
 * Prevents surprising downgrades: a Vertex user on Opus 4.6 (via /model) who
 * spawns a subagent with `model: opus` should get Opus 4.6, not whatever
 * getDefaultOpusModel() returns for 3P.
 * See https://github.com/anthropics/claude-code/issues/30815.
 *
 * Only bare family aliases match. `opus[1m]`, `best`, `opusplan` fall through
 * since they carry semantics beyond "same tier as parent".
 */
function aliasMatchesParentTier(alias: string, parentModel: string): boolean {
  const canonical = getCanonicalName(parentModel)
  switch (alias.toLowerCase()) {
    case 'opus':
      return canonical.includes('opus')
    case 'sonnet':
      return canonical.includes('sonnet')
    case 'haiku':
      return canonical.includes('haiku')
    default:
      return false
  }
}

export function getAgentModelDisplay(model: string | undefined): string {
  if (!model) return getSubagentRouteDefaultInfo().display
  if (model === 'inherit') return 'Inherit from parent'

  const trimmed = model.trim()
  const resolved = parseUserSpecifiedModel(trimmed)
  const renderedResolved = renderModelName(resolved)

  if (resolved === trimmed) {
    return renderedResolved
  }
  return `${trimmed} (${renderedResolved})`
}

/**
 * Get available model options for agents
 */
export function getAgentModelOptions(): AgentModelOption[] {
  const options: AgentModelOption[] = [
    {
      value: SUBAGENT_ROUTE_DEFAULT_OPTION_VALUE,
      label: 'Use subagent route default',
      description: getSubagentRouteDefaultInfo().description,
    },
    {
      value: 'inherit',
      label: 'Inherit from parent',
      description: "Always use the parent thread's resolved model",
    },
  ]

  const seen = new Set<string>([
    SUBAGENT_ROUTE_DEFAULT_OPTION_VALUE,
    'inherit',
  ])

  for (const option of getModelOptions()) {
    if (option.value === null) continue
    const value = option.value.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    options.push({
      value,
      label: option.label,
      description: option.descriptionForModel ?? option.description,
    })
  }

  const legacyAliases: AgentModelOption[] = [
    {
      value: 'sonnet',
      label: 'Sonnet',
      description: 'Balanced performance - best for most agents',
    },
    {
      value: 'opus',
      label: 'Opus',
      description: 'Most capable for complex reasoning tasks',
    },
    {
      value: 'haiku',
      label: 'Haiku',
      description: 'Fast and efficient for simple tasks',
    },
  ]

  for (const option of legacyAliases) {
    if (seen.has(option.value)) continue
    seen.add(option.value)
    options.push(option)
  }

  return options
}
