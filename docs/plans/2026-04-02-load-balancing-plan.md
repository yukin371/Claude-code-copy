# 多 API 均衡切换计划

日期：2026-04-02

## Status

- superseded on `2026-04-07`
- superseded by [ADR-2026-04-07-provider-routing-and-gateway-boundary.md](../decisions/ADR-2026-04-07-provider-routing-and-gateway-boundary.md)

## Superseded Reason

- 该计划最初假设应用内需要长期承接多 provider / 多 endpoint / 多 key 的均衡切换能力。
- 当前长期边界已调整为：应用内保留任务级 provider/model/api 路由，权重均衡、健康检查、熔断、key 池和聚合转发下沉到外部网关。
- 因此，本计划不再作为长期实施目标继续推进。

## 仍保留的历史价值

- 文档记录了过渡期兼容层为什么出现，以及当前代码里已有的 provider/endpoint 回退骨架。
- `providerBalancer` 等现有实现可以继续作为直连模式下的临时兼容层维护，但不应再扩张为应用核心调度系统。

## 不再继续推进的内容

- 应用内权重均衡
- 应用内健康检查平台化
- 应用内熔断/恢复策略平台化
- 应用内多 key 池治理

## 后续入口

- 长期边界：`docs/decisions/ADR-2026-04-07-provider-routing-and-gateway-boundary.md`
- 当前接入指南：`docs/analysis/neko-code-provider-integration-guide.md`
- 当前活动项：`docs/analysis/neko-code-roadmap.md`

## 目标

在现有 OpenAI-compatible 兼容层之上，增加多 provider / 多 endpoint / 多 key 的均衡切换能力。

## 当前基线

- `taskRoutes` 已能决定 route、provider、apiStyle、model、baseUrl。
- `providerMetadata.ts` 已集中维护 provider 默认 base URL 和 key 环境变量。
- `openaiCompatibleClient.ts` 已能按 provider 解析默认 endpoint 和 key。
- DeepSeek 这类 OpenAI-compatible provider 可直接纳入同一兼容层。
- provider 选择策略现支持 `fallback`、`round-robin`、`weighted` 三种模式。

## 范围

本阶段只做：

- provider / endpoint 的候选列表构建
- 健康状态记录
- 轮询或权重选择
- 失败后的自动切换
- 最小可观测性

暂不做：

- 跨 provider 的复杂成本优化
- 智能预测路由
- 大规模调度平台化

## 实施顺序

1. 抽 provider pool / endpoint pool 数据结构。
2. 记录每个 endpoint 的健康状态、最近失败原因、退避时间。
3. 实现简单轮询，先保证可切换。
4. 加入失败回退链和熔断。
5. 再补权重和优先级。

## 当前进度

- 已完成：provider 端点健康状态模块
- 已完成：OpenAI-compatible 请求按健康状态轮询
- 已完成：跨 provider 的 fallback 顺序
- 已完成：provider 级策略切换与权重选择骨架
- 已完成：`bun-tools health` / `bun-tools providers` 诊断入口

## 检查点

- `bun-tools providers` 能输出 provider 默认元数据。
- 单个 endpoint 失败后会切到下一个候选。
- 同一 provider 的多个 key / baseUrl 能轮换。
- 主 provider 失败后会切到兼容 provider 顺序。
- `NEKO_CODE_OPENAI_PROVIDER_STRATEGY` 可切换 provider 级策略。
- `NEKO_CODE_OPENAI_PROVIDER_WEIGHTS` 可覆盖 provider 权重。
- OpenAI-compatible 路径不影响 Anthropic 专用路径。

## 验收标准

- 同一 route 可在多个 endpoint 之间自动切换。
- 失败请求不会无限重试同一个 endpoint。
- 选择策略可通过文档和工具命令定位。
- 现有主路径行为不回归。

## 风险

- 过早引入复杂权重会增加调试成本。
- provider 兼容层与健康状态层必须分离，不能把健康逻辑散进调用点。
- Anthropic 专用能力仍需保留独立路径。
