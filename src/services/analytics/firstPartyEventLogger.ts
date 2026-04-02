export function is1PEventLoggingEnabled(): boolean {
  return false
}

export function logGrowthBookExperimentTo1P(_payload: unknown): void {}

export function logEventTo1P(
  _eventName: string,
  _metadata: Record<string, unknown>,
): void {}
