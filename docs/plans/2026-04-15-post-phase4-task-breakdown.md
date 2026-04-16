日期：2026-04-15

# Phase 4 之后任务拆分

## Goal

- 把已经定义好的 Track C / D / E / F / G 拆成可执行 backlog。
- 明确依赖顺序，避免桌面版、记忆系统、多代理和 token 压缩同时开工后互相打架。
- 给后续实现提供可直接认领的任务卡，而不是继续停留在抽象设计层。

## Sequencing Rule

固定顺序：

1. 先完成 Phase 4 发布链路收口
2. 再推进 Track C 与 Track D
3. 在 Track D 稳定后推进 Track E
4. Track F 建立在 Track D/E 协议之上
5. Track G 作为长期 program，优先复用 D/E/F 已产出的结构

原因：

- Track C 先压平配置心智，避免后面多代理和桌面版继续建立在摇摆配置模型上。
- Track D 先修上下文焦点，否则记忆系统和多代理默认编排只会放大漂移。
- Track E 需要 Track D 的 focus frame 作为事实基底。
- Track F 不该先于 D/E 自定义 session / memory 语义。
- Track G 的真正收益依赖 artifact-first handoff、focused memory 和任务编排。

## Batch 0

### B0-01. Phase 4 收尾冻结点

- 目标：
  - 把发布链路保持在可验证状态，避免后续产品/架构改动打断分发主线。
  - 把 Phase 4 明确压缩成 3 个 blocking items，完成后立即退出当前阶段，不再继续泛化拖延。
- 触达模块：
  - `scripts/release-preflight.ts`
  - `.github/workflows/*release*`
  - `README.md`
  - `docs/analysis/neko-code-roadmap.md`
- 交付物：
  - Phase 4 当前 gate 绿色基线
  - 发布链路文档入口稳定
  - 一份明确的 Phase 4 blocker checklist：
    1. 真实 signed artifact
    2. 真实 GitHub Release / 正式发布源
    3. 真实升级 / 回滚验证
- 验收：
  - `bun run smoke:release-preflight`
  - `bun run typecheck`

## Batch 1

### B1-01. 模型 / provider 写路径审计与优先级矩阵

- 归属：
  - Track C
- 目标：
  - 明确当前所有模型与 provider 相关入口的读写路径和优先级。
- 触达模块：
  - `src/utils/settings/simplifiedModelConfig.ts`
  - `src/utils/model/modelRegistry.ts`
  - `src/utils/model/taskRouting.ts`
  - `src/utils/model/configuredModelRegistry.ts`
  - `src/utils/settings/types.ts`
- 交付物：
  - 当前配置入口矩阵
  - 冲突优先级表
  - 需要保留 / 需要降级为高级入口 / 需要废弃提示的入口清单
- 验收：
  - 文档化优先级矩阵
  - 不改变现有行为
- 进度更新（2026-04-15）：
  - 已完成首轮审计文档：
    - [2026-04-15-model-provider-routing-audit.md](./2026-04-15-model-provider-routing-audit.md)

### B1-02. Session override 语义固定

- 归属：
  - Track C
- 目标：
  - 把 `/model`、`/provider` 和 CLI/session override 的语义固定为 session-only。
- 触达模块：
  - `src/commands/provider/provider.tsx`
  - `src/bootstrap/state.ts`
  - `src/utils/model/model.ts`
  - `src/cli/print.ts`
- 交付物：
  - session override 生命周期说明
  - session override 与持久配置的边界实现
  - 更明确的提示文案
- 验收：
  - 退出 session 后 override 不污染配置文件
  - `status/doctor` 能显示 override 状态
- 进度更新（2026-04-15）：
  - 已完成最小修正：
    - `/provider` 现在会清理旧的 session keyRef override
    - `status/doctor` 摘要新增 session keyRef / main session model 可见性
  - 剩余建议：
    - 继续统一 `/doctor`、`status` 与 route snapshot 的解释链措辞

### B1-03. Focus drift 观测与复现实验基线

- 归属：
  - Track D
- 目标：
  - 在不改行为的前提下，先把“上下文乱跳”变成可观测问题。
- 触达模块：
  - `src/query.ts`
  - `src/cli/print.ts`
  - `src/utils/analyzeContext.ts`
  - `src/commands/context/context-noninteractive.ts`
  - `src/services/awaySummary.ts`
- 交付物：
  - prompt assembly 来源日志
  - focus drift replay fixture
  - 典型漂移场景样例
- 验收：
  - 新增 drift diagnostics
  - 至少有 2-3 类可复现 case
- 进度更新（2026-04-15）：
  - 已完成首轮只读插桩：
    - `query.ts` 在 `after_compact_boundary / after_tool_result_budget / after_snip / after_microcompact / after_context_collapse / before_model_call` 输出 context assembly 阶段快照日志
    - 新增 `src/utils/contextAssemblyDiagnostics.ts` 作为稳定格式化入口
  - 已补 3 组 replay fixtures：
    - `topic-switch-after-compact`
    - `resume-branch-mismatch`
    - `subagent-handoff-with-stale-main-context`
  - 已补轻量 replay harness：
    - `bun scripts/context-drift-replay.ts --list`
    - `bun scripts/context-drift-replay.ts <fixture-id>`
  - 已补最小用户可见 diagnostics：
    - `/context` 非交互输出显示 prompt assembly snapshots
    - `/doctor` 显示 drift replay fixture diagnostics 摘要
  - 已补 drift replay smoke：
    - `bun run smoke:context-drift-replay`
  - 当前仍缺：
    - 更贴近真实 query 的 replay harness（不仅是 fixture-level snapshot）

### B1-04. Focus frame 数据模型最小落地

- 归属：
  - Track D
- 目标：
  - 为主会话引入最小 focus frame，而不是继续只依赖 transcript 推断。
- 触达模块：
  - `src/bootstrap/state.ts`
  - `src/utils/sessionStorage.ts`
  - `src/query/stopHooks.ts`
  - `src/commands/clear/conversation.ts`
- 交付物：
  - focus frame schema
  - in-memory state
  - 最小持久化恢复链路
- 验收：
  - focus frame 可创建、更新、清理、恢复
  - 不破坏现有 session resume 基线

## Batch 2

### B2-01. Config UI / ConfigTool 默认写 `defaults.*`

- 归属：
  - Track C
- 目标：
  - 默认设置入口只写 route default model，不再把 transport 细节混进默认路径。
- 触达模块：
  - `src/tools/ConfigTool/*`
  - `src/components/agents/ModelSelector.tsx`
  - `src/components/agents/AgentsList.tsx`
  - `src/components/agents/AgentEditor.tsx`
- 交付物：
  - 默认模型编辑入口统一
  - 高级 transport 配置入口分离
- 验收：
  - UI 默认写 `defaults.*`
  - 旧入口不再误导用户直接写 `taskRoutes.*.model`

### B2-02. 路由诊断解释链统一

- 归属：
  - Track C
- 目标：
  - 给 `status/doctor/routes` 建立统一解释链。
- 触达模块：
  - `src/components/StatusLine.tsx`
  - `src/utils/doctorDiagnostic.ts`
  - `src/commands/context/context.tsx`
  - `src/utils/model/taskRouting.ts`
- 交付物：
  - route / querySource / model / resolved source / fallback / override 的统一诊断结构
- 验收：
  - `status/doctor` 输出一致
  - querySource 命中覆盖与 fallback reason 可见

### B2-03. Prompt assembly 分层与预算化

- 归属：
  - Track D
- 目标：
  - 把 prompt 上下文按层拆分，并为每层建立 budget。
- 触达模块：
  - `src/query.ts`
  - `src/services/tokenEstimation.ts`
  - `src/commands/context/context.tsx`
  - `src/commands/context/context-noninteractive.ts`
  - `src/utils/messages.ts`
- 交付物：
  - 上下文层预算规则
  - recent / memory / artifacts / tool results 的选择顺序
- 验收：
  - budget 生效时优先裁掉历史散文，不裁掉 focus frame
  - context diagnostics 可展示各层占比

### B2-04. Compact / Resume / Continue 对齐 focus frame

- 归属：
  - Track D
- 目标：
  - compact、resume、continue 共享同一套 focus 恢复语义。
- 触达模块：
  - `src/commands/compact/compact.ts`
  - `src/services/compact/*`
  - `src/utils/sessionStorage.ts`
  - `src/cli/print.ts`
- 交付物：
  - compact 后保留 focus frame
  - resume/continue 恢复 focus frame
- 验收：
  - `bun run smoke:session-resume`
  - `bun run smoke:session-continue:no-serena`
  - `bun run smoke:context-compact:no-serena`

### B2-05. 子代理 focus snapshot handoff

- 归属：
  - Track D
- 目标：
  - 子代理默认接收 focus snapshot，而不是完整 transcript。
- 触达模块：
  - `src/tools/AgentTool/AgentTool.tsx`
  - `src/utils/agentHandoff.ts`
  - `src/utils/attachments.ts`
  - `src/tasks/LocalAgentTask/LocalAgentTask.tsx`
- 交付物：
  - focus snapshot handoff payload
  - 子代理 prompt 注入规则
- 验收：
  - 新增 subagent focus snapshot smoke
  - 子代理与主代理对当前任务目标保持一致

## Batch 3

### B3-01. Memory tier schema 与权限模型

- 归属：
  - Track E
- 目标：
  - 建立 `session_scratchpad / task_memory / project_memory / user_preference_memory` 的最小 schema 和写权限。
- 触达模块：
  - `src/tools/AgentTool/agentMemory.js`
  - `src/bootstrap/state.ts`
  - `src/utils/sessionStorage.ts`
  - `src/components/agents/new-agent-creation/wizard-steps/MemoryStep.tsx`
- 交付物：
  - memory tier schema
  - 主代理写 / 子代理提案边界
- 验收：
  - 子代理默认没有长期记忆写权限
  - 主代理可写全部 tiers

### B3-02. Artifact schema 补齐与 store 最小实现

- 归属：
  - Track E
- 目标：
  - 把 task brief / memory candidate / handoff summary 纳入 artifact 协议。
- 触达模块：
  - `src/types/artifact.js`
  - `src/utils/agentHandoff.ts`
  - `src/utils/agentHandoff.test.ts`
- 交付物：
  - 新 artifact kinds
  - artifact versioning 规则
  - 最小 artifact store 约定
- 验收：
  - 结构化 handoff 不再只支持研究/设计/实现/review 四类 artifact

### B3-03. Task graph 与 orchestration metadata

- 归属：
  - Track E
- 目标：
  - 把主代理的任务拆解结果显式建模，而不是靠长对话隐式维护。
- 触达模块：
  - `src/tasks/*`
  - `src/state/AppStateStore.ts`
  - `src/bootstrap/state.ts`
  - `src/cli/print.ts`
- 交付物：
  - task node / status / artifact refs / owner role 结构
- 验收：
  - 主代理可根据 task graph 派发、收口和重派

### B3-04. 子代理自检 -> 主代理粗检流水线

- 归属：
  - Track E
- 目标：
  - 固定默认多代理流程，不再让主代理重复完整复查。
- 触达模块：
  - `src/tools/AgentTool/AgentTool.tsx`
  - `src/tools/AgentTool/agentToolUtils.ts`
  - `src/coordinator/coordinatorMode.ts`
  - `src/tasks/LocalAgentTask/LocalAgentTask.tsx`
- 交付物：
  - 子代理 self-check schema
  - 主代理 rough-check rule
- 验收：
  - 新增 self-check / rough-check smoke
  - 主代理对用户只输出统一结论

### B3-05. Mailbox / inbox / attachment 单路由收口

- 归属：
  - Track B + Track E
- 目标：
  - 为默认多代理工作流收口消息消费路径。
- 触达模块：
  - `src/hooks/useInboxPoller.ts`
  - `src/utils/attachments.ts`
  - `src/utils/teammateMailbox.js`
  - `src/context/mailbox.tsx`
- 交付物：
  - structured message 单一主消费入口
  - 旧 mailbox 兼容层
- 验收：
  - 不再出现 attachment / poller 双读双处理默认路径

## Batch 4

### B4-01. 桌面宿主技术 spike

- 归属：
  - Track F
- 目标：
  - 选定首版桌面宿主并打通最小启动链。
- 触达模块：
  - 新增桌面宿主工程目录
  - 复用 `src/main.tsx`
  - 复用 session server 相关入口
- 交付物：
  - 宿主选型结论
  - 本地启动 demo
- 验收：
  - 桌面端可拉起本地 session server 并创建 session

### B4-02. Workspace 文件注入与 artifact 化

- 归属：
  - Track F
- 目标：
  - 支持从桌面工作区把文件、diff、staged changes 提交给主代理。
- 触达模块：
  - `src/services/api/filesApi.ts`
  - `src/utils/attachments.ts`
  - artifact store 相关模块
- 交付物：
  - 文件选择/拖拽 -> artifact 流程
- 验收：
  - 主代理能消费桌面侧附加文件 artifact

### B4-03. 多 session / task board 基线

- 归属：
  - Track F
- 目标：
  - 在桌面端展示主代理、子代理和任务图谱，而不是一堆分散聊天窗口。
- 触达模块：
  - bridge / session server 对应状态流
  - task graph / artifact 元数据
- 交付物：
  - session board
  - task board
- 验收：
  - 可同时查看主代理与多个子代理的状态与产物引用

### B4-04. Memory pane 与审计视图

- 归属：
  - Track F
- 目标：
  - 可视化长期记忆、任务记忆与 memory candidate。
- 触达模块：
  - memory store
  - task graph
  - artifact metadata
- 交付物：
  - memory pane
  - memory candidate 审阅入口
- 验收：
  - 用户可看到哪些事实被主代理固化为长期记忆

## Batch 5

### B5-01. Token 成本分层诊断

- 归属：
  - Track G
- 目标：
  - 把 token 花费拆解到 focus / recent / memory / artifacts / tools 各层。
- 触达模块：
  - `src/services/tokenEstimation.ts`
  - `src/commands/context/context*.ts`
  - 状态/诊断相关模块
- 交付物：
  - token breakdown diagnostics
- 验收：
  - 可定位当前主要 token 浪费源

### B5-02. Artifact-first handoff 限流

- 归属：
  - Track G
- 目标：
  - 默认多代理 handoff 不再传大段 transcript。
- 触达模块：
  - `src/utils/agentHandoff.ts`
  - `src/tools/AgentTool/AgentTool.tsx`
  - `src/utils/attachments.ts`
- 交付物：
  - handoff budget 规则
  - transcript 直传降级策略
- 验收：
  - 多代理通信 token 成本显著下降

### B5-03. Memory injection budget

- 归属：
  - Track G
- 目标：
  - 控制长期记忆和任务记忆的注入预算。
- 触达模块：
  - memory retrieval 相关模块
  - prompt assembly 相关模块
- 交付物：
  - role-aware memory budget
- 验收：
  - 主代理与子代理的 memory 注入规模明显区分

### B5-04. Cache / reuse 策略

- 归属：
  - Track G
- 目标：
  - 复用稳定 artifact、系统提示与结构化摘要，避免重复总结。
- 触达模块：
  - token/cache/VCR 相关模块
  - prompt assembly 相关模块
- 交付物：
  - cache key 规则扩展
  - artifact summary reuse 策略
- 验收：
  - 重复任务/重复 handoff 的 prompt 体积下降

## Recommended First Execution Set

如果要从现在开始进入实现，推荐先做下面 6 个任务：

1. `B1-01` 模型/provider 写路径审计与优先级矩阵
2. `B1-02` session override 语义固定
3. `B1-03` focus drift 观测与复现实验基线
4. `B1-04` focus frame 数据模型最小落地
5. `B2-03` prompt assembly 分层与预算化
6. `B2-04` compact/resume/continue 对齐 focus frame

原因：

- 这 6 个任务能最快把“配置心智”和“上下文乱跳”两个根问题压住。
- 只要这一步没稳，默认多代理、桌面版和 token 压缩都会建立在不稳定地基上。

## Exit Criteria

- backlog 已覆盖 Track C / D / E / F / G 的核心实现路径。
- 每个 batch 都具备明确依赖、触达模块和验收口径。
- 后续可以直接按 batch 或 task id 开工，而不需要重新做一次抽象设计。
