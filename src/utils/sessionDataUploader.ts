type SessionDataUploader = (messages: unknown[]) => void | Promise<void>

export async function createSessionDataUploader(): Promise<
  SessionDataUploader | undefined
> {
  return undefined
}

export async function createSessionTurnUploader(): Promise<
  SessionDataUploader | undefined
> {
  return createSessionDataUploader()
}
