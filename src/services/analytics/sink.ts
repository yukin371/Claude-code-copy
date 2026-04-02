/**
 * Analytics sink implementation
 *
 * Neko Code disables analytics dispatch by default. The sink still exists so
 * startup code can attach it without special casing, but the handlers are
 * intentionally no-ops.
 */

import { attachAnalyticsSink } from './index.js'

type LogEventMetadata = { [key: string]: boolean | number | undefined }

function logEventImpl(_eventName: string, _metadata: LogEventMetadata): void {}

function logEventAsyncImpl(
  _eventName: string,
  _metadata: LogEventMetadata,
): Promise<void> {
  return Promise.resolve()
}

/**
 * Initialize the analytics sink.
 *
 * The attached sink is intentionally inert so no telemetry leaves the process.
 */
export function initializeAnalyticsSink(): void {
  attachAnalyticsSink({
    logEvent: logEventImpl,
    logEventAsync: logEventAsyncImpl,
  })
}
