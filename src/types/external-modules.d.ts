declare module '*.md' {
  const content: string
  export default content
}

declare module 'audio-capture-napi' {
  export function isNativeAudioAvailable(): boolean
  export function isNativeRecordingActive(): boolean
  export function startNativeRecording(
    onData: (data: Buffer) => void,
    onEnd: () => void,
  ): boolean
  export function stopNativeRecording(): void
}

declare module '@ant/claude-for-chrome-mcp' {
  export const BROWSER_TOOLS: Array<{
    name: string
    description?: string
  }>
  export type ClaudeForChromeContext = {
    listInstalledApps?: () => Promise<string[]>
    [key: string]: unknown
  }
  export type Logger = {
    debug?: (...args: unknown[]) => void
    info?: (...args: unknown[]) => void
    warn?: (...args: unknown[]) => void
    error?: (...args: unknown[]) => void
  }
  export type PermissionMode =
    | 'ask'
    | 'skip_all_permission_checks'
    | 'follow_a_plan'
  export function createClaudeForChromeMcpServer(
    context: ClaudeForChromeContext,
    options?: {
      logger?: Logger
      permissionMode?: PermissionMode
      bridgeUrl?: string
      authToken?: string
      socketPath?: string
    },
  ): {
    connect: (transport: unknown) => Promise<void>
    close?: () => Promise<void>
  }
}

declare module '@ant/computer-use-mcp' {
  export type DisplayGeometry = {
    width: number
    height: number
    scaleFactor: number
    displayId?: number
    [key: string]: unknown
  }
  export type FrontmostApp = {
    bundleId: string
    displayName: string
    [key: string]: unknown
  }
  export type InstalledApp = {
    bundleId: string
    displayName: string
    path: string
    iconDataUrl?: string
    [key: string]: unknown
  }
  export type ResolvePrepareCaptureResult = {
    base64: string
    width: number
    height: number
    displayId?: number
    hidden?: string[]
    [key: string]: unknown
  }
  export type RunningApp = {
    bundleId: string
    displayName: string
    appName?: string
    [key: string]: unknown
  }
  export type ScreenshotResult = {
    base64: string
    width: number
    height: number
    [key: string]: unknown
  }
  export function buildComputerUseTools(
    capabilities: unknown,
    coordinateMode: unknown,
    installedAppNames?: unknown,
  ): Array<{
    name: string
  }>
  export type ComputerExecutor = {
    capabilities: unknown
    listInstalledApps: () => Promise<InstalledApp[]>
    [key: string]: unknown
  }
  export const API_RESIZE_PARAMS: unknown
  export function targetImageSize(
    width: number,
    height: number,
    params: unknown,
  ): [number, number]
  export function createComputerUseMcpServer(
    adapter: unknown,
    coordinateMode: unknown,
  ): {
    connect: (transport: unknown) => Promise<void>
    close?: () => Promise<void>
    setRequestHandler: (schema: unknown, handler: unknown) => void
  }
  export type ComputerUseSessionContext = Record<string, unknown>
  export type CuCallToolResult = {
    telemetry?: {
      error_kind?: string
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  export type CuPermissionRequest = unknown
  export type CuPermissionResponse = unknown
  export type ScreenshotDims = {
    width: number
    height: number
    displayId?: number
    originX?: number
    originY?: number
  }
  export const DEFAULT_GRANT_FLAGS: Record<string, unknown>
  export function bindSessionContext(
    adapter: unknown,
    coordinateMode: unknown,
    context: ComputerUseSessionContext,
  ): (name: string, args: unknown) => Promise<CuCallToolResult>
}

declare module '@ant/computer-use-mcp/types' {
  import type { ComputerExecutor } from '@ant/computer-use-mcp'

  export type Logger = {
    silly?: (...args: unknown[]) => void
    debug?: (...args: unknown[]) => void
    info?: (...args: unknown[]) => void
    warn?: (...args: unknown[]) => void
    error?: (...args: unknown[]) => void
  }

  export type ComputerUseHostAdapter = {
    serverName: string
    logger: Logger
    executor: ComputerExecutor
    ensureOsPermissions: () => Promise<unknown>
    isDisabled: () => boolean
    getSubGates: () => unknown
    getAutoUnhideEnabled?: () => boolean
    [key: string]: unknown
  }
}

declare module '@ant/computer-use-input' {
  export type FrontmostAppInfo = {
    bundleId?: string
    appName?: string
  }

  export type ComputerUseInputAPI = {
    keys: (keys: string[]) => Promise<void>
    key: (key: string, action: 'press' | 'release') => Promise<void>
    typeText: (text: string) => Promise<void>
    moveMouse: (x: number, y: number, animate: boolean) => Promise<void>
    mouseButton: (
      button: 'left' | 'right' | 'middle',
      action: 'press' | 'release' | 'click',
      count?: number,
    ) => Promise<void>
    mouseLocation: () => Promise<{ x: number; y: number }> | { x: number; y: number }
    mouseScroll: (
      amount: number,
      axis: 'vertical' | 'horizontal',
    ) => Promise<void>
    getFrontmostAppInfo: () => FrontmostAppInfo | null
    [key: string]: unknown
  }

  export type ComputerUseInput =
    | ({ isSupported: true } & ComputerUseInputAPI)
    | { isSupported: false }
}

declare module '@ant/computer-use-swift' {
  export type ComputerUseAPI = {
    tcc: {
      checkAccessibility: () => boolean
      checkScreenRecording: () => boolean
    }
    apps: {
      prepareDisplay: (
        allowlistBundleIds: string[],
        surrogateHost: string,
        displayId?: number,
      ) => Promise<{ activated?: string; hidden: string[] }>
      previewHideSet: (
        allowlistBundleIds: string[],
        displayId?: number,
      ) => Promise<Array<{ bundleId: string; displayName: string }>>
      findWindowDisplays: (
        bundleIds: string[],
      ) => Promise<Array<{ bundleId: string; displayIds: number[] }>>
      appUnderPoint: (
        x: number,
        y: number,
      ) => Promise<{ bundleId: string; appName?: string } | null>
      listInstalled: () => Promise<
        Array<{ bundleId: string; displayName: string; path: string }>
      >
      iconDataUrl: (path: string) => string | null
      listRunning: () => Promise<
        Array<{ bundleId: string; displayName: string; appName?: string }>
      >
      open: (bundleId: string) => Promise<void>
      unhide: (bundleIds: string[]) => Promise<void>
    }
    display: {
      getSize: (
        displayId?: number,
      ) => DisplayGeometry
      listAll: () => Promise<DisplayGeometry[]>
    }
    screenshot: {
      captureExcluding: (...args: unknown[]) => Promise<{
        base64: string
        width: number
        height: number
      }>
      captureRegion: (...args: unknown[]) => Promise<{
        base64: string
        width: number
        height: number
      }>
    }
    resolvePrepareCapture: (
      ...args: unknown[]
    ) => Promise<ResolvePrepareCaptureResult>
  }
}

declare module 'sharp' {
  type SharpInstance = {
    resize: (...args: unknown[]) => SharpInstance
    jpeg: (...args: unknown[]) => SharpInstance
    png: (...args: unknown[]) => SharpInstance
    webp: (...args: unknown[]) => SharpInstance
    toBuffer: () => Promise<Buffer>
  }

  type SharpFactory = (input?: unknown, options?: unknown) => SharpInstance

  const sharp: SharpFactory
  export default sharp
}

declare module 'image-processor-napi' {
  import type sharp from 'sharp'

  export type NativeImageProcessorModule = {
    hasClipboardImage?: () => boolean
    readClipboardImage?: (
      maxWidth: number,
      maxHeight: number,
    ) =>
      | {
          png: Buffer
          width: number
          height: number
          originalWidth: number
          originalHeight: number
        }
      | null
  }

  export const sharp: typeof sharp
  export function getNativeModule(): NativeImageProcessorModule | null
  const imageProcessor: typeof sharp
  export default imageProcessor
}

declare module 'turndown' {
  class TurndownService {
    constructor(options?: unknown)
    turndown(input: string): string
  }

  export = TurndownService
}

declare module '@aws-sdk/client-sts' {
  export class STSClient {
    send(command: unknown): Promise<unknown>
  }
  export class GetCallerIdentityCommand {
    constructor(input: unknown)
  }
}

declare module '@aws-sdk/client-bedrock' {
  export type BedrockClientConfig = {
    region?: string
    endpoint?: string
    requestHandler?: unknown
    httpAuthSchemes?: unknown[]
    httpAuthSchemeProvider?: () => unknown[]
    credentials?: {
      accessKeyId: string
      secretAccessKey: string
      sessionToken?: string
    }
  }

  export class BedrockClient {
    constructor(config?: BedrockClientConfig)
    send(command: unknown): Promise<{
      inferenceProfileSummaries?: Array<{ inferenceProfileId?: string }>
      nextToken?: string
      models?: Array<{ modelArn?: string }>
    }>
  }

  export class ListInferenceProfilesCommand {
    constructor(input: { nextToken?: string; typeEquals?: string })
  }

  export class GetInferenceProfileCommand {
    constructor(input: { inferenceProfileIdentifier: string })
  }
}

declare module '@aws-sdk/credential-providers' {
  export function fromIni(options?: unknown): () => Promise<unknown>
}

declare module 'cacache' {
  const cacache: {
    ls: {
      stream: (path: string) => AsyncIterable<{
        key: string
        time?: number
      }>
    }
    rm: {
      entry: (path: string, key: string) => Promise<void>
    }
  }
  export = cacache
}

declare module 'cli-highlight' {
  export function highlight(code: string, options?: unknown): string
  export function supportsLanguage(language: string): boolean
}

declare module 'highlight.js' {
  export function getLanguage(language: string): unknown
}

declare module '../../bridge/peerSessions.js' {
  export function postInterClaudeMessage(
    target: string,
    message: string,
  ): Promise<{ ok: boolean; error?: string }>
}

declare module '../../utils/udsClient.js' {
  export function sendToUdsSocket(
    target: string,
    message: string,
  ): Promise<void>
}

declare module '../../services/skillSearch/remoteSkillState.js' {
  export function getDiscoveredRemoteSkill(
    slug: string,
  ): { url: string } | null
}

declare module '../../services/skillSearch/remoteSkillLoader.js' {
  export function loadRemoteSkill(
    slug: string,
    url: string,
  ): Promise<{
    cacheHit: boolean
    latencyMs: number
    skillPath: string
    content: string
    fileCount: number
    totalBytes: number
    fetchMethod?: string
  }>
}

declare module '../../services/skillSearch/telemetry.js' {
  export function logRemoteSkillLoaded(input: {
    slug: string
    cacheHit: boolean
    latencyMs: number
    urlScheme: string
    error?: string
  }): void
}

declare module '../../services/skillSearch/featureCheck.js' {
  export function isSkillSearchEnabled(): boolean
  export function stripCanonicalPrefix(input: string): string | null
}
