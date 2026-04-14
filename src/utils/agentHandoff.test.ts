import { describe, expect, test } from 'bun:test'
import { createHandoffEnvelope, generateHandoffSummary } from './agentHandoff.js'
import type { Artifact } from '../types/artifact.js'
import { ARTIFACT_SCHEMA_VERSION } from '../types/artifact.js'

type ArtifactKind = 'research_brief' | 'design_spec' | 'implementation_report' | 'review_report'

const makeArtifact = (overrides: Partial<{
  id: string
  taskId: string
  kind: ArtifactKind
  summary: string
  title: string
}>): Artifact => {
  const kind: ArtifactKind = overrides.kind ?? 'research_brief'
  return {
    id: overrides.id ?? crypto.randomUUID(),
    version: ARTIFACT_SCHEMA_VERSION,
    taskId: overrides.taskId ?? 'task-001',
    kind,
    title: overrides.title ?? 'Test Artifact',
    summary: overrides.summary ?? 'A test artifact for handoff validation.',
    createdAt: new Date().toISOString(),
    producer: {},
    payload: {
      kind,
      data: {
        objective: 'Test objective',
        findings: [],
        relevantFiles: [],
        openQuestions: [],
      },
    },
    ...(overrides.id !== undefined ? { id: overrides.id } : {}),
  } as Artifact
}

describe('createHandoffEnvelope', () => {
  test('constructs a valid envelope without artifacts', () => {
    const envelope = createHandoffEnvelope({
      from: 'agent-1',
      to: 'agent-2',
      taskId: 'task-001',
      eventType: 'agent_handoff',
    })
    expect(envelope.version).toBe(1)
    expect(envelope.taskId).toBe('task-001')
    expect(envelope.eventType).toBe('agent_handoff')
    expect(envelope.from).toBe('agent-1')
    expect(envelope.to).toBe('agent-2')
    expect(envelope.requiresDecision).toBe(false)
    expect(envelope.createdAt).toBeTruthy()
    expect(envelope.artifactIds).toBeUndefined()
  })

  test('populates artifactIds from artifact list', () => {
    const artifacts: Artifact[] = [
      makeArtifact({ id: crypto.randomUUID() }),
      makeArtifact({ id: crypto.randomUUID() }),
    ]
    const envelope = createHandoffEnvelope({
      from: 'agent-1',
      to: 'agent-2',
      taskId: 'task-002',
      eventType: 'quota_handoff',
      artifacts,
    })
    expect(envelope.artifactIds).toHaveLength(2)
    expect(envelope.artifactIds).toEqual(
      expect.arrayContaining(artifacts.map(a => a.id)),
    )
  })

  test('accepts custom summary and requiresDecision', () => {
    const envelope = createHandoffEnvelope({
      from: 'agent-1',
      to: 'agent-2',
      taskId: 'task-003',
      eventType: 'review_request',
      summary: 'Please review these design specs.',
      requiresDecision: true,
    })
    expect(envelope.summary).toBe('Please review these design specs.')
    expect(envelope.requiresDecision).toBe(true)
  })

  test('uses auto-generated summary when not provided', () => {
    const artifacts = [makeArtifact({ kind: 'design_spec', title: 'API Design' })]
    const envelope = createHandoffEnvelope({
      from: 'agent-1',
      to: 'agent-2',
      taskId: 'task-004',
      eventType: 'task_delegation',
      artifacts,
    })
    expect(envelope.summary).toContain('## Goal')
    expect(envelope.summary).toContain('## Current State')
    expect(envelope.summary).toContain('## Next Steps')
    expect(envelope.summary).toContain('## Key Files')
    expect(envelope.summary).toContain('## Risks / Constraints')
  })
})

describe('generateHandoffSummary', () => {
  test('returns structured headings for empty artifact list', () => {
    const summary = generateHandoffSummary([])
    expect(summary).toContain('## Goal')
    expect(summary).toContain('## Current State')
    expect(summary).toContain('## Next Steps')
    expect(summary).toContain('## Key Files')
    expect(summary).toContain('## Risks / Constraints')
  })

  test('includes artifact kind and summary in output', () => {
    const artifacts = [
      makeArtifact({ kind: 'implementation_report', title: 'Auth Module', summary: 'OAuth2 implemented.' }),
    ]
    const summary = generateHandoffSummary(artifacts)
    expect(summary).toContain('implementation_report')
    expect(summary).toContain('OAuth2 implemented.')
    expect(summary).toContain(artifacts[0].id)
  })

  test('backward-compatible: artifact kind matches payload kind', () => {
    for (const kind of ['research_brief', 'design_spec', 'implementation_report', 'review_report'] as const) {
      const artifact = makeArtifact({ kind, summary: `Test ${kind}` })
      expect(artifact.kind).toBe(artifact.payload.kind)
      expect(artifact.kind).toBe(kind)
    }
  })
})

describe('version field', () => {
  test('envelope always carries version', () => {
    const envelope = createHandoffEnvelope({
      from: 'a',
      to: 'b',
      taskId: 't',
      eventType: 'agent_handoff',
    })
    expect(typeof envelope.version).toBe('number')
    expect(envelope.version).toBeGreaterThan(0)
  })

  test('optional backward-compatible fields do not throw', () => {
    const artifact = makeArtifact({})
    expect(artifact.sourceMessageIds).toBeUndefined()
    expect(artifact.supersedesArtifactId).toBeUndefined()
    expect(artifact.tags).toBeUndefined()
    expect(artifact.sections).toBeUndefined()
  })
})
