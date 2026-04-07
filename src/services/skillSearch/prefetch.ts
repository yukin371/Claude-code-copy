import type { Attachment } from '../../utils/attachments.js'

export function startSkillDiscoveryPrefetch(
  _input: unknown,
  _messages: unknown[],
  _toolUseContext: unknown,
): Promise<Attachment[]> {
  return Promise.resolve([])
}

export async function collectSkillDiscoveryPrefetch(
  prefetch: Promise<Attachment[]>,
): Promise<Attachment[]> {
  return prefetch
}
