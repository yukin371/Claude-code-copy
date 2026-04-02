import type { Command } from '../../commands.js'
import { shouldInferenceConfigCommandBeImmediate } from '../../utils/immediateCommand.js'
import { formatProviderTargetLabel, getMainLoopProviderState } from '../../utils/model/mainProvider.js'

export default {
  type: 'local-jsx',
  name: 'provider',
  get description() {
    return `Set the API provider for Neko Code (currently ${formatProviderTargetLabel(getMainLoopProviderState().currentTarget)})`
  },
  argumentHint: '[provider]',
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate()
  },
  load: () => import('./provider.js'),
} satisfies Command
