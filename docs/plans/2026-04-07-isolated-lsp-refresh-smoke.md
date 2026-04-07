# 2026-04-07 Isolated LSP Refresh Smoke

## Goal

Validate that plugin refresh can repopulate plugin-contributed LSP server config into the LSP manager without requiring an interactive REPL session or starting a real language server process.

## Isolation Model

- Run a dedicated Bun harness from the repo checkout.
- Change the process working directory to a disposable temporary workspace.
- Redirect settings writes with `NEKO_CODE_CONFIG_DIR=<temp-config-dir>`.
- Redirect plugin cache writes with `CLAUDE_CODE_PLUGIN_CACHE_DIR=<temp-plugin-cache-dir>`.
- Do **not** enable `CLAUDE_CODE_SIMPLE=1`, because LSP manager initialization is skipped in simple mode.
- Inject a session-only inline plugin that declares one `lspServers` entry in `plugin.json`.

## Script

Run:

```powershell
bun run scripts/lsp-refresh-smoke.ts
```

Keep the temporary directory for inspection:

```powershell
bun run scripts/lsp-refresh-smoke.ts --keep-temp
```

## Covered Flow

The harness runs the smallest useful LSP refresh path:

1. Initialize the LSP manager in an isolated workspace with no inline plugins.
2. Confirm the baseline manager comes up successfully with zero servers.
3. Inject one temporary inline plugin that declares a single LSP server.
4. Run `refreshActivePlugins()` and wait for the manager reinitialization to settle.
5. Confirm the reinitialized manager now exposes one scoped plugin LSP server.

## Current Validation Result

- `baseline-lsp-manager`: passed
- `refresh-with-inline-lsp-plugin`: passed
- delta: LSP servers `+1`

## Assertions

- `initializeLspServerManager()` succeeds in the isolated workspace.
- Baseline manager starts with zero plugin LSP servers.
- `refreshActivePlugins()` reports at least one plugin LSP server after inline plugin injection.
- The LSP manager reinitializes and exposes the scoped server name `plugin:<plugin-name>:smoke`.
- The plugin still appears in `AppState.plugins.enabled` after refresh.

## Why This Helps

- It separates “plugin refresh works” from “plugin refresh repopulates LSP config correctly”.
- It exercises the `reinitializeLspServerManager()` path directly, which is the runtime boundary most likely to regress after plugin loader changes.
- It avoids starting a real LSP child process; the smoke only verifies config loading and manager reconstruction, keeping the test bounded and repeatable.
