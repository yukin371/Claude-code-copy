import type {
  TaskRouteDebugSnapshot,
  TaskRouteFromQuerySourceDebugSnapshot,
  TaskRouteName,
} from './model/taskRouting.js'
import { buildTaskRouteCompactConfigSourceSummary } from './taskRouteSourceLabels.js'

function getBaseSummaryParts(snapshot: TaskRouteDebugSnapshot): string[] {
  const parts = [
    `model=${snapshot.executionTarget.model ?? '[default]'} (${snapshot.fields.model.source})`,
    `provider=${snapshot.executionTarget.provider}`,
    `apiStyle=${snapshot.executionTarget.apiStyle}`,
    `resolvedSource=${snapshot.transport.resolvedSourceId ?? '[unresolved]'}`,
    `config=${buildTaskRouteCompactConfigSourceSummary(snapshot)}`,
  ]

  if (snapshot.transport.baseUrl) {
    parts.push(`baseUrl=${snapshot.transport.baseUrl}`)
  }

  return parts
}

export function formatTaskRouteSummaryLine(
  route: TaskRouteName,
  snapshot: TaskRouteDebugSnapshot,
): string {
  return `${route}: ${getBaseSummaryParts(snapshot).join(' / ')}`
}

export function formatQuerySourceTaskRouteSummaryLine(
  snapshot: TaskRouteFromQuerySourceDebugSnapshot,
): string {
  const parts = getBaseSummaryParts(snapshot.routeSnapshot)
  if (snapshot.querySourceRuleOverrideFields.length > 0) {
    parts.push(
      `ruleOverride=${snapshot.querySourceRuleOverrideFields.join('+')}`,
    )
  }
  return `${snapshot.querySource} -> ${snapshot.routeSnapshot.route}: ${parts.join(' / ')}`
}
