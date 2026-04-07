# 2026-04-07 MCP Strict Config Smoke

## Goal

- Close the remaining `MCP strict-config` gap with a repeatable, non-interactive smoke.
- Verify the real `--mcp-config` strict validation entry instead of reusing `mcp list/get`.

## Harness

- Script: `bun run scripts/mcp-strict-config-smoke.ts`
- Isolation:
  - temporary `workspace`
  - temporary `NEKO_CODE_CONFIG_DIR`
  - temporary `CLAUDE_CODE_PLUGIN_CACHE_DIR`
  - local `.mcp.json` fixture inside the temporary workspace
  - explicit valid / invalid `--mcp-config` files inside the temp root

## Covered cases

- `cli-valid-strict-config`
  - runs `bun src/entrypoints/cli.tsx --bare --init-only --strict-mcp-config --mcp-config <valid-file>`
  - expects exit `0`
- `cli-invalid-strict-config`
  - runs the same main entry with an invalid config
  - expects exit `1` and `Invalid MCP configuration`
- `strict-suppresses-local-configs`
  - uses the same config parsing/loading primitives as `main.tsx`
  - asserts non-strict resolution includes both workspace `.mcp.json` and explicit dynamic config
  - asserts strict resolution keeps only the explicit dynamic config

## Latest run

- Date: `2026-04-07`
- Command: `bun run scripts/mcp-strict-config-smoke.ts`
- Result: pass
- Notes:
  - `--bare --init-only` is the stable CLI carrier for explicit strict validation
  - `mcp list/get` remain intentionally excluded from this smoke because they do not cover the main `--mcp-config` validation path
  - internal semantic assertion now follows the same final merge semantics as `main.tsx`: `{ ...existingMcpConfigs, ...dynamicMcpConfig }`
  - harness must call `enableConfigs()` before `getClaudeCodeMcpConfigs()` so it matches the main-entry config access gate
