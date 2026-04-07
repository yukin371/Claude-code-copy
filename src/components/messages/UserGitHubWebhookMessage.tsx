import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import * as React from 'react'
import { UserPromptMessage } from './UserPromptMessage.js'

type Props = {
  addMargin: boolean
  param: TextBlockParam
}

// Snapshot fallback: render webhook payload as a normal user prompt until the
// dedicated formatter is restored.
export function UserGitHubWebhookMessage({
  addMargin,
  param,
}: Props): React.ReactNode {
  return <UserPromptMessage addMargin={addMargin} param={param} />
}
