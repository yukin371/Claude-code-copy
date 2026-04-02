export type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = never
export type AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED = never

export function stripProtoFields<V>(
  metadata: Record<string, V>,
): Record<string, V> {
  let result: Record<string, V> | undefined
  for (const key in metadata) {
    if (key.startsWith('_PROTO_')) {
      if (result === undefined) {
        result = { ...metadata }
      }
      delete result[key]
    }
  }
  return result ?? metadata
}

type LogEventMetadata = { [key: string]: boolean | number | undefined }

export type AnalyticsSink = {
  logEvent: (eventName: string, metadata: LogEventMetadata) => void
  logEventAsync: (
    eventName: string,
    metadata: LogEventMetadata,
  ) => Promise<void>
}

export function attachAnalyticsSink(_newSink: AnalyticsSink): void {}

export function logEvent(
  eventName: string,
  _metadata: LogEventMetadata,
): void {
  void eventName
}

export async function logEventAsync(
  eventName: string,
  _metadata: LogEventMetadata,
): Promise<void> {
  void eventName
}

export function _resetForTesting(): void {
}
