export type AssistantSession = {
  id: string
  title?: string
  sessionUrl?: string
}

export async function discoverAssistantSessions(): Promise<AssistantSession[]> {
  return []
}
