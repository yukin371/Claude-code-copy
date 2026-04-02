# Telemetry Removal Plan

## Goal
- Remove runtime telemetry initialization and startup triggers.
- Keep compatibility shims only where needed for compilation.

## Completed
- `src/entrypoints/init.ts` no longer initializes telemetry or 1P event logging.
- `src/services/analytics/growthbook.ts` is reduced to a compatibility shim: no remote GrowthBook client, no refresh loop, no remote eval, no experiment logging.
- `src/services/analytics/firstPartyEventLogger.ts` is a compatibility shim: 1P event logging is always disabled and logging calls are no-ops.
- `src/utils/telemetry/instrumentation.ts` keeps `flushTelemetry()` as a no-op, so logout no longer uploads or flushes telemetry data.
- Analytics/telemetry service modules are inert no-op shims by default.

## Remaining Cleanup
- Remove leftover `initializeGrowthBook()` / `refreshGrowthBookAfterAuthChange()` call sites if we want a cleaner code surface, even though they are now harmless no-ops.
- Remove `logEventTo1P(...)` call sites like feedback submission if we want telemetry-free source code instead of compatibility shims.
- Delete compatibility shim files only after all imports are removed.
- Consider removing `firstPartyEventLoggingExporter.ts` once no compatibility path references it.

## Verification
- `bun test src/services/analytics/growthbook.test.ts src/services/analytics/firstPartyEventLogger.test.ts`
- `bun test src/utils/model/providerMetadata.test.ts src/utils/model/providerBalancer.test.ts src/services/api/openaiCompatibleClient.test.ts`
- `bun run scripts/bun-tools.ts providers`
