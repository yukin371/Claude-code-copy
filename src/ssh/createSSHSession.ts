import type { PermissionMode } from '../utils/permissions/PermissionMode.js'
import type {
  SSHSessionManager,
  SSHSessionManagerCallbacks,
} from './SSHSessionManager.js'

export type SSHSession = {
  remoteCwd: string
  proc: {
    exitCode: number | null
    signalCode: string | null
  }
  proxy: {
    stop(): void
  }
  createManager(callbacks: SSHSessionManagerCallbacks): SSHSessionManager
  getStderrTail(): string
}

export type CreateSSHSessionOptions = {
  host: string
  cwd?: string
  localVersion?: string
  permissionMode?: PermissionMode
  dangerouslySkipPermissions?: boolean
  extraCliArgs?: string[]
}

export type CreateLocalSSHSessionOptions = {
  cwd?: string
  permissionMode?: PermissionMode
  dangerouslySkipPermissions?: boolean
}

export type CreateSSHSessionProgress = {
  onProgress?: (message: string) => void
}

export class SSHSessionError extends Error {
  constructor(
    message = 'SSH remote is unavailable in this repository snapshot.',
  ) {
    super(message)
    this.name = 'SSHSessionError'
  }
}

function throwUnavailable(): never {
  throw new SSHSessionError()
}

export async function createSSHSession(
  _options: CreateSSHSessionOptions,
  _progress?: CreateSSHSessionProgress,
): Promise<SSHSession> {
  throwUnavailable()
}

export function createLocalSSHSession(
  _options: CreateLocalSSHSessionOptions,
): SSHSession {
  throwUnavailable()
}
