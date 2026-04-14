import type { Artifact } from '../types/artifact.js'
import type { HandoffEnvelope } from '../types/handoffEnvelope.js'
import {
  type HandoffEventType,
  HANDOVER_ENVELOPE_VERSION,
  HandoffEnvelopeSchema,
} from '../types/handoffEnvelope.js'

export interface HandoffOptions {
  from: string
  to: string
  taskId: string
  eventType: HandoffEventType
  artifacts?: Artifact[]
  requiresDecision?: boolean
  summary?: string
}

/**
 * Builds a HandoffEnvelope from a list of artifacts.
 * Falls back to a minimal summary if none provided.
 */
export function createHandoffEnvelope(options: HandoffOptions): HandoffEnvelope {
  const artifactIds = options.artifacts?.map(a => a.id) ?? []
  const summary =
    options.summary ?? generateHandoffSummary(options.artifacts ?? [])

  const envelope = {
    version: HANDOVER_ENVELOPE_VERSION,
    taskId: options.taskId,
    eventType: options.eventType,
    from: options.from,
    to: options.to,
    artifactIds: artifactIds.length > 0 ? artifactIds : undefined,
    summary,
    requiresDecision: options.requiresDecision ?? false,
    createdAt: new Date().toISOString(),
  }

  // Validate at construction time
  return HandoffEnvelopeSchema().parse(envelope)
}

/**
 * Generates a Markdown handoff summary compatible with the quotaHandoffSummary format.
 * Fixed headings: ## Goal, ## Current State, ## Next Steps, ## Key Files, ## Risks / Constraints
 */
export function generateHandoffSummary(artifacts: Artifact[]): string {
  if (artifacts.length === 0) {
    return '## Goal\n_No artifacts provided._\n\n## Current State\n_\n\n## Next Steps\n_\n\n## Key Files\n_\n\n## Risks / Constraints\n_'
  }

  const sections = artifacts.map(a => {
    const kindLabel = a.kind.replace(/_/g, ' ')
    return `### [${a.kind}] ${a.title ?? a.id} (${kindLabel})\n\n${a.summary}`
  })

  return [
    '## Goal\n_Handoff of artifacts between agents._',
    '',
    '## Current State',
    sections.join('\n\n'),
    '',
    '## Next Steps\n_Recipients should review the artifacts above._',
    '',
    '## Key Files\n_Artifact IDs for reference:_\n' +
      artifacts.map(a => `- ${a.id} (${a.kind})`).join('\n'),
    '',
    '## Risks / Constraints\n_Ensure artifact integrity before processing._',
  ].join('\n')
}
