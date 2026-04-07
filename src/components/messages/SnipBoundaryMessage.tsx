import * as React from 'react'
import type { Message } from '../../types/message.js'
import { Box, Text } from '../../ink.js'

type Props = {
  message: Message
}

export function SnipBoundaryMessage({ message }: Props): React.ReactNode {
  const text =
    typeof message.content === 'string'
      ? message.content
      : 'Conversation snipped for history replay'

  return (
    <Box marginY={1}>
      <Text dimColor={true}>✻ {text}</Text>
    </Box>
  )
}
