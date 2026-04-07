import type { Message } from '../../types/message.js'

const SNIP_BOUNDARY_SUBTYPE = 'snip_boundary'
const SNIP_MARKER_SUBTYPE = 'snip_marker'

export function isSnipBoundaryMessage(message: Message): boolean {
  return (
    message.type === 'system' && message.subtype === SNIP_BOUNDARY_SUBTYPE
  )
}

export function isSnipMarkerMessage(message: Message): boolean {
  return message.type === 'system' && message.subtype === SNIP_MARKER_SUBTYPE
}

export function projectSnippedView<T extends Message>(messages: T[]): T[] {
  return messages.filter(message => !isSnipMarkerMessage(message))
}
