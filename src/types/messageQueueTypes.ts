export type QueueOperation =
  | 'enqueue'
  | 'dequeue'
  | 'clear'
  | 'replace'
  | string

export type QueueOperationMessage = {
  type: 'queue-operation'
  operation: QueueOperation
  timestamp: string
  sessionId: string
  content?: string
}
