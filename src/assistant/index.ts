let assistantForced = false

export function markAssistantForced(): void {
  assistantForced = true
}

export function isAssistantForced(): boolean {
  return assistantForced
}

export function isAssistantMode(): boolean {
  return assistantForced || process.env.CLAUDE_CODE_ASSISTANT === '1'
}

export async function initializeAssistantTeam(): Promise<undefined> {
  return undefined
}

export function getAssistantSystemPromptAddendum(): string {
  return 'Assistant compatibility mode is enabled, but advanced Kairos features are unavailable in this snapshot.'
}

const placeholderAssistant = {
  name: 'assistant',
  description: 'Kairos assistant placeholder',
  run: async () => {
    throw new Error('Kairos assistant is not available in this snapshot')
  },
}

export default placeholderAssistant
