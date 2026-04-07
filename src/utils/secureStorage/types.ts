export type SecureStorageData = Record<string, unknown> & {
  trustedDeviceToken?: string
  mcpOAuth?: Record<string, unknown>
  mcpOAuthClientConfig?: Record<string, unknown>
  pluginSecrets?: Record<string, unknown>
}

export type SecureStorage = {
  name: string
  read: () => SecureStorageData | null
  readAsync: () => Promise<SecureStorageData | null>
  update: (data: SecureStorageData) => { success: boolean; warning?: string }
  delete: () => boolean
}
