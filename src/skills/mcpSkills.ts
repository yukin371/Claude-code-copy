type FetchMcpSkillsForClient = ((client?: unknown) => Promise<unknown[]>) & {
  cache: Map<string, unknown[]>
}

export const fetchMcpSkillsForClient: FetchMcpSkillsForClient = Object.assign(
  async (_client?: unknown) => [],
  { cache: new Map<string, unknown[]>() },
)
