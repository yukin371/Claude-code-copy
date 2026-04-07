# 2026-04-07 Read-Only Smoke Matrix

## Goal

Solidify a minimal, repeatable smoke matrix for read-only CLI paths so parallel work can validate the runtime surface without mutating shared local state.

## Scope

- Covers CLI/session, plugin, MCP, auth, agent inventory, routing diagnostics, and provider diagnostics commands that are safe to run in the shared repo checkout.
- Focuses on startup, argument parsing, inventory reads, and clear error paths.
- Excludes commands that write local state, spawn long-running services, or require interactive dismissal.

## Current Local Assumptions

- Repo root: `E:\Github\claude-code`
- Project-level `.mcp.json`: absent at validation time
- Installed plugins: none at validation time
- Configured marketplaces: none at validation time
- Auth state is machine-dependent; in the current validation run it returned `loggedIn: true`

## Automated Matrix

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/readonly-smoke.ps1
```

List the covered commands without running them:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/readonly-smoke.ps1 -ListOnly
```

Run only one workflow group:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/readonly-smoke.ps1 -Workflow plugin,mcp
```

Current validation result on this machine:

- `22 passed, 0 failed, total 22`

| Workflow | Command | Expected Exit | Read-Only | Local Env Dependency | Current Observed Result |
| --- | --- | --- | --- | --- | --- |
| cli | `bun src/entrypoints/cli.tsx --version` | `0` | yes | low | prints version banner |
| cli | `bun src/entrypoints/cli.tsx --help` | `0` | yes | low | prints top-level usage |
| cli | `bun src/entrypoints/cli.tsx --bare --help` | `0` | yes | low | prints help with bare flag accepted |
| cli | `bun src/entrypoints/cli.tsx --print --help` | `0` | yes | low | prints help with print flag accepted |
| cli | `bun src/entrypoints/cli.tsx doctor --help` | `0` | yes | low | prints doctor help |
| cli | `bun src/entrypoints/cli.tsx resume --help` | `0` | yes | low | currently falls back to top-level usage; worth a follow-up to confirm intended CLI behavior |
| cli | `bun src/entrypoints/cli.tsx auth status` | `0` | yes | high | current machine returned JSON with `loggedIn: true`, `authMethod: oauth_token`, `apiProvider: firstParty` |
| cli | `bun src/entrypoints/cli.tsx agents` | `0` | yes | medium | current machine listed 2 built-in agents |
| plugin | `bun src/entrypoints/cli.tsx plugin --help` | `0` | yes | low | prints plugin command tree |
| plugin | `bun src/entrypoints/cli.tsx plugin list` | `0` | yes | high | current machine returned `No plugins installed` |
| plugin | `bun src/entrypoints/cli.tsx plugin marketplace list` | `0` | yes | high | current machine returned `No marketplaces configured` |
| plugin | `bun src/entrypoints/cli.tsx plugin validate package.json` | `1` | yes | low | validator rejected `package.json` as a plugin manifest with clear schema errors |
| mcp | `bun src/entrypoints/cli.tsx mcp --help` | `0` | yes | low | prints MCP command tree |
| mcp | `bun src/entrypoints/cli.tsx mcp serve --help` | `0` | yes | low | prints serve help |
| mcp | `bun src/entrypoints/cli.tsx mcp list` | `0` | yes | high | current machine returned `No MCP servers configured` because repo `.mcp.json` is absent |
| mcp | `bun src/entrypoints/cli.tsx mcp get definitely-missing-server` | `1` | yes | medium | returns `No MCP server found with name: definitely-missing-server` |
| routing | `bun run scripts/bun-tools.ts routes` | `0` | yes | low | prints the built-in query-source to route snapshot |
| routing | `bun run scripts/bun-tools.ts route compact` | `0` | yes | low | prints the normalized route for the `compact` query source |
| routing | `bun run scripts/bun-tools.ts route agent:builtin:plan` | `0` | yes | low | prints the normalized route for the built-in plan agent |
| diagnostics | `bun run scripts/bun-tools.ts providers` | `0` | yes | medium | prints provider metadata and configured weights |
| diagnostics | `bun run scripts/bun-tools.ts health` | `0` | yes | medium | prints the cross-provider health summary |
| diagnostics | `bun run scripts/bun-tools.ts health glm` | `0` | yes | medium | prints the provider health summary scoped to `glm` |

## Manual Or Isolated Follow-Ups

- `bun src/entrypoints/cli.tsx doctor`
  - Starts the interactive diagnostics screen and waits for `PressEnterToContinue`.
  - Treat as manual smoke, not part of the automated read-only script.
- `bun src/entrypoints/cli.tsx reload-plugins`
  - May touch plugin caches or other local state.
  - Run in an isolated config directory or disposable environment.
- `bun src/entrypoints/cli.tsx mcp add/remove/serve`
  - `add/remove` mutate config.
  - `serve` is a long-running process; help is automated, real serve should be isolated.
  - For isolated `mcp add/remove` coverage, use [2026-04-07-isolated-mcp-write-smoke.md](/E:/Github/claude-code/docs/plans/2026-04-07-isolated-mcp-write-smoke.md).
  - Current isolated result: `4 passed, 0 failed, total 4`.
- Actual `resume/continue/print/bare` non-help paths
  - Keep these for a later pass that explicitly controls credentials, model access, and session state.

## Why This Helps Parallel Work

- Everyone can reuse the same low-risk verification set before touching higher-risk runtime flows.
- Error-path commands are included, so the matrix checks not only happy-path startup but also user-facing failure messages and exit codes.
- Route and provider diagnostics are now part of the same matrix, so config-driven routing work can be rechecked without inventing a second ad hoc checklist.
- Riskier commands are called out explicitly, which reduces accidental local-state pollution while multiple people are iterating in the same phase.
