import { z } from 'zod/v4'
import { lazySchema } from '../utils/lazySchema.js'

export const HANDOVER_ENVELOPE_VERSION = 1 as const

export const HandoffEventTypeSchema = z.enum([
  'agent_handoff',
  'quota_handoff',
  'task_delegation',
  'review_request',
])
export type HandoffEventType = z.infer<typeof HandoffEventTypeSchema>

export const HandoffEnvelopeSchema = lazySchema(() =>
  z
    .object({
      version: z.number().int().positive().default(HANDOVER_ENVELOPE_VERSION),
      taskId: z.string().min(1),
      eventType: HandoffEventTypeSchema,
      from: z.string().min(1),
      to: z.string().min(1),
      artifactIds: z.array(z.string().uuid()).optional(),
      summary: z.string().min(1),
      requiresDecision: z.boolean().default(false),
      createdAt: z.string().datetime(),
    })
    .passthrough(),
)

export type HandoffEnvelope = z.infer<ReturnType<typeof HandoffEnvelopeSchema>>
