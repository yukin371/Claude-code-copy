# Terminal-Safe Workflow

## Goal

Avoid terminal-breaking single-line output and avoid wasting tokens on raw tool output.

## Rule

Do not use raw `Get-Content`, raw `rg` match output, or raw `bun run typecheck` in this repo unless the output is already known to be tiny.

Use `scripts/terminal-safe.ps1` instead.

Do not use raw `Get-ChildItem` or raw `rg --files` for discovery either. Use the same script for file listing.

## Commands

### 1. Read a bounded file range

```powershell
powershell -ExecutionPolicy Bypass -File scripts/terminal-safe.ps1 read -Path src/components/Stats.tsx -Start 140 -End 190
```

- Adds line numbers
- Truncates long lines
- Never dumps the whole file accidentally

### 2. Search without printing giant matched lines

```powershell
powershell -ExecutionPolicy Bypass -File scripts/terminal-safe.ps1 search -Path src -Pattern "TungstenPill"
```

- Uses `rg --json` internally
- Prints only `file:line: preview`
- Truncates long matches

### 3. Run typecheck safely

```powershell
powershell -ExecutionPolicy Bypass -File scripts/terminal-safe.ps1 typecheck
```

- Writes full output to `.tmp-typecheck.txt`
- Prints only short labels like `File.tsx:123:TS2345`
- Prints top error files summary
- Never prints raw `tsc` output to terminal

### 3a. Inspect specific typecheck targets safely

```powershell
powershell -ExecutionPolicy Bypass -File scripts/terminal-safe.ps1 typecheck-filter -Pattern "src/ink/ink.tsx|src/tools.ts"
```

- Still writes full compiler output to `.tmp-typecheck.txt`
- Prints only matching errors
- Truncates long compiler messages
- Replaces raw `tsc | Select-String ...` usage

### 4. List files safely

```powershell
powershell -ExecutionPolicy Bypass -File scripts/terminal-safe.ps1 files -Path src/components/tasks -Pattern "*.tsx" -MaxMatches 20
```

- Limits file count
- Truncates very long paths
- Avoids dumping huge recursive listings

## Operating Discipline

1. Discover files with `terminal-safe.ps1 files`.
2. Search content with `terminal-safe.ps1 search`.
3. Read context with `terminal-safe.ps1 read`.
4. Verify with `terminal-safe.ps1 typecheck`.
5. If more detail is needed from an error, inspect the target file range only. Do not print the raw error line from `.tmp-typecheck.txt`.

### Hard Rule

Never use raw `tsc`, even with `Select-String`, because compiler lines can still be terminal-breaking single-line output.

If more detail is needed from a compiler error, use `terminal-safe.ps1 typecheck-filter` or inspect the target file range with `terminal-safe.ps1 read`.

## Why This Exists

Some generated or compiled files in this repo contain extremely long single lines, including inline source maps. A direct file dump can flood the terminal, destroy scrollback usefulness, and waste tokens. This workflow makes bounded output the default instead of relying on ad hoc caution.
