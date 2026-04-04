import type { AgentColorName } from '../../../tools/AgentTool/agentColorManager.js'
import type { AgentMemoryScope } from '../../../tools/AgentTool/agentMemory.js'
import type { CustomAgentDefinition } from '../../../tools/AgentTool/loadAgentsDir.js'
import type { ModelName } from '../../../utils/model/model.js'
import type { SettingSource } from '../../../utils/settings/constants.js'

export type AgentCreationMethod = 'generate' | 'manual'

export type GeneratedAgentDraft = {
  identifier: string
  whenToUse: string
  systemPrompt: string
}

export type AgentWizardData = {
  location?: SettingSource
  method?: AgentCreationMethod
  generationPrompt?: string
  agentType?: string
  systemPrompt?: string
  whenToUse?: string
  selectedTools?: string[]
  selectedModel?: ModelName
  selectedColor?: AgentColorName
  selectedMemory?: AgentMemoryScope
  generatedAgent?: GeneratedAgentDraft
  finalAgent?: CustomAgentDefinition
  isGenerating?: boolean
  wasGenerated?: boolean
}
