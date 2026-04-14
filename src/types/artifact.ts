import { z } from 'zod/v4'
import { lazySchema } from '../utils/lazySchema.js'

export const ARTIFACT_SCHEMA_VERSION = 1 as const

export const ArtifactKindSchema = z
  .enum([
    'research_brief',
    'design_spec',
    'implementation_report',
    'review_report',
  ])
  .describe('Structured artifact kinds used for Track B handoffs.')

export type ArtifactKind = z.infer<typeof ArtifactKindSchema>

export const ArtifactProducerSchema = z
  .object({
    agentId: z.string().min(1).optional(),
    agentName: z.string().min(1).optional(),
    taskId: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
  })
  .passthrough()

export type ArtifactProducer = z.infer<typeof ArtifactProducerSchema>

const ArtifactSectionSchema = z
  .object({
    heading: z.string().min(1),
    content: z.string().min(1),
  })
  .passthrough()

export type ArtifactSection = z.infer<typeof ArtifactSectionSchema>

const ResearchBriefPayloadSchema = z
  .object({
    objective: z.string().min(1),
    findings: z.array(z.string().min(1)).default([]),
    relevantFiles: z.array(z.string().min(1)).default([]),
    openQuestions: z.array(z.string().min(1)).default([]),
  })
  .passthrough()

const DesignSpecPayloadSchema = z
  .object({
    objective: z.string().min(1),
    proposedChanges: z.array(z.string().min(1)).default([]),
    relevantFiles: z.array(z.string().min(1)).default([]),
    risks: z.array(z.string().min(1)).default([]),
    verificationPlan: z.array(z.string().min(1)).default([]),
  })
  .passthrough()

const ImplementationReportPayloadSchema = z
  .object({
    objective: z.string().min(1),
    completedChanges: z.array(z.string().min(1)).default([]),
    touchedFiles: z.array(z.string().min(1)).default([]),
    testsRun: z.array(z.string().min(1)).default([]),
    followUps: z.array(z.string().min(1)).default([]),
  })
  .passthrough()

const ReviewReportPayloadSchema = z
  .object({
    objective: z.string().min(1),
    verdict: z.enum(['approved', 'changes_requested', 'blocked']),
    findings: z.array(z.string().min(1)).default([]),
    risks: z.array(z.string().min(1)).default([]),
    followUps: z.array(z.string().min(1)).default([]),
  })
  .passthrough()

export const ArtifactPayloadSchema = lazySchema(() =>
  z.discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('research_brief'),
        data: ResearchBriefPayloadSchema,
      })
      .passthrough(),
    z
      .object({
        kind: z.literal('design_spec'),
        data: DesignSpecPayloadSchema,
      })
      .passthrough(),
    z
      .object({
        kind: z.literal('implementation_report'),
        data: ImplementationReportPayloadSchema,
      })
      .passthrough(),
    z
      .object({
        kind: z.literal('review_report'),
        data: ReviewReportPayloadSchema,
      })
      .passthrough(),
  ]),
)

export type ArtifactPayload = z.infer<ReturnType<typeof ArtifactPayloadSchema>>

export const ArtifactSchema = lazySchema(() =>
  z
    .object({
      id: z.string().uuid(),
      version: z.number().int().positive().default(ARTIFACT_SCHEMA_VERSION),
      taskId: z.string().min(1),
      kind: ArtifactKindSchema,
      title: z.string().min(1).optional(),
      summary: z.string().min(1),
      createdAt: z.string().datetime(),
      producer: ArtifactProducerSchema,
      payload: ArtifactPayloadSchema(),
      sourceMessageIds: z.array(z.string().min(1)).optional(),
      supersedesArtifactId: z.string().uuid().optional(),
      tags: z.array(z.string().min(1)).optional(),
      sections: z.array(ArtifactSectionSchema).optional(),
    })
    .superRefine((value, ctx) => {
      if (value.payload.kind !== value.kind) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['payload', 'kind'],
          message: 'payload.kind must match artifact kind',
        })
      }
    })
    .passthrough(),
)

export type Artifact = z.infer<ReturnType<typeof ArtifactSchema>>
