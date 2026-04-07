# 2026-04-07 Isolated MCP Write Smoke

## Goal

Validate MCP commands that write state without touching the shared repo checkout or the operator's real config directory.

## Isolation Model

- Run the CLI entrypoint from the repo by absolute path.
- Change the working directory to a disposable temporary workspace.
- Redirect user config writes with `NEKO_CODE_CONFIG_DIR=<temp-config-dir>`.
- Redirect plugin cache writes with `CLAUDE_CODE_PLUGIN_CACHE_DIR=<temp-plugin-cache-dir>`.
- Force simple mode with `CLAUDE_CODE_SIMPLE=1` to avoid unrelated startup work.

This keeps project-scoped writes inside the temporary workspace and local/user-scoped writes inside the temporary config directory.

## Script

```powershell
powershell -ExecutionPolicy Bypass -File scripts/isolated-mcp-smoke.ps1
```

List cases without running them:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/isolated-mcp-smoke.ps1 -ListOnly
```

Keep the temporary directory for inspection:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/isolated-mcp-smoke.ps1 -KeepTemp
```

Current validation result on this machine:

- `4 passed, 0 failed, total 4`

## Covered Cases

| Case | Command Shape | Expected Exit | Validation |
| --- | --- | --- | --- |
| `local-add` | `mcp add -s local isolated-local cmd /c exit 0` | `0` | isolated global config file exists and contains `isolated-local`; temp workspace has no `.mcp.json` |
| `local-remove` | `mcp remove isolated-local -s local` | `0` | isolated global config file still exists but no longer contains `isolated-local` |
| `project-add` | `mcp add -s project isolated-project cmd /c exit 0` | `0` | temp workspace `.mcp.json` exists and contains `isolated-project` |
| `project-remove` | `mcp remove isolated-project -s project` | `0` | temp workspace `.mcp.json` remains but no longer contains `isolated-project` |

The harness uses a local stdio command shape, which avoids network access and keeps the write-path smoke bounded to config mutation only.

## Why This Is Useful

- It verifies real add/remove command behavior instead of only help text.
- It proves the current CLI can write and clean up both `local` and `project` MCP scopes under controlled isolation.
- It provides a reusable pattern for later stateful smoke cases such as user-scope MCP writes or plugin refresh flows.
