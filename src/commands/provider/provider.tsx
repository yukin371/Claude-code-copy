import chalk from 'chalk'
import * as React from 'react'
import type { CommandResultDisplay } from '../../commands.js'
import {
  type OptionWithDescription,
  Select,
} from '../../components/CustomSelect/select.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { COMMON_HELP_ARGS, COMMON_INFO_ARGS } from '../../constants/xml.js'
import { Box, Text } from '../../ink.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import {
  applyMainLoopProviderSelection,
  formatProviderTargetLabel,
  getMainLoopProviderState,
  getProviderPickerDescription,
  parseMainLoopProviderSelection,
  type MainLoopProviderSelection,
} from '../../utils/model/mainProvider.js'
import { getProviderDisplayName, PROVIDER_NAMES } from '../../utils/model/providerMetadata.js'

type Props = {
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}

function formatCurrentProviderMessage(): string {
  const state = getMainLoopProviderState()
  if (state.overrideProvider) {
    return `Current provider: ${chalk.bold(formatProviderTargetLabel(state.currentTarget))} (session override)\nBase provider: ${formatProviderTargetLabel(state.baseTarget)}`
  }
  return `Current provider: ${formatProviderTargetLabel(state.currentTarget)}`
}

function buildProviderOptions(): OptionWithDescription<MainLoopProviderSelection>[] {
  const state = getMainLoopProviderState()
  const options: OptionWithDescription<MainLoopProviderSelection>[] = [
    {
      label: `Follow base route (${state.baseTarget.provider})`,
      value: 'default',
      description: `Clear the session override and use ${formatProviderTargetLabel(state.baseTarget)}`,
    },
  ]

  for (const provider of PROVIDER_NAMES) {
    options.push({
      label: getProviderDisplayName(provider),
      value: provider,
      description: getProviderPickerDescription(provider),
    })
  }

  return options
}

function formatSelectionMessage(selection: MainLoopProviderSelection): string {
  const state = applyMainLoopProviderSelection(selection)
  if (selection === 'default') {
    return `Cleared provider override. Main route now uses ${chalk.bold(formatProviderTargetLabel(state.currentTarget))}`
  }
  return `Set provider to ${chalk.bold(formatProviderTargetLabel(state.currentTarget))} for this session`
}

function ProviderPickerCommand({ onDone }: Props): React.ReactNode {
  const state = getMainLoopProviderState()
  const options = React.useMemo(() => buildProviderOptions(), [])
  const defaultValue = state.overrideProvider ?? 'default'

  const handleCancel = React.useCallback(() => {
    onDone(`Kept provider as ${chalk.bold(formatProviderTargetLabel(getMainLoopProviderState().currentTarget))}`, {
      display: 'system',
    })
  }, [onDone])

  const handleSelect = React.useCallback(
    (value: MainLoopProviderSelection) => {
      onDone(formatSelectionMessage(value), {
        display: 'system',
      })
    },
    [onDone],
  )

  return (
    <Dialog
      title="Switch Provider"
      subtitle={formatCurrentProviderMessage()}
      onCancel={handleCancel}
      color="permission"
    >
      <Box flexDirection="column" gap={1}>
        <Text dimColor>
          Future turns in this session will use the selected main provider.
        </Text>
        <Select
          options={options}
          defaultValue={defaultValue}
          defaultFocusValue={defaultValue}
          onChange={handleSelect}
          onCancel={handleCancel}
        />
      </Box>
    </Dialog>
  )
}

function SetProviderAndClose({
  args,
  onDone,
}: {
  args: string
  onDone: Props['onDone']
}): React.ReactNode {
  React.useEffect(() => {
    const selection = parseMainLoopProviderSelection(args)
    if (!selection) {
      onDone(
        `Unknown provider '${args}'. Supported values: ${PROVIDER_NAMES.join(', ')}, default`,
        { display: 'system' },
      )
      return
    }

    onDone(formatSelectionMessage(selection), {
      display: 'system',
    })
  }, [args, onDone])

  return null
}

function ShowProviderAndClose({ onDone }: Props): React.ReactNode {
  onDone(formatCurrentProviderMessage(), {
    display: 'system',
  })
  return null
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const normalizedArgs = args?.trim() || ''

  if (COMMON_INFO_ARGS.includes(normalizedArgs)) {
    return <ShowProviderAndClose onDone={onDone} />
  }

  if (COMMON_HELP_ARGS.includes(normalizedArgs)) {
    onDone(
      'Run /provider to open the provider selection menu, or /provider [providerName] to set the provider for this session.',
      { display: 'system' },
    )
    return
  }

  if (normalizedArgs) {
    return <SetProviderAndClose args={normalizedArgs} onDone={onDone} />
  }

  return <ProviderPickerCommand onDone={onDone} />
}
