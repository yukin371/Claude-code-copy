import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import * as React from 'react'
import { UserPromptMessage } from './UserPromptMessage.js'

type Props = {
  addMargin: boolean
  param: TextBlockParam
}

// Snapshot fallback: render cross-session payloads as regular prompt text
// until the specialized renderer is restored.
export function UserCrossSessionMessage({
  addMargin,
  param,
}: Props): React.ReactNode {
  return <UserPromptMessage addMargin={addMargin} param={param} />
}
