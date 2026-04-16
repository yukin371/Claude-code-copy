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

## 阶段计划入口

- 阶段交付计划：
  - [2026-04-08-staged-delivery-plan.md](../plans/2026-04-08-staged-delivery-plan.md)
- native build blocker 分类：
  - [2026-04-08-native-build-blockers.md](../plans/2026-04-08-native-build-blockers.md)
- 当前工作区改动分组：
  - [2026-04-09-worktree-change-inventory.md](../plans/2026-04-09-worktree-change-inventory.md)
- 本轮收尾对齐记录：
  - [2026-04-10-release-preflight-signed-workflow-alignment.md](../plans/2026-04-10-release-preflight-signed-workflow-alignment.md)
- 多 agent 通信与模型分层计划：
  - [2026-04-12-multi-agent-communication-and-model-tiering-plan.md](../plans/2026-04-12-multi-agent-communication-and-model-tiering-plan.md)
- 模型与提供商配置进一步简化：
  - [2026-04-15-model-provider-simplification-plan.md](../plans/2026-04-15-model-provider-simplification-plan.md)
- 模型与 provider 路由审计：
  - [2026-04-15-model-provider-routing-audit.md](../plans/2026-04-15-model-provider-routing-audit.md)
- 上下文稳定与会话聚焦修复：
  - [2026-04-15-context-stability-and-session-focus-plan.md](../plans/2026-04-15-context-stability-and-session-focus-plan.md)
- 记忆系统与默认多代理编排：
  - [2026-04-15-memory-system-and-default-multi-agent-orchestration-plan.md](../plans/2026-04-15-memory-system-and-default-multi-agent-orchestration-plan.md)
- 桌面版开发计划：
  - [2026-04-15-desktop-app-development-plan.md](../plans/2026-04-15-desktop-app-development-plan.md)
- 长期 token 压缩计划：
  - [2026-04-15-token-compression-program.md](../plans/2026-04-15-token-compression-program.md)
- Phase 4 后续任务拆分：
  - [2026-04-15-post-phase4-task-breakdown.md](../plans/2026-04-15-post-phase4-task-breakdown.md)
- Windows 签名接入流程：
  - [2026-04-15-windows-signing-workflow.md](../plans/2026-04-15-windows-signing-workflow.md)
- unsigned GitHub 发布流程：
  - [2026-04-15-unsigned-github-release.md](../plans/2026-04-15-unsigned-github-release.md)
- 当前默认执行规则：
  - 以后默认按阶段计划推进
  - 只有当前 active phase 的 Exit Conditions 满足后，才切到下一阶段
  - 不属于当前阶段 in-scope 的事项，默认回收到 roadmap 或后续阶段，不临时插队

## 当前改动面说明

- 当前这轮已按阶段目标持续收敛；历史上较大的改动面主要来自此前多轮代理推进，不是用户手工修改。
- 这些历史改动并非单一功能线，而是同时覆盖：
  - Phase 3 状态型 smoke 与系统回归
  - Phase 4 本地分发、release staging、GitHub workflow
  - release-facing 文案、品牌清理、配置路径与 provider/router 收口
- 之前 roadmap 主要记录阶段目标、gate 与里程碑，没有同步记录“实际触达的文件簇”，因此会出现“文档看起来改动不多，但工作区改动面很大”的观感差异。
- 这类范围说明现已转移到：
  - [2026-04-09-worktree-change-inventory.md](../plans/2026-04-09-worktree-change-inventory.md)

## 当前版本目标

1. 多 API 与原 Anthropic API 并存，默认行为不冲突
2. 支持每个对话使用不同 provider / model / API 路由
3. 保持工具协议兼容，不单独改协议层
4. 明确“应用内路由 vs 外部网关”的边界，避免把运维型流量治理继续堆进应用
5. 持续保持文档、验证脚本和实现状态一致，避免“做到一半但文档已宣告完成”
6. 产出一个可直接从终端启动的本地可运行版本，而不要求用户手动执行 `bun src/entrypoints/cli.tsx`

## 当前执行阶段

- active phase：
  - Phase 4. native build 与本地分发版
- 本阶段要解决的问题：
  - 把已经提前打通的 native build / 本地安装 / release candidate 基线正式收口成固定发布前流程
  - 把签名、正式发布源、update workflow 与 release-facing 文案继续推进到可发布状态
- 当前阶段状态：
  - Phase 3 已完成并切出：
    - `bun run smoke:session-resume`
    - `bun run smoke:mcp-state`
    - `bun run smoke:phase3-system-regression`
    - `bun run smoke:migrated-config-system`
    - `bun run smoke:distribution-readiness`
    - 最后一轮补齐了 `.jsonl path` / `--resume-session-at` 与 MCP 多 scope / fallback 回归，剩余问题已不再是状态流主链能力缺失
  - Phase 2 已完成：
    - `bun run typecheck`
    - `bun run test:routing`
    - `bun run smoke:claude-config`
    - `powershell -ExecutionPolicy Bypass -File scripts/readonly-smoke.ps1 -Workflow routing`
    - `bun src/entrypoints/cli.tsx -p --max-turns 1 "Reply with exactly OK"`
    - `dist/neko-code.exe -p --max-turns 1 "Reply with exactly OK"`
  - Phase 4 已成为当前主线：
    - 本机 PATH 直启 `neko`
    - `dist/neko-code.exe` 脱离源码路径运行
    - 本地 unsigned beta 安装
    - local bundle / native installer / unsigned release candidate staging

## 当前进行中

### 1. Release Candidate 闭环

- 目标：把当前本地 build、bundle、installer、release candidate 产物组织成可重复执行的发布前闭环。
- 当前状态：
  - native build、local bundle、native installer、本地 PATH 安装、release candidate / deploy / GitHub Release staging 与 `smoke:release-preflight` 已经打通
  - GitHub Release 资产整理与 publish plan 已落地，本地候选发布物 gate 也已覆盖到 deploy publish / GitHub Release publish / native update
  - 当前主要缺口已经收敛到签名、正式发布源和真实外部发布动作
- 剩余收口：
  - 对接 signed artifact 与签名后的正式上传流程
  - 把外部发布环境中的凭据、签名和 promote 动作固定到 CI/workflow

### 2. Update / 发布源

- 目标：把 `neko update` 从本地 beta 体验推进到面向真实发布源的可验证流程。
- 当前状态：
  - update 相关提示、diagnostics 与本地 alias 建议已大体切到 `neko`
  - 本轮已把 native / package-manager 的版本探测源收敛到与 native installer 一致的 release source 解析，不再让 `doctor`、package-manager auto-updater 与 CLI `update` 各自看不同后端
  - 本地 deploy 源与 GitHub Release mock 下的 `neko update` 已不再只验证“看到新版本”，而是会真实注入下一版本并断言升级成功
  - 真实发布源、channel 切换与发布后验证仍未闭环
- 剩余收口：
  - 对接正式发布源
  - 补正式发布后的升级 / 回滚验证

### 3. Release-facing 文案与文档

- 目标：让 README、安装诊断、升级提示与 release-facing 文案持续跟上当前可用形态。
- 当前状态：
  - 大部分用户可见入口已切到 `Neko Code` / `neko`
  - 仍需随着 Phase 4 的 installer / update / release 流程继续同步
- 剩余收口：
  - 清理剩余旧路径兼容尾项
  - 保持 roadmap / staged plan / README 同步

### 4. 固定 Gate 维护

- 目标：把 `smoke:distribution-readiness`、`smoke:release-preflight` 等 gate 固定维持为绿色，而不是阶段性回看。
- 当前状态：
  - Phase 3 相关 gate 已经完成收口任务
  - Phase 4 额外拥有本地候选发布物 gate 作为对照验证
- 剩余收口：
  - 继续把签名、发布源和 installer 相关检查并入固定流程

## Phase 4 快速收尾口径

- 判断：
  - Phase 4 拖得过久，当前不再缺少“本地可运行 / 本地可安装 / 本地可发布候选”的基础能力。
  - 继续泛化扩展发布链路的价值已经很低；现在需要的是把剩余 blocking items 压成可关闭 checklist。
- 只保留 3 个 blocker：
  1. 真实签名产物接入 CI，并至少完成一次可复用的 signed artifact 产出。
  2. 真实 GitHub Release / 正式发布源上传闭环跑通一次，而不是只停留在 mock / staged source。
  3. 真实发布后完成一次升级验证和一次回滚验证，确认 `neko update` / `neko rollback` 不只在本地演练里成立。
- Exit criteria：
  1. `windows-sign-artifact.yml` 在真实 secrets / runner 下成功产出 signed exe。
  2. signed 或明确允许 unsigned 的正式 GitHub Release 成功发布一次，且发布源可被客户端真实消费。
  3. 在真实发布源上完成一次升级和一次回滚验证，并把结果同步到 roadmap / staged plan / README。
- 非 blocker：
  - 额外 smoke 扩展
  - 更细的 release-facing 文案打磨
  - 更完整的品牌残留清理
  - 未影响正式发布闭环的体验性优化
- 执行规则：
  - 在上述 3 个 blocker 清空前，不再把 Track C / D / E / F / G 的实现工作插入为主线。
  - 新增工作如果不能直接推动这 3 项退出条件，默认不进入当前阶段主线。

## 待完成

### P0

1. 把签名、GitHub Release 资产与正式发布源闭环
2. 把 `smoke:distribution-readiness`、`smoke:release-preflight` 固定维持为绿色 gate，并继续把签名/正式发布检查并进去
3. 继续清理 release-facing 旧路径兼容、安装/升级提示和少量品牌残留
4. 同步 roadmap / staged plan / README，让文档状态不再落后于本地 beta 实际能力
5. 把 `neko update` 面向真实发布源的稳定验证与发布流程整理清楚

### P1

1. 更完整的品牌文案清理与旧路径兼容收尾
2. 更上层的交互式配置入口
3. 外部网关接入示例、运维约束与观测文档补强
4. 多提供商 key 管理、模型能力声明、任务级模型策略与 quota 监控（见下：Track A）
5. 多 agent 通信降本、工件化 handoff 与模型分层协作（见下：Track B）

### P2（Phase 4 收口后的产品/架构主线）

1. 配置模型与提供商进一步简化，默认把“选模型”和“选 source/provider”拆开，继续压低设置心智负担（见下：Track C）
2. 修复“上下文乱跳 / 会话焦点漂移”，把上下文装配从“尽量多带历史”改成“围绕当前任务焦点做受控注入”（见下：Track D）
3. 记忆系统与多代理协作一起重构，形成“主代理长期记忆 + 默认派发子代理 + 工件化交接”的默认工作流（见下：Track E）
4. 基于 session server / bridge / 多 session 基线规划桌面版，重点解决文件交给 AI、多 AI session 并行与任务总览（见下：Track F）
5. 把 token 压缩作为跨阶段长期计划，覆盖 prompt 裁剪、工件化 handoff、记忆提取、模型分层与缓存策略（见下：Track G）

### Track A: 多提供商 Key / 模型策略 / 监控（面向“代理加快开发”）

- 目标：
  - 兼容 Claude(Anthropic) 与 OpenAI-compatible 两种 API 格式，不单独分叉协议层。
  - 用户可以配置 1 个或多个 key；每个 key 声明自己可用的模型集合与限制。
  - 用户可以按 route / querySource / 任务类型选择不同 provider + model + key，类似 “oh my opencode” 的任务级模型策略。
  - 引入 5 小时窗口（及可配置窗口）的使用监控，在接近限制前触发预警与“移交总结”，避免任务进行到一半被限额打断。
- 边界与约束：
  - 不把“运维型流量治理”（复杂限流、并发队列、组织级配额）继续堆进应用；外部网关仍是主方案（LiteLLM / Portkey / Helicone / Cloudflare AI Gateway 等）。
  - 应用内只做：key registry、能力声明、任务路由决策、best-effort 监控与用户提示。
  - key 不允许通过 `baseUrl/apiKey` 的逗号池在应用内做随机池化；显式 `baseUrl/apiKey` 仍代表 single-upstream pin。
- 设计入口：
  - 设计文档：`docs/analysis/neko-code-multi-provider-keys-and-monitoring.md`

#### M1. Key Registry 与路由挂钩（最小可用）

- 范围：
  - `settings.json` 新增 `providerKeys[]`，每个 key 具备：`id/provider/secretEnv/models/expiresAt/limits/context`（全部 optional, 向后兼容）。
  - `taskRoutes.<route>.keyRef` 支持引用 `providerKeys[].id`，解析到 route transport 的 `apiKey`，并保留非机密 `keyId` 用于监控。
  - keyRef 能力约束：过期、模型 deny、secret 缺失时，路由应 fail-fast 且错误可定位到 `route + keyRef`。
- 验收标准：
  - `bun run typecheck`
  - `bun run test:routing` 覆盖 keyRef 基础用例（ok / missing / expired / model-denied）。
  - `bun run smoke:readonly-routing` 在不配置 keyRef 时行为不变；配置 keyRef 时能在 debug snapshot 中标注 `apiKeySource=key-ref*`。
- 测试项：
  - 单测：`src/utils/model/taskRouting.test.ts`
  - 新增单测：`src/utils/model/providerKeyRegistry.test.ts`

#### M2. 任务级模型策略（按 querySource 精细路由）

- 范围：
  - 新增 `taskRouteRules[]`（可选）：按 `querySource`/prefix/route hint 进行覆盖式路由（只覆盖 rule 中声明的字段）。
  - 支持“同一主对话内不同子任务用不同模型”：例如 `web_search_tool`/`permission_explainer`/`session_memory`/`tool_use_summary_generation` 走不同 key+model。
  - 规则优先级明确且可诊断：env > route-env > route-settings > taskRouteRules > defaults。
- 验收标准：
  - `bun run test:routing` 新增覆盖：querySource rule override 的稳定性与可解释性。
  - `bun run smoke:readonly-routing` 增加 2-3 条样例 querySource 的断言（防止规则被静默忽略）。
- 测试项：
  - 单测：`src/utils/model/taskRouting.test.ts` 扩展 querySource case matrix
  - 只读 smoke：`scripts/readonly-smoke.ps1 -Workflow routing` 增加 keyRef/rule 断言

#### M3. Quota Monitor（5 小时窗口）与预警

- 范围：
  - per-key 计数：requests、tokens（input/output/cache）、cost(USD, best-effort)、estimated tokens（当上游缺 usage）。
  - 支持两类套餐：
    - 按次计费：`maxRequests`
    - 按 token 计费：`maxTotalTokens`/`maxInputTokens`/`maxOutputTokens`
    - 可选：`maxUsd`
  - 5 小时窗口默认值为 `18000s`，允许 key 自定义窗口（用于周/月限额或自建套餐）。
  - 新增诊断入口输出当前 key 使用快照（CLI/bun-tools），用于排障与 statusline 对接。
- 验收标准：
  - `bun run test:routing` 继续绿。
  - 新增单测：usage monitor 对窗口 rollover 的行为（时间模拟 + reset 逻辑）。
  - 新增诊断命令能在无 usage 数据时输出 estimated 字段（标注为估算）。
- 测试项：
  - 单测：`src/services/providerKeyUsageMonitor.test.ts`
  - 只读诊断：`bun run scripts/bun-tools.ts key-usage`

#### M4. 临界点“移交总结”（避免中断）与记忆对齐

- 范围：
  - 在接近限额阈值（例如 90%）时：
    - 触发通知（非阻塞）
    - 可选触发“移交总结”生成：输出结构化 handoff（目标/已完成/未完成/下一步/关键文件/关键命令/风险）
  - 当前状态：
    - 已落地：当 `providerKeys[].limits` 配置且使用率达到 80%/90% 时，在 REPL 输出 warning；90% 且 turn idle 时生成 handoff summary（`querySource=quota_handoff`）并附加为系统信息。
    - 已对齐：handoff summary 复用了 `session_memory` 内容作为更广的上下文输入，不引入新的“半记忆”体系。
  - 与记忆系统对齐：
    - handoff summary 的生成优先复用现有 `session_memory`/`compact` 基础设施，避免另起一套“半记忆”。
    - 不得破坏 `--continue` / `--resume` 的主链一致性（已有 resume/continue/compact harness 作为回归底座）。
- 验收标准：
  - 新增 smoke：模拟“接近限额”场景下能输出 handoff summary，并且不影响 session continue/resume 的基本链路。
  - `bun run smoke:phase3-system-regression` 与 `bun run smoke:distribution-readiness` 继续绿。
- 测试项：
  - 新增 smoke：`scripts/handoff-summary-smoke.ts`
  - 复用既有 harness：`scripts/session-continue-smoke.ts`、`scripts/session-resume-smoke.ts`

### Track B: 多 Agent 通信 / 工件化 Handoff / 模型分层协作

- 目标：
  - 把当前多 agent 协作从“长文本消息 + mailbox 轮询”收敛为“结构化事件 + 工件引用 + 明确状态机”的低成本通信链路。
  - 让便宜模型负责探索与压缩，贵模型负责设计与裁决，中档模型负责实施与复核，减少不必要的高价模型消耗。
  - 在交互模式、非交互模式、in-process teammate 与普通 subagent 下，统一关键协议消息的消费路径，避免重复读取、重复投递和已读竞争。
- 边界与约束：
  - 不在短期内一次性重写整个 swarm / teammate 体系，优先做兼容式渐进迁移。
  - 不把 provider 路由、组织级流量治理或复杂外部队列系统混入本 track。
  - 兼容现有 Agent / Task / teammate 基本语义，允许旧 mailbox / task-notification 作为过渡层存在。
- 计划入口：
  - 计划文档：`docs/plans/2026-04-12-multi-agent-communication-and-model-tiering-plan.md`

#### M1. 工件协议与 Handoff 契约

- 范围：
  - 定义 `research_brief`、`design_spec`、`implementation_report`、`review_report` 等工件 schema。
  - 定义 agent 间的 event envelope，只传 `task_id`、`artifact_ids`、`summary`、`requires_decision` 等小型控制面字段。
  - 默认 handoff 从“转发长文本消息”改为“落盘工件 + 传引用”。
- 验收标准：
  - exploration -> design -> implement -> review 四类交接都能使用统一工件协议表达。
  - 工件具备版本字段，可支持同任务多轮迭代。

#### M2. Structured Message 消费收敛

- 范围：
  - 收敛 `useInboxPoller` 与 attachment 双路径消费，建立单一 structured protocol message router。
  - 补齐非交互模式下 permission / mode set / shutdown / plan approval 等协议消息的可靠消费链路。
  - 避免“消息已标记为 read，但并未进入正确处理路径”。
- 验收标准：
  - 结构化协议消息不再依赖 UI 是否挂载才能完成流转。
  - 同一消息不会再被 attachment 与 poller 双读双处理。

#### M3. Mailbox / Event Store 降本

- 范围：
  - 替换整文件 JSON 数组重写式 mailbox。
  - 为 append、ack、replay 设计更稳定的持久化格式。
  - 降低 in-process teammate 的固定轮询成本，逐步引入事件唤醒或退避轮询。
- 验收标准：
  - 多 teammate 空闲场景下磁盘读取和 JSON parse 压力明显下降。
  - 通信量增长后不会继续放大每条消息的处理成本。

#### M4. 模型分层调度接入

- 范围：
  - 为 exploration / design / implementation / review 四类阶段配置默认模型层级。
  - 让 agent spawn / task dispatch / review pipeline 能按阶段自动选择更合适的模型层。
  - 支持用户覆盖默认层级策略。
- 验收标准：
  - 便宜模型优先承担探索与摘要，贵模型优先承担设计与裁决，中档模型优先承担实施与复核。
  - 默认策略可诊断、可覆盖、不会把昂贵模型浪费在低价值探索阶段。

### Track C: 模型 / Provider 配置进一步简化

- 目标：
  - 在已经落地的 `defaults.*`、model registry 与 route diagnostics 基础上，继续把用户侧配置收敛到“先选模型，再决定 source/provider 是否需要显式覆盖”。
  - 把当前仍残留的 `taskRoutes.*.model`、`providerKeys`、session override、Config UI 多入口心智差异继续压平。
  - 保持高级 transport override 能力，但把它从默认路径降到高级路径。
- 边界与约束：
  - 不回退已落地的 registry / source resolution 设计。
  - 不把外部网关职责重新拉回应用内。
  - 默认写路径继续优先写 `defaults.*` / model registry，而不是再扩散旧 `taskRoutes.*`。
- 设计入口：
  - 设计文档：`docs/plans/2026-04-15-model-provider-simplification-plan.md`

### Track D: 上下文稳定与会话聚焦

- 目标：
  - 解决旧版 Claude 也存在的“上下文乱跳 / 焦点漂移 / 不该带的上下文被带进来”问题。
  - 把当前 prompt 组装逻辑从“保守多带历史”逐步收敛到“围绕当前任务焦点、活动分支和必要记忆做有限注入”。
  - 让 compact / resume / continue / subagent handoff / away summary 共享同一套 task focus 语义。
- 边界与约束：
  - 不破坏已经收口的 Phase 3 resume / continue / compact 回归。
  - 不新增一套与 `session_memory` 平行、互相打架的伪记忆系统。
  - 先做 prompt assembly 与状态模型收口，再考虑更激进的自动自治。
- 设计入口：
  - 设计文档：`docs/plans/2026-04-15-context-stability-and-session-focus-plan.md`

### Track E: 记忆系统与默认多代理编排

- 目标：
  - 形成默认多代理工作流：主代理负责长期记忆、任务拆解、对人沟通与最终收口；子代理只拿最小规则和任务相关工件，完成后先自检，再由主代理粗检。
  - 把长期记忆、任务记忆、工件存储与多代理 handoff 合并成一套统一协议，避免“记忆”和“协作”各走一套上下文体系。
  - 让主代理默认成为 task orchestrator，而不是把所有上下文无差别复制给每个子代理。
- 边界与约束：
  - 保持与现有 Agent / teammate / task 基本语义兼容，允许渐进迁移。
  - 只有主代理默认拥有长期记忆写权限；子代理只可读取必要记忆并提交 memory candidate。
  - 与 Track D 协同推进，避免“焦点状态”和“记忆摘要”各自维护独立事实。
- 设计入口：
  - 设计文档：`docs/plans/2026-04-15-memory-system-and-default-multi-agent-orchestration-plan.md`

### Track F: 桌面版开发计划

- 目标：
  - 基于现有 session server / bridge / multi-session 能力，规划面向桌面的工作台，而不是再造一套完全独立的 agent core。
  - 优先解决三个桌面版核心问题：文件交给 AI、多个 AI session 并行、主代理/子代理协作结果可视化。
  - 让桌面版成为主代理 orchestration、记忆浏览与多 session 管理的更强交互层。
- 边界与约束：
  - 桌面版不应先于 Track D / E 独立定义一套 session/memory 语义。
  - 优先复用 CLI core、session server、bridge 协议与 artifact store。
  - 首版以单机本地桌面工作流为主，不先做云同步/团队协作。
- 设计入口：
  - 设计文档：`docs/plans/2026-04-15-desktop-app-development-plan.md`

### Track G: 长期 Token 压缩计划

- 目标：
  - 把 token 成本下降从“某一个 compact 功能”提升为跨阶段工程目标。
  - 从 prompt assembly、记忆提取、工件化 handoff、模型分层、缓存与桌面 session 可视化几个层面系统性降本。
  - 让系统默认优先传递结构化 artifact / focus state / targeted memory，而不是重复回放大段 transcript。
- 边界与约束：
  - 这不是一次性 feature，而是长期 program。
  - 不以牺牲 resume / continue 正确性为代价换取压缩率。
  - 不让“压缩”反过来制造新的上下文漂移。
- 设计入口：
  - 设计文档：`docs/plans/2026-04-15-token-compression-program.md`

## 最近已验证推进

- 已验证：`bun run typecheck`
- 已验证：简化 `providers/models/defaults` 配置现已能解析出 `resolved source`，并在 task route diagnostics / status / doctor 中显示最终命中的 source
- 已验证：设置面板中的主路由入口已开始对齐到 `defaults.main + taskRoutes.main overrides`，默认模型不再继续写回旧的 `taskRoutes.main.model`
- 已验证：`ConfigTool` 已支持把 `defaults.main` 作为项目级设置项暴露，并按 setting source 正确写入 local settings
- 已验证：`ConfigTool` 现已扩到 `defaults.subagent/frontend/review/explore/plan/guide/statusline`，整套路由默认模型都可通过项目级设置入口直接编辑
- 已验证：task route diagnostics 现已区分模型来自 `defaults.*` 还是显式 `taskRoutes.*.model` 覆盖，`status/doctor` 不再把两者混成同一来源
- 已验证：设置面板已新增 `subagent/frontend/review/explore/plan/guide/statusline` 的默认模型入口，并复用统一 ModelPicker 写回对应 `defaults.*`
- 已验证：agent 创建/编辑/列表展示现已改为围绕 `subagent route default` 展示未显式设置模型的语义，不再把“未设置”直接等同成“inherit from parent”
- 已验证：agent/coordinator/ConfigTool 相关提示与设置文案现已开始统一到 `defaults.main` / `subagent route default` 心智，减少“默认=inherit”与“默认=taskRoutes.*.model”的混用表述
- 已验证：`/model` picker、ConfigTool model section、CLI `--fallback-model` help 与相关 tips 已继续收口到 `main model` / route default 语义，进一步降低“default model”旧表述残留
- 已验证：状态页 task route matrix / hints 现已同时展示 `model source` 与 `resolved source`，可直接观察默认模型来源和最终命中的上游
- 已验证：非 `main` 路由的 task route matrix / hints 现已追加紧凑 `config=` 来源摘要，可直接看到 `defaults.*`、`taskRoutes.*`、env / key-ref 等具体配置入口
- 已验证：状态页现已为非 `main` route 单独输出逐字段 `Task route config matrix`，query-source hints 也会标出是否命中 `taskRouteRules` override
- 已验证：doctor route snapshot 现已扩到全 route，不再只输出 `main` 的一条路由诊断
- 已验证：已补 `status.tsx` / `Doctor.tsx` 展示层回归，覆盖 route config matrix、全 route doctor diagnostics、主路由摘要 masking，以及 legacy / exceptional source 场景
- 已验证：`Doctor` 页面已开始直接消费多 route summary，不再只显示单条 `Main route`
- 已验证：`status/doctor` 现已把 route config source 翻译为具体配置入口（如 `defaults.main`、`taskRoutes.main.provider`、对应 env 名），不再只暴露抽象 source 枚举
- 已落地：roadmap 新增 Track A（多提供商 key/模型策略/监控/临界移交总结），并新增对应设计文档入口
- 已落地：roadmap 新增 Track B（多 agent 通信 / 工件化 handoff / 模型分层协作），并新增对应计划文档入口
- 已验证：多 provider / route helper 回归已覆盖 `direct-provider` 与 `gateway` 两种模式
- 已验证：任务路由回归已覆盖 `querySource -> route` 的 review / frontend hint 映射
- 已验证：新增 `src/services/providerKeyUsageHandoffLogic.test.ts`，覆盖 quota 使用率计算（requests/tokens/cost 取最大、估算 token 合并、窗口 reset 时间输出）。
- 已验证：状态页已可查看非 `main` 任务路由矩阵
- 已验证：只读 smoke 矩阵已更新到 22 条用例
- 已验证：plugin refresh 隔离 smoke 已收口
- 已验证：LSP refresh 隔离 smoke 已收口，并修补了重复 scope 回归
- 已验证：session resume 隔离 harness 已收口，并修补了 direct resume metadata 漏传
- 已验证：`scripts/session-resume-smoke.ts` 现已纳入 `smoke:phase3-system-regression`，补齐 stored session、missing session 与 user-tail sentinel 三类 resume 基础变体
- 已验证：`scripts/session-resume-smoke.ts` 已补齐 compact 后 resume 的大 transcript 变体，锁定 compact boundary + summary + preserved tail 的恢复链、pre-boundary metadata 回读与 stale usage 清零
- 已验证：`scripts/session-resume-smoke.ts` 已补齐 `.jsonl path` 与 `--resume-session-at` 变体，锁定 transcript path 恢复、assistant-only truncation 与错误提示分支
- 已验证：新增 `scripts/session-resume-worktree-smoke.ts`，在隔离 transcript 中注入 `worktree-state` 记录并确认 `loadConversationForResume()` 返回相同 `worktreeSession` 信息与 null 退出态
- 已验证：新增 `scripts/session-continue-smoke.ts`，可在隔离配置目录中真实执行 `-p --continue` 并断言 transcript 继续追加而非新建会话
- 已验证：`scripts/session-continue-smoke.ts` 已补齐 compact 后 continue 的大 transcript 变体，锁定 seeded compact boundary transcript 在 `-p --continue` 下仍会追加到原 session，而不是重新建链或丢失 post-compact 对话
- 已验证：`scripts/session-continue-smoke.ts` 已切到本地 `openai-compatible` mock server，`FIRST` / `SECOND` / `COMPACT` 断言不再依赖外部 provider 配额或网络抖动
- 已验证：`bun run smoke:session-continue:no-serena` 已通过，测试时可配合 `NEKO_CODE_DISABLED_MCP_SERVERS=serena` 避免无关 MCP server 干扰
- 已验证：新增 `scripts/plugin-cli-state-smoke.ts`，可在隔离配置目录中真实执行 `plugin marketplace add/remove`、`plugin install/uninstall`、`plugin enable/disable`，并在 `refreshActivePlugins()` 后断言命令能力随状态切换
- 已验证：`bun run smoke:plugin-cli-state:no-serena` 已通过，测试时可继续配合 `NEKO_CODE_DISABLED_MCP_SERVERS=serena` 避免无关 MCP server 干扰
- 已验证：`scripts/plugin-refresh-smoke.ts`、`scripts/lsp-refresh-smoke.ts` 与 `scripts/mcp-strict-config-smoke.ts` 现已纳入 `smoke:phase3-system-regression`，补齐 inline plugin refresh、LSP manager refresh 与 strict MCP config 三类隔离状态变体
- 已验证：`scripts/plugin-state-smoke.ts` 已改为真实 stateful refresh 序列，锁定 disable/reenable 过程中 commands/agents/hooks 与 reconnect state 的同步收敛，不再用每轮重置的默认 app state 掩盖 stale cleanup 问题
- 已验证：MCP strict-config 隔离 harness 已收口
- 已验证：修补了 `--print` headless 入口未等待 `runHeadless(...)` 的收口问题，避免非交互执行链提前退出
- 已验证：源码模式下补齐 `MACRO` bootstrap 与关键热路径兜底，`--print` / headless 主链已不再因 `MACRO is not defined` 在启动阶段中断
- 已验证：修补 OpenAI-compatible client 的流式 `.withResponse()` 兼容层，避免任务路由走外部 OpenAI-compatible 代理时在真实 API 请求前崩溃
- 已验证：真实 `bun src/entrypoints/cli.tsx -p ...` 已可在迁移后的真实配置回放中返回 `OK`，当前基础 `--print` 主链已恢复
- 已验证：补了本地验证 launcher，并已编译出 `dist/neko-code-local.exe`
- 已验证：`dist/neko-code-local.exe` 已通过 `--version`、`--help` 与单轮 `-p` 回放验证
- 已验证：新增 `bun run install:local-launcher` Windows 安装脚本，可把本地 launcher 编译到指定目录
- 已验证：安装脚本产出的 `neko.exe` 已在临时安装目录通过 `--version`、`--help` 与单轮 `-p` 回放验证
- 已验证：真实用户目录 `C:\Users\yukin\.local\bin\neko.exe` 已安装完成，且新 shell 中可直接执行 `neko --version`、`neko --help`
- 已验证：PATH 上的 `neko -p --max-turns 1 "Reply with exactly OK"` 已返回 `OK`
- 已落地：native build blocker 已整理为分类清单与分批顺序，见 [2026-04-08-native-build-blockers.md](../plans/2026-04-08-native-build-blockers.md)
- 已验证：补齐 compile-safe 缺失模块与依赖基线后，`bun run build:native` 已成功生成 `dist/neko-code.exe`
- 已验证：编译产物 `dist/neko-code.exe --version`、`dist/neko-code.exe --help` 正常
- 已验证：`bun run scripts/bun-tools.ts routes` 现已输出可读 route matrix 与 querySource example matrix，便于继续做 provider/router 阶段回归
- 已验证：route diagnostics / smoke 已补 representative helper `querySource` 覆盖，当前已显式核对 `session_search` 与 `permission_explainer` 在 direct-provider / gateway 两种模式下都沿用 `main` 路由
- 已验证：带 `querySource` 的 token estimation 现已对 Anthropic helper 路由做 route-aware 选择，不再一律固定走 `main`；对 OpenAI-compatible helper 路由暂保守回落到 `main`
- 已验证：MCP 大结果截断链路现已透传调用侧 `querySource`，避免 `chrome_mcp` 等 helper 路径进入 token estimation 时丢失来源
- 已验证：ToolSearch auto-threshold 计算现已在 `query` / `compact` / context analysis 等路径透传 `querySource`
- 已验证：新增 `scripts/context-compact-smoke.ts`，构造 compact boundary 前后的消息并借助 `getMessagesAfterCompactBoundary()` 验证 post-boundary 视图真正裁掉旧消息、compact summary 保持可见，stub collapse 不改变 helper 输出
- 已验证：`bun run smoke:context-compact:no-serena`
- 已验证：新增 `scripts/phase3-system-regression-smoke.ts`，顺序调用 continue/resume/plugin/LSP/MCP/context smoke，照会执行结果并输出 PASS/FAIL 汇总
- 已验证：新增 `scripts/migrated-config-system-smoke.ts`，顺序调用 `smoke:claude-config:no-serena`、`smoke:mcp-state`、`smoke:plugin-install`、`smoke:plugin-state` 与 `smoke:phase3-system-regression`，形成一轮“复制现有 Claude 配置后跑常见工作流”的系统回归入口
- 已验证：`scripts/mcp-state-smoke.ts` 已扩到 user/project/local 多 scope 写路径、同名 server fallback 与父/子 `.mcp.json` 优先级回落，锁定 persisted config 不携带 scope metadata
- 已验证：`scripts/plugin-state-smoke.ts` 现已纳入 `smoke:migrated-config-system`，补齐 migrated config 下 plugin enable/disable 与 runtime capability 切换回归
- 已验证：`bun run smoke:migrated-config-system`
- 已验证：SDK `get_context_usage` / 非交互 context analysis 路径现已显式透传 `sdk` querySource
- 已验证：Doctor 的 MCP context warning 诊断路径现已使用显式内部 source（`doctor_context_warning`）
- 已验证：ToolSearch deferred-tools token 计数缓存现已纳入 model / route 维度，避免不同路由下错误复用同一组工具名的旧结果
- 已验证：token-count VCR fixture key 现已纳入 `model` / `route` 维度，避免不同 helper 路由在测试/录制环境里误复用同一份 token 计数缓存
- 已验证：通用 API VCR fixture key 现已纳入 `systemPrompt` / `model` / `querySource` 上下文，避免主查询与 helper 查询在不同任务路由下误复用同一份旧响应
- 已验证：route diagnostics / status matrix 已补 `mcp_datetime_parse`、`generate_session_title`、`tool_use_summary_generation` 等 queryHaiku/queryWithModel helper source 样本
- 已验证：routing smoke 现已额外断言 `mcp_datetime_parse` 在 `single-upstream gateway` 模式下继续沿用主路由
- 已验证：`powershell -ExecutionPolicy Bypass -File scripts/readonly-smoke.ps1 -Workflow routing` 现已覆盖并断言 `direct-provider` 与 `single-upstream gateway` 两种模式
- 已验证：`bun run smoke:claude-config` 现已在迁移后的隔离配置目录内覆盖并断言 `direct-provider` 与 `single-upstream gateway` 两种模式
- 已验证：本轮 Phase 2 收尾时再次通过 `bun run typecheck`、`bun run test:routing`、`bun run smoke:claude-config`
- 已验证：本轮 Phase 4 native build 再跑 `bun run build:native`，`dist/neko-code.exe --version`、`dist/neko-code.exe --help` 均正常返回
- 已验证：`dist/neko-code.exe -p --max-turns 1 "echo native smoke"` 会在运行到 `Error: Reached max turns (1)` 时退出（且 `bun src/entrypoints/cli.tsx -p --max-turns 1 "echo source smoke"` 得到相同错误），所以当前失败属于通用 `max-turns` 行为而非编译产物回归
- 已验证：新增 `scripts/native-distribution-smoke.ts`，将 `dist/neko-code.exe` 复制到完全脱离仓库路径的临时目录，依次执行 `--version`、`--help`、`-p --max-turns 1`，并将 `-p` 输出与源码模式对照，证明编译产物在分发环境下可独立运行
- 已验证：新增 `scripts/native-local-install-smoke.ts`，模拟在临时目录 installer/bin 下把 `neko` 添加到 PATH，依次运行 `neko --version`、`neko --help`、`neko -p --max-turns 1 "Reply with exactly OK"`；现在要求安装版与源码版都 `exit 0` 且输出 `OK`，不再接受“同样失败也算一致”的弱校验
- 已验证：`scripts/native-distribution-smoke.ts` 与 `scripts/native-local-install-smoke.ts` 已切到本地 `openai-compatible` mock server，`smoke:distribution-readiness` 不再受外部 provider quota / timeout 干扰
- 已修复安装脚本 `scripts/install-local-launcher.ps1`，将本地安装产物主命令 `neko.exe` 直接复制自 `dist/neko-code.exe` 并把 launcher 编译为 `neko-launcher.exe`，让 `neko --version` / `--help` 在任何 PATH 中都走原生产物；`scripts/native-local-install-smoke.ts` 现在安装目录内通过 `Reply with exactly OK` 的 `-p --max-turns 1` 断言安装版与源码版的 exit/output 完全一致
- 已明确：`install-local-launcher` 只把 `dist/neko-code.exe` 复制成 `~/.local/bin/neko.exe`（主命令），`neko-launcher.exe` 只是兼容层，PATH 只需包含目录即可运行；流程仍依赖本地构建二进制，未升级到正式 unsigned installer
- 已验证：新增 `scripts/distribution-readiness-smoke.ts`，顺序调用 no-serena help 命令、`smoke:migrated-config-system`、`smoke:native-distribution:no-serena` 与 `smoke:native-local-install:no-serena`，形成一条覆盖“帮助入口 + 真实迁移配置 + 本地分发/PATH workflow”的聚合 gate
- 已验证：`bun run smoke:distribution-readiness`
- 已修复：`src/cli/update.ts` 与 `src/utils/doctorDiagnostic.ts` 的用户可见提示不再继续把 `claude doctor` / `claude install` / `~/.local/bin/claude` 当作当前主入口；native 诊断与升级提示现已对齐 `neko`
- 已验证：新增 `scripts/release-facing-diagnostics-smoke.ts` 并纳入 `smoke:distribution-readiness`，在受控环境里覆盖 `update` 的 native/global 失败提示分支，并真实触发 `doctorDiagnostic` 的 npm-local alias 提示，锁定 `neko doctor` / `neko install` / `alias neko="~/.neko-code/local/claude"` 等 release-facing 文案
- 已验证：native / package-manager 相关版本探测现已统一走 native installer 的 source selection；`doctor`、package-manager auto-updater 与 CLI `update` 的 package-manager 分支不再继续硬编码查 GCS 或 npm
- 已验证：新增 `scripts/build-local-release-bundle.ts`，可生成 `dist/release-local/`，写入 `latest` / `stable` channel 文件、`manifest.json` 与当前平台产物，形成可供 native installer 消费的本地 bundle 格式
- 已验证：新增 `scripts/native-installer-local-bundle-smoke.ts`，通过 `NEKO_CODE_NATIVE_INSTALLER_BASE_URL` 把 native installer 指向本地临时 HTTP 源，并在隔离 `HOME` / `XDG_*` / `NEKO_CODE_CONFIG_DIR` 下真实执行下载、安装与帮助入口验证
- 已验证：`bun run smoke:native-installer-local-bundle`
- 已验证：新增 `scripts/stage-release-candidate.ts`，可生成 `dist/release-candidate/<version>/`，收口 unsigned 可上传产物、bundle、安装脚本、metadata 与 `SHA256SUMS.txt`
- 已落地：新增 `.github/workflows/release-candidate.yml`，在 `windows-latest` 上执行 `typecheck`、`smoke:release-preflight`、`stage-release-candidate`，并上传 unsigned release candidate artifact
- 已验证：新增 `scripts/release-preflight.ts`，顺序执行 `bun run build:native`、`bun run smoke:distribution-readiness`，再校验 `dist/neko-code.exe`、`scripts/install-local-launcher.ps1` 主命令和 README / 关键 release-facing 文本一致性，形成“本地候选发布物 gate”
- 已验证：`bun run smoke:release-preflight`
- 已验证：新增 `scripts/release-deploy-publish.ts` 与 `bun run release:deploy-publish -- --target-root <path>`，把 `dist/release-deploy/<version>/payload/` 按 `upload-manifest.json` 真正发布到本地镜像根目录；`release-deploy-publish` 相关 smoke 已改为调用真实脚本而非手写复制
- 已收口：`scripts/release-deploy-publish.ts` 现已对 source / destination 做根目录边界校验，不再允许篡改 `upload-manifest.json` 后越过 deploy payload 或 publish target 根目录
- 已验证：`scripts/release-deploy-publish-smoke.ts` 现会逐项比对 `upload-manifest.json` 的 source/destination 内容；`scripts/native-update-cli-release-deploy-smoke.ts` 与 `scripts/native-update-cli-github-release-smoke.ts` 现会注入合成的 `0.1.1` 发布物，真实断言 `neko update` 完成升级而不是只看到 “No newer update”
- 已验证：新增 `scripts/publish-github-release.ts` 与 `scripts/publish-github-release-smoke.ts`，GitHub Release 创建/更新命令已统一收口到脚本与 workflow，不再在 workflow 里手写拼接发布命令
- 已收口：`scripts/promote-github-release.ts` 已从 `gh release edit` 切到显式 `gh api PATCH`，直接更新 `draft` / `prerelease` / `make_latest`，避免 promote 继续依赖 CLI flag 的隐式行为
- 已验证：`scripts/promote-github-release-smoke.ts` 现已覆盖 `draft` / `prerelease` / `stable` 三种 promote target 与手工布尔参数组合；`smoke:release-preflight` 也已纳入 promote smoke
- 已验证：`scripts/signed-release-publication-workflow-smoke.ts` 现已支持跳过重复 build/candidate staging，并已纳入 `smoke:release-preflight`，可在本地候选发布物 gate 中模拟“外部 unsigned artifact + 外部 signed exe 回灌”的 signed publication/deploy 交接链
- 已验证：新增 `scripts/sign-release-candidate-smoke.ps1` 与 `bun run smoke:sign-release-candidate`，可在本地生成临时代码签名证书与 PFX，调用 `scripts/sign-release-candidate.ps1` 并验证 `signed/` 产物的 Authenticode 签名有效，用于预验证签名脚本 / manifest / 输出链路
- 已验证：新增 `scripts/native-rollback-cli-github-release-smoke.ts`，会用当前 `dist/neko-code.exe` 组装本地 GitHub Release 资产，真实执行 `neko rollback --list` 与默认回滚，并断言安装版从当前版本切回上一发布版本
- 已落地：补齐 `scripts/analyze-text-hygiene.ts`、`scripts/check-text-hygiene.ts` 与共享规则库，避免 `package.json` 中的文本卫生入口继续悬空
- 已收口：bridge / auth 路径里的旧 `claude` 命令提示，并把 Remote Control / auth status 的旧入口指导纳入文本卫生规则，避免 bridge 尾路径回退到错误命令
- 已收口：`Doctor` dismiss 提示、通知标题、permission/hooks/trust dialog/memory/worktree/plugin/session-start UI 路径提示、`/insights` 命令描述、REPL 默认标题/挂起提示、keybindings schema 与 SDK settings source 描述等用户可见文案已改为 `Neko Code` / `.neko-code` 路径，不再继续直露 `Claude Code` / `.claude`
- 已验证：`bun run analyze:text-hygiene`
- 已验证：`bun run check:text-hygiene`
- 已验证：本轮再次通过 `bun run smoke:distribution-readiness` 与 `bun run smoke:release-preflight`
- 已验证：本轮再次通过 `bun run typecheck`

更多已确认完成项见归档文档，不再在主 roadmap 中重复展开。

## 发布渠道余留任务

- 当前已经具备：
  - `bun run build:native` 生成 `dist/neko-code.exe`
  - 本地 PATH 安装与 `neko` 直启
  - 本地 unsigned beta 安装包
  - local bundle / native installer / unsigned release candidate / release preflight
- 但把这些 artifact 包装成真正的 release 仍需：
  - 独立打包 + 多平台签名
  - GitHub Release / 发布源上传与消费闭环
  - 明确发布说明与 upgrade workflow，让用户在新机器上直接下载运行
- 当前还新增了一层本地候选发布物 gate：
  - `bun run smoke:release-preflight`
  - 当前它已经把“构建 + 分发 smoke + 本地 release bundle 驱动的 installer 下载/安装 + unsigned/signed release candidate staging + signed artifact 回灌 workflow 模拟 + GitHub Release publish/promote + 安装脚本主入口 + README / 关键 release-facing 文本一致性”收成单条固定检查
  - 该 gate 通过不代表 signing / 正式发布源 / 真实 auto-update 已完成，只代表本地候选产物没有明显回退
- 所以现在的状态不是“只能源码内演示”，而是“本地 beta 可体验、正式发布链路未完成”。

## 下一步

### 当前阶段下一步

1. 先完成真实签名产物接入，并确认 `windows-sign-artifact.yml` 在真实环境可复用
2. 再完成一次真实 GitHub Release / 正式发布源上传闭环，不再只依赖 mock / staged source
3. 基于真实发布源补一次升级验证和一次回滚验证，作为 Phase 4 关闭前必过项
4. 维持 `smoke:distribution-readiness` 与 `smoke:release-preflight` 为绿色，但不再把新增 smoke 当成主线产出
5. 仅同步与上述 3 项 blocker 直接相关的 README / roadmap / staged plan 文档

### 下一阶段入口

1. 当前已进入 Phase 4，下一步聚焦签名、正式发布源与 update workflow
2. Phase 4 收口后，优先切入 Track C + Track D：先压平模型/provider 配置心智，再修上下文焦点漂移
3. Track E 与 Track F 作为下一组主线：先把“主代理长期记忆 + 默认多代理”定型，再把桌面版作为可视化工作台承接
4. Track G 持续并行，但默认依附于 Track D / E / F 的实现演进逐步落地
5. 后续新增完成项时，直接迁入归档而不是继续膨胀主 roadmap
