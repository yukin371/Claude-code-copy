# ADR

## Title

- 应用内只保留任务级 provider/model 路由，负载均衡与熔断下沉到外部网关

## Status

- accepted

## Context

- Neko Code 需要支持多 provider、多模型与按任务路由。
- 同时，另一个应用也希望复用 provider 聚合与转发能力。
- 如果把 key 池、权重均衡、健康检查、熔断和聚合转发都长期做在 Neko Code 应用内部，会形成应用级调度系统，与其他应用重复建设，并持续推高维护成本。
- 当前代码里已经存在 `providerBalancer` 一类兼容层逻辑，但它更适合作为过渡期或直连模式下的兜底，而不是长期的 canonical owner。

## Decision

- 应用内保留以下职责：
  - 任务级 `provider` / `model` / `apiStyle` / `baseUrl` 路由
  - 统一请求归一化与传输适配
  - 对 Anthropic 专用路径与 OpenAI-compatible 路径做协议层兼容
  - 仅在必要时提供最小、安全、显式的本地 fallback
- 外部网关承接以下职责：
  - key 池与配额治理
  - 多 endpoint 轮换
  - 权重均衡
  - 健康检查
  - 熔断与恢复
  - 重试退避
  - 聚合转发与跨应用共享观测
- 以后如需新增“更聪明的流量治理”能力，默认先扩外部网关，不默认扩应用内 router/balancer。
- 现有应用内 balancer 相关实现只作为兼容层维护，不再作为核心 roadmap 目标继续平台化扩张。

## Consequences

- 正面影响
  - 降低 Neko Code 应用内部的复杂度与职责漂移。
  - 让多应用复用同一套 provider 治理策略成为可能。
  - 任务路由与运维调度边界更清晰，后续文档和实现更容易收口。
- 负面影响
  - 需要额外维护一个外部网关或聚合代理，部署复杂度会上升。
  - 直连 provider 模式下，应用仍需保留少量兜底逻辑，短期内会存在双轨状态。
- 需要同步的边界或文档
  - `docs/analysis/neko-code-provider-integration-guide.md`
  - `docs/analysis/neko-code-roadmap.md`
  - `docs/plans/2026-04-02-load-balancing-plan.md`
  - `docs/analysis/multi-api-provider-compatibility-dev-notes.md`
  - `src/utils/model/MOULD.md`

## Alternatives Considered

- 方案 A:
  - 继续把权重均衡、健康检查、熔断和 key 池都做在应用内。
  - 未采用原因：会把 Neko Code 推向通用调度层，且与其他应用重复建设。
- 方案 B:
  - 完全不保留任何应用内 fallback。
  - 未采用原因：直连 provider 或能力不匹配场景下仍需要最小安全兜底，立即清空会增加回归风险。
