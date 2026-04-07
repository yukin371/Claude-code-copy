import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import * as React from 'react'
import { UserPromptMessage } from './UserPromptMessage.js'

type Props = {
  addMargin: boolean
  param: TextBlockParam
}

// Snapshot fallback: keep fork boilerplate visible as plain text rather than
// failing module resolution in the user message renderer.
export function UserForkBoilerplateMessage({
  addMargin,
  param,
}: Props): React.ReactNode {
  return <UserPromptMessage addMargin={addMargin} param={param} />
}
