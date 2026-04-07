import type { ThemeName } from '../../utils/theme.js'

export type TipContext = {
  bashTools?: Set<string>
  readFileState?: unknown
  theme?: ThemeName
}

export type Tip = {
  id: string
  content: (context: TipContext) => Promise<string> | string
  cooldownSessions: number
  isRelevant: (context?: TipContext) => Promise<boolean> | boolean
}
