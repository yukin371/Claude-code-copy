# Neko Code Roadmap: Confirmed Completed Snapshot (2026-04-07)

这份文档只记录截至 `2026-04-07` 已确认完成且经过验证的事项。  
未完成、未验证或仍在变动中的内容，不进入本归档。

## 归档范围

- 主 roadmap 已切换为“只跟踪活动项”
- 本文档承接此前已收口、已验证、适合长期保留的完成项
- 后续如再归档，新增新的日期快照，不回写旧快照

## 已确认完成

### Phase 1: 品牌与隔离

- 默认品牌切换为 `Neko Code`
- 默认配置目录、临时目录、tmux socket 与 Claude Code 隔离
- 保守的 Claude 配置自动迁移已建立
- analytics 默认关停，sink 改为 no-op

### 可运行性基线

- Bun 工程依赖基线已补齐
- 源码模式 CLI 基础命令已恢复可运行
- `bun run typecheck` 在当前工作区状态下可通过

### 已验证 smoke / harness

- 只读 smoke 矩阵
  - 文档：[2026-04-07-readonly-smoke-matrix.md](../../plans/2026-04-07-readonly-smoke-matrix.md)
  - 当前用例数：`22`
- Plugin refresh
  - 脚本：`scripts/plugin-refresh-smoke.ts`
  - 文档：[2026-04-07-isolated-plugin-refresh-smoke.md](../../plans/2026-04-07-isolated-plugin-refresh-smoke.md)
- LSP refresh
  - 脚本：`scripts/lsp-refresh-smoke.ts`
  - 文档：[2026-04-07-isolated-lsp-refresh-smoke.md](../../plans/2026-04-07-isolated-lsp-refresh-smoke.md)
  - 已修补真实回归：plugin LSP server 名称重复 scope
- Session harness
  - 脚本：`scripts/session-resume-smoke.ts`
  - 文档：[2026-04-07-session-resume-smoke.md](../../plans/2026-04-07-session-resume-smoke.md)
  - 已修补真实回归：direct session-id resume metadata 漏传
- MCP strict-config
  - 脚本：`scripts/mcp-strict-config-smoke.ts`
  - 文档：[2026-04-07-mcp-strict-config-smoke.md](../../plans/2026-04-07-mcp-strict-config-smoke.md)
  - 已验证：
    - `--bare --init-only --strict-mcp-config --mcp-config <valid-file>` 稳定退出 `0`
    - 非法 `--mcp-config` 稳定退出 `1` 并输出 `Invalid MCP configuration`
    - strict 最终语义只保留显式 dynamic config，本地 `.mcp.json` 不参与最终 server 集

## 本次归档时仍未进入完成态的事项

- provider/router 主链路剩余收口
- 原“fallback / 负载均衡 / 熔断的完整最小可用版本”后续已被重定义为“外部网关集成与最小应用内安全回退边界”，不再作为应用内独立里程碑推进

## 归档准入规则

只有满足以下条件的事项才能进入类似归档：

1. 实现已落地
2. 验证已执行
3. 文档已同步
4. 不再处于“做到一半”状态
5. 没有依赖未修复的 blocker
