declare module '@ant/computer-use-mcp/sentinelApps' {
  export type SentinelCategory = 'shell' | 'filesystem' | 'system_settings'

  export function getSentinelCategory(
    bundleId: string,
  ): SentinelCategory | null
}

declare module '@ant/computer-use-mcp/types' {
  export type CoordinateMode = 'pixels' | 'normalized'

  export type CuSubGates = {
    pixelValidation: boolean
    clipboardPasteMultiline: boolean
    mouseAnimation: boolean
    hideBeforeAction: boolean
    autoTargetDisplay: boolean
    clipboardGuard: boolean
  }

  export type CuGrantFlags = {
    clipboardRead: boolean
    clipboardWrite: boolean
    systemKeyCombos: boolean
  }

  export const DEFAULT_GRANT_FLAGS: CuGrantFlags

  export type CuResolvedApp = {
    bundleId: string
    displayName: string
  }

  export type CuPermissionRequest = {
    tccState?: {
      accessibility: boolean
      screenRecording: boolean
    }
    apps: Array<{
      requestedName: string
      resolved?: CuResolvedApp
      alreadyGranted?: boolean
    }>
    requestedFlags: CuGrantFlags
    reason?: string
    willHide?: string[]
  }

  export type CuPermissionResponse = {
    granted: CuResolvedApp[]
    denied: Array<{
      bundleId: string
    }>
    flags: CuGrantFlags
  }

  export interface Logger {
    silly(message: string, ...args: unknown[]): void
    debug(message: string, ...args: unknown[]): void
    info(message: string, ...args: unknown[]): void
    warn(message: string, ...args: unknown[]): void
    error(message: string, ...args: unknown[]): void
  }

  export interface ComputerUseHostAdapter {
    serverName: string
    logger: Logger
    executor: unknown
    ensureOsPermissions(): Promise<
      { granted: true } | { granted: false; accessibility: boolean; screenRecording: boolean }
    >
    isDisabled(): boolean
    getSubGates(): CuSubGates
    getAutoUnhideEnabled(): boolean
    cropRawPatch(): unknown
  }
}
