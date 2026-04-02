export function bootstrapTelemetry(): void {}

export function isTelemetryEnabled(): boolean {
  return false
}

export async function initializeTelemetry(): Promise<undefined> {
  return undefined
}

export async function flushTelemetry(): Promise<void> {}
