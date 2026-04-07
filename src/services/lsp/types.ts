export type ScopedLspServerConfig = {
  name?: string
  command?: string
  args?: string[]
  cwd?: string
  fileExtensions?: string[]
  extensionToLanguage?: Record<string, string>
  initializationOptions?: Record<string, unknown>
  env?: Record<string, string>
  workspaceFolder?: string
  startupTimeout?: number
  shutdownTimeout?: number
  restartOnCrash?: boolean
  maxRestarts?: number
}

export type LspServerState =
  | 'stopped'
  | 'starting'
  | 'stopping'
  | 'running'
  | 'error'
