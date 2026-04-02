# 多 API 均衡切换计划

日期：2026-04-02

## 目标

在现有 OpenAI-compatible 兼容层之上，增加多 provider / 多 endpoint / 多 key 的均衡切换能力。

## 当前基线

- `taskRoutes` 已能决定 route、provider、apiStyle、model、baseUrl。
- `providerMetadata.ts` 已集中维护 provider 默认 base URL 和 key 环境变量。
- `openaiCompatibleClient.ts` 已能按 provider 解析默认 endpoint 和 key。
- DeepSeek 这类 OpenAI-compatible provider 可直接纳入同一兼容层。

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
- 已完成：`bun-tools health` / `bun-tools providers` 诊断入口

## 检查点

- `bun-tools providers` 能输出 provider 默认元数据。
- 单个 endpoint 失败后会切到下一个候选。
- 同一 provider 的多个 key / baseUrl 能轮换。
- 主 provider 失败后会切到兼容 provider 顺序。
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
