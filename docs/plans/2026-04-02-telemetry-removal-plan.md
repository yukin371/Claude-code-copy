# Telemetry Removal Plan

## Goal
- Remove runtime telemetry initialization and startup triggers.
- Keep compatibility shims only where needed for compilation.

## Completed
- `src/entrypoints/init.ts` no longer initializes telemetry or 1P event logging.
- `src/main.tsx` no longer triggers telemetry startup, analytics gates, or session telemetry helpers.
- `src/interactiveHelpers.tsx` no longer schedules telemetry initialization after trust.
- Analytics/telemetry service modules are inert no-op shims.

## Remaining Optional Cleanup
- Remove leftover telemetry comments and event names if we want a fully telemetry-free code surface.
- Delete compatibility shim files only after all imports are removed.

## Verification
- Search for `initializeTelemetryAfterTrust`, `logSessionTelemetry`, and `logStartupTelemetry` should return no results.
- Build/run a minimal startup check after any further cleanup.
