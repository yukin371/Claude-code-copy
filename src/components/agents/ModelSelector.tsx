import * as React from 'react'
import { Box, Text } from '../../ink.js'
import {
  getAgentModelOptions,
  SUBAGENT_ROUTE_DEFAULT_OPTION_VALUE,
} from '../../utils/model/agent.js'
import { Select } from '../CustomSelect/select.js'

interface ModelSelectorProps {
  initialModel?: string
  onComplete: (model?: string) => void
  onCancel?: () => void
}

export function ModelSelector({
  initialModel,
  onComplete,
  onCancel,
}: ModelSelectorProps): React.ReactNode {
  const base = getAgentModelOptions()
  const modelOptions =
    initialModel && !base.some(o => o.value === initialModel)
      ? [
          {
            value: initialModel,
            label: initialModel,
            description: 'Current model (custom ID)',
          },
          ...base,
        ]
      : base

  const defaultModel = initialModel ?? SUBAGENT_ROUTE_DEFAULT_OPTION_VALUE
  const handleCancel = () => (onCancel ? onCancel() : onComplete(undefined))
  const handleChange = (model: string) =>
    onComplete(
      model === SUBAGENT_ROUTE_DEFAULT_OPTION_VALUE ? undefined : model,
    )

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text dimColor={true}>
          Model determines the agent&apos;s reasoning capabilities and speed.
          Leave it on the subagent route default to follow defaults.subagent /
          NEKO_CODE_SUBAGENT_MODEL when configured.
        </Text>
      </Box>
      <Select
        options={modelOptions}
        defaultValue={defaultModel}
        onChange={handleChange}
        onCancel={handleCancel}
      />
    </Box>
  )
}
