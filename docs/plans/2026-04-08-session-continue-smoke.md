# 2026-04-08 Session Continue Smoke

## Goal

- 把 `-p --continue` 从“只在 roadmap 里列为后续项”推进到一个可重复执行的真实隔离 smoke。
- 覆盖 headless/print 主链里最常见的状态型继续场景，而不是只验证 help 或纯函数级 transcript 恢复。

## Harness

- Script: `bun run scripts/session-continue-smoke.ts`
- Package scripts:
  - `bun run smoke:session-continue`
  - `bun run smoke:session-continue:no-serena`
- Isolation:
  - temporary `workspace`
  - temporary `NEKO_CODE_CONFIG_DIR`
  - temporary `CLAUDE_CODE_PLUGIN_CACHE_DIR`
  - `CLAUDE_CODE_SIMPLE=1`
  - optional `NEKO_CODE_DISABLED_MCP_SERVERS=serena`

## Covered flow

1. 在隔离工作目录中执行首轮 `-p --max-turns 1`
2. 断言首轮输出命中预期文本
3. 找到生成的 transcript，并记录当前行数
4. 在同一工作目录执行 `-p --continue --max-turns 1`
5. 断言继续后的输出命中预期文本
6. 断言仍只有同一个 transcript，且行数继续增长

## Why this matters

- 它直接覆盖了 `print.ts -> loadInitialMessages() -> loadConversationForResume()` 这条真实 headless 继续链路。
- 它能发现“继续时意外新建会话”这类纯 help / 只读命令无法暴露的问题。
- 配合 `--disable-serena`，可以在本地 smoke 时避免无关 MCP server 干扰。
