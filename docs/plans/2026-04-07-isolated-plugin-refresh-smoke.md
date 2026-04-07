# 2026-04-07 Isolated Plugin Refresh Smoke

## Goal

Validate the plugin refresh/write-path without touching the shared repo checkout, shared settings, or shared plugin cache.

## Isolation Model

- Run a dedicated Bun harness from the repo checkout.
- Change the process working directory to a disposable temporary workspace.
- Redirect settings writes with `NEKO_CODE_CONFIG_DIR=<temp-config-dir>`.
- Redirect plugin cache writes with `CLAUDE_CODE_PLUGIN_CACHE_DIR=<temp-plugin-cache-dir>`.
- Force simple mode with `CLAUDE_CODE_SIMPLE=1` to keep startup noise and unrelated integrations low.
- Inject a session-only plugin via `--plugin-dir` equivalent state, so the smoke exercises the same inline-plugin refresh path that interactive sessions use.

## Script

Run:

```powershell
bun run scripts/plugin-refresh-smoke.ts
```

Keep the temporary directory for inspection:

```powershell
bun run scripts/plugin-refresh-smoke.ts --keep-temp
```

## Covered Flow

The harness runs two refreshes in one isolated process:

1. Baseline refresh with no inline plugin.
2. Refresh after injecting one temporary inline plugin that contributes:
   - `.claude-plugin/plugin.json`
   - `commands/smoke-refresh.md`

## Current Validation Result

- `baseline-no-inline-plugin`: passed
- `refresh-with-inline-plugin`: passed
- delta: enabled plugins `+1`, commands `+1`

## Assertions

- `refreshActivePlugins()` succeeds in an isolated workspace.
- Enabled plugin count increases after injecting the inline plugin.
- Plugin command count increases after injecting the inline plugin.
- The inline plugin name appears in `AppState.plugins.enabled`.
- `pluginReconnectKey` increments as expected, proving the MCP reconnect trigger is still wired through refresh.

## Why This Helps

- It closes the gap between read-only plugin validation and an actual refresh/write-path smoke.
- It avoids depending on an interactive REPL session just to exercise `/reload-plugins`.
- It gives later `LSP / refresh` work a stable base: first prove refresh itself is isolated and repeatable, then test post-refresh runtime behavior.
