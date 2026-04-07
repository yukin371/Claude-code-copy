import type { Command } from '../commands.js'

type FetchMcpSkillsForClient = ((client?: unknown) => Promise<Command[]>) & {
  cache: Map<string, Command[]>
}

export const fetchMcpSkillsForClient: FetchMcpSkillsForClient = Object.assign(
  async (_client?: unknown) => [],
  { cache: new Map<string, Command[]>() },
)
