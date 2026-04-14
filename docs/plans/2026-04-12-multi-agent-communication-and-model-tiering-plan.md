# 多 Agent 通信与模型分层协作计划

日期：2026-04-12

## Goal

- 把当前多 agent 通信从“长文本对话 + mailbox 轮询”收敛为“结构化事件 + 工件引用 + 明确状态机”的低成本协作链路。
- 让不同价位/能力的模型按阶段分工：便宜模型负责探索与压缩，贵模型负责设计与裁决，中档模型负责实施与复核。
- 在不破坏现有 agent / teammate / task 语义的前提下，显著降低代理间通信 token 消耗、轮询 IO 和重复消费风险。

## Scope

- in:
  - 设计统一的多 agent 控制面协议：任务、状态、handoff、review、决策请求
  - 设计工件面协议：research brief、design spec、implementation report、review report
  - 明确模型分层策略与默认分工
  - 规划从现有 mailbox / inbox / task-notification 向新协议的渐进迁移路径
  - 约束交互模式、非交互模式、in-process teammate、普通 subagent 四种场景下的行为
- out:
  - 不在本计划中直接重写所有 swarm / mailbox 实现
  - 不一次性引入复杂分布式消息系统或外部队列依赖
  - 不把“组织级流量治理”或“provider 统一调度”混入本计划

## Constraints

- 必须保持现有 Agent / Task / teammate 基本语义兼容，不能因为协议升级破坏已有命令工作流。
- 通信优化优先减少上下文体积和重复消费，而不是先追求最复杂的自治协作。
- 新协议必须支持降级运行：即使新工件流未完全启用，旧 task-notification / mailbox 仍可作为兼容路径存在。
- 结构化消息和工件必须可落盘、可恢复、可审计，不能只存在内存中。
- 非交互模式不能依赖仅在 UI 挂载时才存在的 poller 才能完成关键协议流转。

## Current State

- 当前多 agent 通信主要由三类路径组成：
  - background/sync subagent 的 task-notification 队列
  - teammate 文件邮箱（mailbox）
  - attachment / inbox poller 双路径消费
- 已识别的核心问题：
  - mailbox 为整文件 JSON 数组，读写与已读标记成本随消息累积线性增长
  - in-process teammate 固定轮询 mailbox，空闲期仍持续产生 IO / parse 成本
  - `useInboxPoller` 与 attachment 注入并存，存在重复读取、重复去重、已读竞争
  - 结构化协议消息在 UI 不可用或非交互模式下存在丢失 / 积压风险
  - 代理之间目前更接近“传文本”，而不是“传工件引用”

## Design

### 1. 通信分层

- 控制面：
  - 只发送小型结构化事件
  - 典型字段：`task_id`、`event_type`、`from`、`to`、`artifact_ids`、`summary`、`requires_decision`
- 内容面：
  - 默认不发送长文本上下文
  - 所有探索、设计、实施、审查结果落为工件
  - 代理之间只传工件引用和极短摘要

### 2. 工件驱动协作

- 统一工件类型：
  - `research_brief`
  - `design_spec`
  - `implementation_report`
  - `review_report`
  - `decision_record`
- 每类工件都使用固定 schema，限制冗余散文式输出
- 后续代理只读取自己需要的工件，不回放完整对话与完整推理链

### 3. 模型分层策略

- 便宜模型：
  - 代码探索
  - 引用收集
  - 日志/测试归纳
  - research brief 压缩
- 贵模型：
  - 架构设计
  - 边界裁决
  - 高不确定度问题决策
  - review 冲突仲裁
- 中档模型：
  - 按 spec 实施
  - 补测试
  - 局部重构
  - 第一轮 review / 修复闭环

### 4. 目标状态机

- 推荐的默认流水线：
  1. Scout 产出 `research_brief`
  2. Architect 读取 brief，产出 `design_spec`
  3. Worker 读取 spec，产出代码与 `implementation_report`
  4. Reviewer 读取 diff + spec + report，产出 `review_report`
  5. 若有阻塞，再由 Architect 或主代理做最终裁决
- 同一阶段禁止跨层重复读取全量上下文
- 所有 handoff 默认只允许“摘要 + artifact_id”，不允许直接转发大段消息正文

### 5. 渐进迁移策略

- Stage 1：
  - 保留旧 mailbox / task-notification
  - 新增工件 schema 与事件 envelope
  - 先让 agent 内部 handoff 支持“写工件、传引用”
- Stage 2：
  - 收敛 `useInboxPoller` 与 attachment 双路径
  - 让 structured protocol message 统一经一个 router 消费
- Stage 3：
  - mailbox 从整文件 JSON 数组迁到更适合 append/read 的格式
  - 降低固定轮询频率，改为事件唤醒或退避轮询
- Stage 4：
  - 将模型分层策略真正接入 agent spawn / task dispatch / review pipeline

## Milestones

### M1. 工件协议与 Handoff 契约

- 范围：
  - 定义 artifact schema 与 event envelope
  - 增加最小 artifact store（落盘即可）
  - 约束 agent handoff 默认输出为 `summary + artifact_ids`
- 验收标准：
  - 至少能表达 exploration -> design -> implement -> review 四类交接
  - 同一任务多次 handoff 能通过 artifact version 区分

### M2. Inbox / Attachment 消费收敛

- 范围：
  - 统一 structured protocol message 的单一消费入口
  - 消除 `useInboxPoller` 与 attachment 双路径竞争
  - 非交互模式补齐 structured message 消费兜底
- 验收标准：
  - 权限请求、mode set、shutdown、plan approval 不再依赖 UI poller 才能可靠流转
  - 不再出现“消息被标记已读但未进入正确处理链路”的默认路径

### M3. Mailbox / Event Store 降本

- 范围：
  - 替换整文件 JSON 数组重写
  - 提供更适合 append / ack / replay 的持久化格式
  - 降低空闲轮询开销
- 验收标准：
  - 常见多 teammate 空闲场景下的磁盘读写次数明显下降
  - 消息累积后不会继续放大每次交互成本

### M4. 模型分层调度接入

- 范围：
  - 让 agent 类型或任务类型声明推荐模型层级
  - 支持 exploration / design / implementation / review 四阶段默认模型策略
  - 支持用户覆盖默认策略
- 验收标准：
  - 便宜模型不再被默认用于高成本设计任务
  - 贵模型不再被默认消耗在批量探索和低价值摘要任务上

## Validation

- 文档验证：
  - roadmap 中新增 Track B，且链接到本计划
  - 后续相关 ADR / MODULE / README 更新时能引用本计划
- 实现期建议验证：
  - `bun run typecheck`
  - `bun run test:routing`
  - 新增 swarm / mailbox / protocol tests
  - 新增非交互 structured-message smoke
  - 新增 artifact handoff smoke

## Exit Conditions

- 已建立并接入一套统一的 event + artifact handoff 契约
- 结构化协议消息只存在一个主消费路径，非交互模式也可闭环
- mailbox / event persistence 不再依赖整文件 JSON 数组高频重写
- agent 默认模型分层策略可配置、可覆盖、可诊断
- roadmap、相关设计文档和实现状态保持同步
