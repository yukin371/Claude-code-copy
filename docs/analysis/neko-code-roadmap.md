# Neko Code Roadmap

这份 roadmap 只追踪当前仍在推进和待完成的事项。  
已确认完成且经过验证的内容，转移到归档文档，避免主 roadmap 继续堆积为历史流水账。

## 使用规则

- 主文档只保留：
  - 当前版本目标
  - 进行中事项
  - 待完成事项
  - 最近经过验证的推进
  - 下一步
- 只有“已验证且已收口”的事项才能进入完成归档
- 未完成、未验证、或仍可能回滚的事项继续留在主 roadmap
- 后续新增归档时，使用按日期切分的快照文件

## 归档入口

- 已确认完成归档：
  - [neko-code-roadmap-confirmed-completed-2026-04-07.md](./archive/neko-code-roadmap-confirmed-completed-2026-04-07.md)

## 当前版本目标

1. 多 API 与原 Anthropic API 并存，默认行为不冲突
2. 支持每个对话使用不同 provider / model / API 路由
3. 保持工具协议兼容，不单独改协议层
4. 明确“应用内路由 vs 外部网关”的边界，避免把运维型流量治理继续堆进应用
5. 持续保持文档、验证脚本和实现状态一致，避免“做到一半但文档已宣告完成”

## 当前进行中

### 1. 统一 provider / router 抽象

- 目标：把主线程、subagent、前端修改、审查等任务路由到统一 provider/router 层
- 当前状态：
  - task route execution target 骨架已接入
  - 主查询路径已通过 route transport 接入 openai-compatible shim
  - `sideQuery` 与 token estimation 等主辅助链路已接入 route-aware client
- 剩余收口：
  - 辅助路径与策略层继续补齐
  - 降低不同 provider 下行为漂移

### 2. 任务级模型与 API 路由闭环

- 目标：主线程 / subagent / review / frontend 等任务可按配置选择不同 provider/model/apiStyle/baseUrl
- 当前状态：
  - 路由配置已可从 `settings.json` 读取
  - 运行时已接入任务提示词解析，用于前端 / 审查类任务自动切换模型
- 剩余收口：
  - 继续补齐非主查询路径
  - 确保配置可见性和回归验证足够稳定

### 3. 外部网关集成边界与最小应用内回退

- 目标：应用内只保留任务级 provider/model/api 路由与最小安全回退，权重均衡、健康检查、熔断、key 池与聚合转发由外部网关承接
- 当前状态：
  - endpoint/provider 回退代码已存在，可作为过渡期兼容层
  - 已确认长期方向：外部网关承担负载均衡与故障转移的主职责
- 剩余收口：
  - 把长期边界同步到指南、计划和模块文档
  - 明确哪些本地 fallback 仍然保留为安全兜底
  - 补充“直连 provider”与“接外部网关”两种模式的回归验证

## 待完成

### P0

1. 完成 provider/router 主链路收口
2. 完成任务级模型/API 路由闭环
3. 完成外部网关集成边界收口，并限制应用内 fallback 只保留最小安全能力

### P1

1. 更完整的品牌文案清理与旧路径兼容收尾
2. 更上层的交互式配置入口
3. 外部网关接入示例、运维约束与观测文档补强

## 最近已验证推进

- 已验证：`bun run typecheck`
- 已验证：多 provider / route helper 回归已覆盖 `direct-provider` 与 `gateway` 两种模式
- 已验证：任务路由回归已覆盖 `querySource -> route` 的 review / frontend hint 映射
- 已验证：状态页已可查看非 `main` 任务路由矩阵
- 已验证：只读 smoke 矩阵已更新到 22 条用例
- 已验证：plugin refresh 隔离 smoke 已收口
- 已验证：LSP refresh 隔离 smoke 已收口，并修补了重复 scope 回归
- 已验证：session resume 隔离 harness 已收口，并修补了 direct resume metadata 漏传
- 已验证：MCP strict-config 隔离 harness 已收口
- 已验证：修补了 `--print` headless 入口未等待 `runHeadless(...)` 的收口问题，避免非交互执行链提前退出
- 已验证：本轮入口收口后再次通过 `bun run typecheck`、`bun run smoke:claude-config`、`bun run test:routing`

更多已确认完成项见归档文档，不再在主 roadmap 中重复展开。

## 下一步

1. 继续推进 provider/router 与最小应用内回退的剩余收口
2. 补一条真实 `--print` / headless session smoke，验证非交互主执行链产物而不只验证配置与状态
3. 为任务级模型/API 路由与外部网关接入模式补更系统的回归验证
4. 后续新增完成项时，直接迁入归档而不是继续膨胀主 roadmap
