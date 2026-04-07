# Neko Code Roadmap

这份 roadmap 记录 Neko Code 从 Claude Code 基线演进到独立、多模型、多 API 平台的开发方向。多 API 接入的具体原则见 [Neko Code Provider Integration Guide](./neko-code-provider-integration-guide.md)。

## 当前进度

- 已完成：品牌默认值切换为 `Neko Code`
- 已完成：默认配置目录、临时目录、tmux socket 与 Claude Code 隔离
- 已完成：保守的 Claude 配置自动迁移，首次启动可从 `~/.claude` 导入核心配置到 `~/.neko-code`
- 已完成：analytics 默认关停，sink 改为 no-op
- 已完成：任务路由支持从 `settings.json` 读取 route 级 provider / apiStyle / model / baseUrl
- 已完成：query 路径按 route transport 显式切换到 openai-compatible shim
- 已完成：模型路由模块级开发说明已建立
- 已完成：Bun 工程依赖基线已补齐，可直接运行源码模式 CLI 帮助命令
- 进行中：统一 provider/router 抽象（已加入 task route execution target 骨架）
- 进行中：按任务路由不同模型（主线程 / subagent / 前端 / 审查可由配置驱动）
- 进行中：OpenAI-compatible 接入（主查询路径已通过 route transport 接入 shim）
- 进行中：按任务路由不同 API（辅助路径与策略层仍在补齐）
- 进行中：fallback / 负载均衡 / 熔断（endpoint/provider 回退已接入）

## V1 优先级

### P0: 首个可用版本必须完成

1. 多 API 与原 Anthropic API 并存，默认行为不冲突
2. 工具调用能力保持继承原版，不单独改协议层
3. 真正关闭遥测与 1P 事件上报
4. 支持每个对话使用不同 provider / model
5. 完成品牌重命名与配置目录最小可用迁移

### P1: V1 后继续补强

1. provider 级权重均衡、熔断和健康检查观测
2. 更完整的品牌文案清理与旧路径兼容收尾
3. 仓库级长文本 / inline sourcemap 清理
4. 更上层的交互式配置入口

## Phase 1: 品牌与隔离

- 将产品默认品牌切换为 Neko Code
- 将配置目录、临时目录、socket 命名和 Claude Code 隔离
- 自动迁移 Claude 旧配置目录中的核心用户配置到 Neko Code 新目录
- 迁移范围仅限全局配置、用户 settings、credentials、用户 `CLAUDE.md` 和 `rules/`
- 清理残留的 Claude Code 默认文案
- 保留旧环境变量作为兼容兜底

## Phase 2: Provider 抽象

- 建立统一 provider/router 层
- 支持 Anthropic、OpenAI-compatible 和现有第三方 provider
- 统一模型请求、响应、错误和重试策略
- 为 provider 加健康检查和自动切换
- 具体接入原则与边界见 `neko-code-provider-integration-guide.md`
- 具体模块改动约束见 `src/utils/model/MOULD.md`

## Phase 3: 任务级模型路由

- 主线程使用主模型
- subagent 使用独立模型池
- review / verification 使用更强模型
- 前端修改任务使用专门模型
- built-in agent 支持显式映射
- 运行时已接入任务提示词解析，用于前端 / 审查类任务自动切换模型
- 路由模型名由配置文件提供，不再在源码里硬编码具体型号

## Phase 4: 负载均衡与容错

- 多 API key / 多 endpoint / 多 model 之间做轮询或权重分配
- provider 或 endpoint 失败时自动切换
- 对限流、超时、模型不可用做熔断与回退
- 路由策略保持可配置、可观测

## Phase 5: 隐私收敛

- 默认关闭非必要遥测
- 移除或降级会暴露路径、内容和行为的埋点
- 将剩余统计改为显式开关
- 保证默认配置是最少采集

## V1 交付顺序

1. 先关停遥测与 1P 上报，确保默认不再上传数据
2. 再确认多 API 与原 Anthropic API 并存链路，补兼容回归
3. 再打通每会话 provider / model 配置入口与状态可见性
4. 再完成品牌名称、CLI 文案、配置目录的最小运行时收口
5. 最后补齐均衡策略、熔断、可观测性和专项验证

## 2026-04-03 可运行性补充状态

- 已验证：`bun src/entrypoints/cli.tsx --version`
- 已验证：`bun src/entrypoints/cli.tsx --help`
- 已验证：`bun src/entrypoints/cli.tsx --provider gemini --help`
- 已验证：`bun src/entrypoints/cli.tsx --model sonnet --provider gemini --help`
- 已补：根 `package.json` / `bun.lock` / `node_modules`
- 已补：开发期依赖 `typescript`、`@types/bun`、`@types/react`、`@types/qrcode`
- 已补：根 `tsconfig.json`，使 Bun/TSX 工程可被 TypeScript 正常解析
- 已补：SDK 占位类型导出与运行时全局声明，降低源码模式维护成本
- 已补：`src/entrypoints/sdk/controlTypes.ts` 与 `src/entrypoints/sdk/coreTypes.generated.ts` 的占位协议类型已按现有调用面收紧，`print` / CCR / control request 不再被大面积 `unknown` 污染
- 已补：`contextCollapse`、`reactiveCompact`、`TungstenTool`、`attributionHooks` 等缺失入口的占位模块，降低高频 `TS2307`
- 已补：`bridgeMessaging` 首轮类型修正，清掉错误头部中的权限模式导入与 request id 问题
- 已补：`src/cli/print.ts`、`src/cli/transports/ccrClient.ts`、`src/commands/branch/branch.ts` 的一轮类型收口，`typecheck` 错误头已推进到命令层的 `bridge/chrome/clear` 等文件
- 已补：`src/commands/bridge/bridge.tsx`、`chrome/chrome.tsx`、`clear/conversation.ts`、`effort/fast/model/mcp/session`、plugin 命令与设置页的局部类型收口，`typecheck` 头部已从命令层推进到组件层
- 已补：`insights`、`remote-setup`、`rename/generateSessionName`、`resume`、`reviewRemote`、`terminalSetup`、`thinkback`、`ultraplan` 与 `components/agents/*` 的一轮边界类型收口，命令层头部错误已基本清空
- 已验证：命令层收口后 `bun src/entrypoints/cli.tsx --help` 仍可运行，说明当前修补未破坏 CLI 基础可用性
- 已验证：继续推进到组件层后 `bun src/entrypoints/cli.tsx --help` 仍可运行
- 当前剩余阻塞：全仓 `typecheck` 仍未通过，但主阻塞已进一步收敛到组件层的 `AutoUpdater`、`ConfigurableShortcutHint`、`Feedback`、`ThemeProvider`、`diff/*` 与部分 `FeedbackSurvey` 文件；根因以组件 props 类型缺失、环境字面量比较、局部缺失模块导出和 `MessageContent` 联合类型收口为主

## 2026-04-05 持续推进补充

- `typecheck` 头部已从 agent / file tools / send-message / skill / web-search / attachments-auth 等高频链路继续前移到 `computerUse`、`conversationRecovery` 和若干未精确归位的同名文件。
- 已继续收窄终端风险：`src/tools/AgentTool/UI.tsx` 中的 inline sourcemap 超长单行已移除，至少该热点文件不再把终端窗口撑爆。
- 当前更接近“核心功能链条恢复可用”，但距离“全仓 typecheck 基本干净”仍有明显长尾。

## 2026-04-07 可用性推进补充

- 已恢复源码模式 CLI 基础可用性：
  - `bun src/entrypoints/cli.tsx --help`
  - `bun src/entrypoints/cli.tsx --version`
  - `bun src/entrypoints/cli.tsx --provider gemini --help`
- 已将多处“启动即崩”的硬依赖改为可回退路径：
  - `claude-in-chrome` 相关入口不再因缺少 `@ant/claude-for-chrome-mcp` 在模块加载阶段直接崩溃
  - `verify` bundled skill 在快照缺失 markdown 资源时退化为内置占位内容
  - `StructuredDiff` 改为使用仓库内 TypeScript 版 color diff 兼容层，避免 `color-diff-napi` 导出形态导致源码模式启动失败
  - `settings.ts` 已补 `getRelativeSettingsFilePathForSource` re-export，避免启动期命名导出缺失
- `typecheck` 头部已继续前移，当前主阻塞不再是启动路径和大块 `computerUse` / `conversationRecovery` 聚类，而是更收敛的工具链与消息处理细节。

## 2026-04-07 并行推进补充

- 已补：`src/utils/computerUse/drainRunLoop.ts`、`src/utils/computerUse/escHotkey.ts` 的 Swift API 守卫，`_drainMainRunLoop` / `hotkey.*` 不再直接污染头部 `typecheck`。
- 已补：`src/types/hooks.ts` 的 hook schema 兼容断言调整，移除一处过严的 SDK/Zod 等价约束。
- 已补：`src/tools/FileWriteTool/UI.tsx`、`src/tools/MCPTool/UI.tsx`、`src/tools/PowerShellTool/pathValidation.ts`、`src/tools/ToolSearchTool/prompt.ts` 的一轮类型收口，工具层当前头部继续后移。
- 已补：`src/tools/SkillTool/UI.tsx`、`src/tools/TaskStopTool/UI.tsx`、`src/utils/context.ts`、`src/utils/computerUse/executor.ts`、`src/utils/cronScheduler.ts` 的当前头部错误。
- 已补：`src/utils/deepLink/protocolHandler.ts`、`src/utils/effort.ts`、`src/utils/envUtils.ts`、`src/utils/dxt/helpers.ts`、`src/utils/filePersistence/*` 的一轮缺件/导入/类型收口。
- 已补：`src/utils/execFileNoThrowPortable.ts`、`src/utils/generators.ts`、`src/utils/handlePromptSubmit.ts`、`src/utils/imagePaste.ts`、`src/utils/log.ts`、`src/utils/mcpInstructionsDelta.ts` 与 `src/types/external-modules.d.ts` 的当前头部错误。
- 已验证：上述文件簇的定向静默 `typecheck` 已清空。
- 已验证：`bun src/entrypoints/cli.tsx --version` 与 `bun src/entrypoints/cli.tsx --help` 仍可运行，说明本轮类型修补未破坏 CLI 基础启动。
- 当前静默头部已推进到：
  - `src/utils/forkedAgent.ts`
  - `src/utils/messages/mappers.ts`
  - `src/utils/messages/systemInit.ts`
  - `src/utils/model/agent.ts`
  - `src/utils/model/bedrock.ts`
  - `src/utils/model/model.ts`
- 当前 top files 仍集中在：
  - `src/utils/plugins/pluginInstallationHelpers.ts`
  - `src/utils/teleport.tsx`
  - `src/utils/forkedAgent.ts`
  - `src/utils/messages/mappers.ts`
  - `src/utils/processSlashCommand.tsx`
  - `src/utils/gitBundle.ts`
  - `src/utils/sideQuestion.ts`
  - `src/utils/tokens.ts`
  - `src/utils/model/bedrock.ts`
  - `src/utils/processUserInput.ts`
- 现阶段判断不变：项目仍处于“CLI 可运行、类型基线持续恢复中”，但核心高频阻塞已经继续前推，适合按文件簇并行收口而不是回到依赖基线层反复打转。

## 2026-04-07 文件簇收口补充

- 已补：`src/utils/conversationRecovery.ts` 的一整组恢复链路类型问题，包含 legacy attachment 迁移处的过宽强转、`permissionMode`/UUID/数组迭代收窄，以及 `udsClient` 动态导入缺失时的可降级处理。
- 已补：`src/utils/telemetry/sessionTracing.ts` 的 hook tracing 占位导出，补齐 `startHookSpan` / `endHookSpan` / `isBetaTracingEnabled` 等调用面需要的符号。
- 已补：`src/entrypoints/agentSdkTypes.ts` 的 hook 输入/输出类型导出，改为基于 `coreSchemas` 的精确推导，避免 `hooks.ts` 判别联合退化成大面积 `unknown`。
- 已补：`src/utils/hooks.ts` 中剩余的局部收窄问题，包含 `PermissionRequest`、HTTP hook JSON 分支和 `StopFailure` 输入构造。
- 已补：`src/utils/groupToolUses.ts` 的 `NormalizedAssistantMessage` 误用、`tool_result` type predicate 不合法和非 renderable 消息混入输出问题。
- 已验证：对以下文件执行定向过滤后，`bun run typecheck` 输出为空：
  - `src/utils/conversationRecovery.ts`
  - `src/utils/hooks.ts`
  - `src/utils/telemetry/sessionTracing.ts`
  - `src/entrypoints/agentSdkTypes.ts`
  - `src/utils/groupToolUses.ts`
- 这意味着此前路线文档中列出的 `conversationRecovery` / `hooks` / `groupToolUses` 这批热点已被推进出当前定向关注集；下一轮更适合优先复核旧 top files 中尚未处理完的 `messages`、`sessionStorage`、`queryHelpers`、`teammateMailbox`、`stats`。

## 2026-04-07 无阻长线

- 当前选择的无阻长线是“消息类型收口链”，目标是把 `messages` 作为源头、`sessionStorage` 作为会话持久化层、`queryHelpers` / `teammateMailbox` / `stats` 作为下游消费层，按一条连续数据流推进。
- 这条线的特点是：
  - 都是本地类型收窄与兼容修补，不依赖外部接口确认
  - 写集可以自然拆开，适合并行代理推进
  - 修完后会同时压缩多个 top files 的 `unknown` / `MessageContent` / UUID 模板字符串噪声
- 当前分工：
  - 源头簇：`src/utils/messages.ts`
  - 持久化簇：`src/utils/sessionStorage.ts`
  - 下游消费簇：`src/utils/queryHelpers.ts`、`src/utils/teammateMailbox.ts`、`src/utils/stats.ts`
- 跟踪方式：
  - 先由代理分别收口各簇
  - 主线程只做 review、冲突检查和定向 `typecheck` 验证
  - 每轮完成后只更新这条长线的状态，不回退到零散热点模式
- 当前进展：
  - `src/utils/sessionStorage.ts`、`src/utils/queryHelpers.ts`、`src/utils/teammateMailbox.ts`、`src/utils/stats.ts` 的定向过滤 `typecheck` 已清空
  - `src/utils/messages.ts` 已完成最后收尾，`normalizeMessages` 改为显式累积输出，消除了 `flatMap` 在联合消息分支上的返回类型推断冲突
  - 已验证以下长线文件的定向过滤 `typecheck` 输出为空：
    - `src/utils/messages.ts`
    - `src/utils/sessionStorage.ts`
    - `src/utils/queryHelpers.ts`
    - `src/utils/teammateMailbox.ts`
  - `src/utils/stats.ts`
  - 这意味着“消息类型收口链”这一条无阻长线已完成当前一轮收口，可以把头部继续让给下一批 top files

## 2026-04-07 下一条无阻长线

- 新选择的长线是“teleport bundle 结果联合收口链”，目标是把 seed bundle 创建与上传结果的判别联合在 `teleport` 调用链上收紧，继续把头部往后推。
- 这条线当前覆盖：
  - `src/utils/teleport/gitBundle.ts`
  - `src/utils/teleport.tsx`
- 当前判断：
  - 错误集中在 `BundleCreateResult` / `BundleUploadResult` / `UploadResult` 的失败分支收窄
  - 文件少、写集清晰，适合双代理并行推进后由主线程统一验证
- 当前进展：
  - `src/utils/teleport/gitBundle.ts` 已补显式 failure type guard，`BundleCreateResult` 与 `UploadResult` 的失败分支不再依赖布尔条件的隐式联合收窄
  - `src/utils/teleport.tsx` 已补 `BundleUploadResult` 的失败分支 type guard，并将 `failReason` 的 exhaustiveness 检查改为基于局部已收窄变量
  - 已验证对以下文件执行定向过滤后，`bun run typecheck` 输出为空：
    - `src/utils/teleport/gitBundle.ts`
    - `src/utils/teleport.tsx`
  - 这条 teleport 长线在当前一轮也已完成，可以继续切换到新的 top-file 簇

## 2026-04-07 再下一条无阻长线

- 新选择的长线是“用户输入分发链”，目标是把 slash command、输入处理与 side question 这条近输入侧链路中的消息类型与字面量判别继续收紧。
- 这条线当前覆盖：
  - `src/utils/processUserInput/processSlashCommand.tsx`
  - `src/utils/processUserInput/processUserInput.ts`
  - `src/utils/sideQuestion.ts`
- 当前判断：
  - `processSlashCommand` 主要是 `Message` 与 `AssistantMessage` / `NormalizedUserMessage` 的错位传参，以及常量字面量比较退化
  - `processUserInput` 主要是 hook attachment / agent mention 的收窄与旧泛型残留
  - `sideQuestion` 主要是 assistant content 扁平化时把 `MessageContent` 与 block 数组混用
- 当前进展：
  - `src/utils/processUserInput/processSlashCommand.tsx` 已补 slash-command 输出消息守卫，并修正 assistant/progress helper 的传参与 ant-only 条件判断
  - `src/utils/processUserInput/processUserInput.ts` 已补 hook success / agent mention 守卫，去掉旧 `AttachmentMessage<T>` 泛型残留
  - `src/utils/sideQuestion.ts` 已改为通过 `getMessageContentBlocks` 提取 assistant blocks，并补 API error 的格式化前守卫
- 已验证对以下文件执行定向过滤后，`bun run typecheck` 输出为空：
  - `src/utils/processUserInput/processSlashCommand.tsx`
  - `src/utils/processUserInput/processUserInput.ts`
  - `src/utils/sideQuestion.ts`
- 这条用户输入分发链在当前一轮也已完成，错误头部可继续往后推

## 2026-04-07 协作派工更新

- 使用 `scripts/terminal-safe.ps1 typecheck` 复核后，当前头部已继续前移，不再是之前 roadmap 里记录的消息链、teleport 链或用户输入链。
- 当前 first errors 已集中到以下文件：
  - `src/utils/permissions/pathValidation.ts`
  - `src/utils/permissions/yoloClassifier.ts`
  - `src/utils/plugins/lspPluginIntegration.ts`
  - `src/utils/plugins/marketplaceManager.ts`
  - `src/utils/plugins/pluginOptionsStorage.ts`
  - `src/utils/sessionFileAccessHooks.ts`
  - `src/utils/sessionRestore.ts`
  - `src/utils/settings/validateEditTool.ts`
  - `src/utils/sliceAnsi.ts`
  - `src/utils/swarm/inProcessRunner.ts`
  - `src/utils/textHighlighting.ts`
  - `src/utils/tokens.ts`
  - `src/utils/toolSearch.ts`
  - `src/utils/transcriptSearch.ts`
  - `src/utils/ultraplan/ccrSession.ts`
  - `src/utils/worktree.ts`
- 当前 top files 变为：
  - `src/utils/plugins/pluginInstallationHelpers.ts` x9
  - `src/utils/tokens.ts` x5
  - `src/utils/sliceAnsi.ts` x3
  - `src/utils/permissions/yoloClassifier.ts` x3
  - `src/utils/toolSearch.ts` x3
  - `src/utils/settings/validateEditTool.ts` x2
  - `src/utils/textHighlighting.ts` x2
  - `src/utils/swarm/inProcessRunner.ts` x2
  - `src/utils/permissions/pathValidation.ts` x2
- 当前判断：
  - 类型噪声已经从“长链路主干”切换到“工具/插件/权限/会话工具簇”的收尾阶段。
  - 这批文件之间写集天然可拆，适合继续多代理并行，而不是回到 bridge、消息主链或 provider 基线做大范围回扫。
  - 主线程应只做任务检查、冲突控制、roadmap 更新与结果回收，不直接进入这些文件写码，避免扩大冲突面。
- 当前分工按不重叠写集拆为 5 个簇：
  - 插件市场簇：
    - `src/utils/plugins/pluginInstallationHelpers.ts`
    - `src/utils/plugins/lspPluginIntegration.ts`
    - `src/utils/plugins/marketplaceManager.ts`
    - `src/utils/plugins/pluginOptionsStorage.ts`
  - 权限判定簇：
    - `src/utils/permissions/pathValidation.ts`
    - `src/utils/permissions/yoloClassifier.ts`
    - `src/utils/settings/validateEditTool.ts`
  - Token / ANSI 文本簇：
    - `src/utils/tokens.ts`
    - `src/utils/sliceAnsi.ts`
    - `src/utils/textHighlighting.ts`
  - Tool Search 单文件簇：
    - `src/utils/toolSearch.ts`
  - 运行时 / 会话小簇：
    - `src/utils/swarm/inProcessRunner.ts`
    - `src/utils/sessionFileAccessHooks.ts`
    - `src/utils/sessionRestore.ts`
    - `src/utils/transcriptSearch.ts`
    - `src/utils/ultraplan/ccrSession.ts`
    - `src/utils/worktree.ts`
- 当前回收进展：
  - Tool Search 单文件簇已完成当前一轮收口：
    - `src/utils/toolSearch.ts` 已补 `CompactMetadataWithDiscoveredTools` 兼容别名，用于安全读取 `preCompactDiscoveredTools`
    - 已补 deferred tools delta attachment 的运行时守卫，`addedNames` / `removedNames` 不再以 `unknown` 直接迭代
    - 已验证：`scripts/terminal-safe.ps1 typecheck-filter -Pattern toolSearch.ts` 输出 `no matching errors`
  - 运行时 / 会话小簇已完成当前一轮收口：
    - `src/utils/swarm/inProcessRunner.ts` 已补 tool-use block with id 守卫，避免在 `string | MessageContentBlock` 上直接读取 `type` / `id`
    - `src/utils/sessionFileAccessHooks.ts` 已把 `logMemoryWriteShape` 改为可选能力检测调用，缺失能力时退化为跳过埋点
    - `src/utils/sessionRestore.ts` 已通过 `getMessageContentBlocks` 归一化 message content，再执行 `find`
    - `src/utils/transcriptSearch.ts` 已补 `relevant_memories` 的数组/元素收窄，移除 `unknown.map`
    - `src/utils/ultraplan/ccrSession.ts` 已补 assistant content 数组守卫后再访问 block `type`
    - `src/utils/worktree.ts` 已对 `WorktreeCreateResult` 增加 `'baseBranch' in result` 判别后再读取
    - 已验证：上述 6 个文件的定向 `typecheck-filter` 输出 `no matching errors`
  - 权限判定簇已完成当前一轮收口：
    - `src/utils/permissions/pathValidation.ts` 已补 `PathSafetyCheckResult` / `PathSafetyFailure` 与失败守卫，只在 unsafe 分支读取 `message` / `classifierApprovable`
    - `src/utils/permissions/yoloClassifier.ts` 已改为先通过 `getMessageContentBlocks(...)` 归一化 assistant content，再守卫 `name` / `input`
    - `src/utils/settings/validateEditTool.ts` 已补 settings 校验失败守卫，只在 `{ isValid: false }` 分支读取 `error` / `fullSchema`
    - 当前仓库级 `typecheck` 仍未清空，但头部反馈已转移到插件管理、刷新逻辑和 `textHighlighting` 等其他文件，说明本簇不再是当前首要阻塞
  - Token / ANSI 文本簇已完成当前一轮收口：
    - `src/utils/tokens.ts` 已补 assistant usage 的消息类型收窄，并为 token estimation 引入更匹配的消息切片类型
    - `src/utils/sliceAnsi.ts`、`src/utils/textHighlighting.ts` 已显式区分 control token 与可见字符 token，移除对 `token.value` / `token.fullWidth` 的误读
    - 代理侧反馈其定向修补已完成，但主线程复核后确认全仓仍残留插件管理相关 2 处错误，因此本簇应视为“已完成、非当前阻塞”
  - 插件市场簇已完成当前一轮大部分收口：
    - `src/utils/plugins/lspPluginIntegration.ts` 已改为基于 `LspServerConfigSchema` 推导本地类型，不再依赖不存在的 `LspServerConfig` 导出
    - `src/utils/plugins/marketplaceManager.ts` 已把 marketplace 合并路径改为显式构造 + 守卫，过滤无 `source` 的宽化项
    - `src/utils/plugins/pluginOptionsStorage.ts` 已对 `nonSensitive` / `sensitive` 做对象收窄，并将首轮合并改为 `Object.assign`
    - 已验证：`scripts/terminal-safe.ps1 typecheck-filter -Pattern "src/utils/plugins/(lspPluginIntegration|marketplaceManager|pluginOptionsStorage|pluginInstallationHelpers)\.ts"` 输出 `no matching errors`
    - 但主线程全仓复核后确认仍残留 2 处插件 LSP 赋值错误，位置在：
      - `src/hooks/useManagePlugins.ts:140`
      - `src/utils/plugins/refresh.ts:115`
    - 因此插件市场簇当前状态应定义为“基本完成，仍有 1 个收尾子簇待处理”
  - 主线程复核结论：
    - 收尾子簇已完成：
      - `src/hooks/useManagePlugins.ts` 已在写回 `p.lspServers` 前显式调用 `addPluginScopeToLspServers(servers, p.name)`
      - `src/utils/plugins/refresh.ts` 已同步采用相同的 scoped LSP server 写回路径
    - 主线程独立复核：`scripts/terminal-safe.ps1 typecheck` 输出 `typecheck: clean`
    - 这意味着本轮 5 个并行簇外加 1 个插件收尾子簇都已完成，当前全仓类型基线已恢复到可持续维护状态
- 本轮验收标准：
  - 只修当前静默 `typecheck` 头部对应的局部类型守卫、判别联合和缺失导出问题，不做跨簇重构。
  - 每个代理仅修改自己拥有的文件簇，并使用 `scripts/terminal-safe.ps1` 做定向验证。
  - 主线程仅在代理回收后更新路线状态，不把写集重新并回单线程大修模式。

## 当前阻塞判断

当前项目状态应定义为：

- `CLI 基础启动可用`
- `Bun 工程依赖基线已补齐`
- `全仓 typecheck 已恢复 clean`

这意味着项目已经从“恢复类型基线”的阶段切换到“可持续增量开发”的阶段。后续重点不再是清理高频静态类型噪声，而是围绕多 provider / 多模型主目标做回归验证、行为一致性检查和配置可见性收口。

## 2026-04-07 Typecheck 后续阶段

- 当前阶段目标从“恢复静态类型基线”切换到“把多 provider / 多模型能力做成可验证、可观察、可持续推进的交付面”。
- 现阶段优先级重排为：
  - 任务级路由可见性
  - provider fallback / 负载策略回归测试
  - route-aware transport 的兼容行为验证
- 当前判断：
  - `taskRouting -> api client -> providerBalancer` 底层链路已经可工作，但“当前有效 route 配置长什么样”仍主要靠读源码和环境变量推断。
  - `scripts/bun-tools.ts` 已具备 `providers` / `health` 诊断入口，适合继续扩成 route 可见性入口，而不必先冒险改大 UI 文件。
  - `taskRouting.test.ts`、`providerBalancer.test.ts`、`openaiCompatibleClient.test.ts` 已有测试基线，适合直接做增量回归覆盖。
- 当前分工按不重叠写集拆为 3 条主线：
  - Route 可见性主线：
    - `src/utils/model/taskRouting.ts`
    - `src/utils/model/taskRouting.test.ts`
    - `scripts/bun-tools.ts`
    - 目标：补 route snapshot / debug helper，并新增 CLI 级 route 诊断命令
  - OpenAI-compatible 回归测试主线：
    - `src/services/api/openaiCompatibleClient.test.ts`
    - 目标：补显式 `baseUrl` / `apiKey`、同 provider endpoint 恢复、跨 provider fallback 的兼容测试
  - Provider balancer 回归测试主线：
    - `src/utils/model/providerBalancer.test.ts`
    - `src/utils/model/providerMetadata.test.ts`
    - 目标：补 health snapshot、success reset、策略/权重/env 一致性测试
- 当前回收进展：
  - Route 可见性主线已完成当前一轮：
    - `src/utils/model/taskRouting.ts` 已新增 route debug snapshot helper，可输出每个 route 的 effective `provider` / `apiStyle` / `model` / `baseUrl` / `apiKey` 及其来源
    - `scripts/bun-tools.ts` 已新增 `routes` 与 `route [querySource]` 子命令，可直接查看全量 route snapshot 和单 querySource 的 route 解析结果
    - `src/utils/model/taskRouting.test.ts` 已补 querySource 映射、env 覆盖可见性、显式 `baseUrl` forcing `openai-compatible` 的回归测试
    - route 诊断输出已完成默认 masking：未显式请求 secret 时，`apiKey` 统一显示为 `"[masked]"`
    - 已验证：
      - `bun test src/utils/model/taskRouting.test.ts`
      - `bun run scripts/bun-tools.ts routes`
      - `bun run scripts/bun-tools.ts route agent:builtin:plan`
      - 主线程组合复核：`bun test src/utils/model/taskRouting.test.ts src/services/api/openaiCompatibleClient.test.ts src/utils/model/providerBalancer.test.ts src/utils/model/providerMetadata.test.ts`
      - 主线程命令复核：`NEKO_CODE_MAIN_API_KEY=... bun run scripts/bun-tools.ts route repl_main_thread`
    - 当前已知风险：
      - 若后续调用方主动传 `includeSecrets: true`，仍会拿到原始 key；默认路径已安全
  - OpenAI-compatible 回归测试主线已完成当前一轮：
    - `src/services/api/openaiCompatibleClient.test.ts` 已新增 2 个回归用例
    - 已覆盖：显式 `baseUrl` / `apiKey` 存在时不得跨 provider fallback
    - 已覆盖：primary endpoint 冷却期过后，后续请求会重新回到 preferred provider，而不是永久卡在 fallback provider
    - 已验证：`bun test src/services/api/openaiCompatibleClient.test.ts` 通过
  - Provider balancer 回归测试主线已完成当前一轮：
    - `src/utils/model/providerBalancer.test.ts` 已补 health snapshot、success reset，以及 cooldown-aware fallback / round-robin / weighted 策略回归
    - `src/utils/model/providerMetadata.test.ts` 已补 strategy 与 weight override 的 env 优先级校验
    - 已验证：`bun test src/utils/model/providerBalancer.test.ts src/utils/model/providerMetadata.test.ts` 通过
    - 当前残留风险较小，主要是测试中对 `Date.now()` 的依赖；正常 CI/本地时钟下可接受
- 当前收尾判断：
  - 这三条主线的核心目标都已落地，且 route 诊断命令的敏感信息暴露风险已收尾
  - 主线程组合复核结果：
    - 4 个目标测试文件共 `33 pass / 0 fail`
    - route 诊断命令在存在 `NEKO_CODE_MAIN_API_KEY` 时仍只输出 `"[masked]"`
  - 当前更合适的下一阶段候选应转到：
    - `Doctor` / 诊断界面是否要消费同一份 masked route snapshot
    - 多 provider / 多模型的 CLI smoke 流程是否需要补一轮端到端脚本
    - 配置入口是否要把 `taskRoutes` 以“只读诊断”或“显式编辑”形式暴露给用户
- 本轮约束不变：
  - 主线程只做任务检查、ownership 控制和 roadmap 更新
  - 优先在测试文件和诊断脚本上推进，避免把冲突面扩散到大体积 UI 文件
  - 若 route 可见性已经能被脚本满足，本轮不强行进入 `Settings` / `Doctor` 大文件

## 2026-04-07 下一轮派工

- 正在完成的任务：
  - route 可见性这条线已基本完成，正在评估是否进入下一阶段的 `Config` 可编辑 MVP
  - 继续避免无准备地进入高冲突写集；若要进 `Config.tsx`，只允许单文件、单代理推进
- 已经完成的任务：
  - `typecheck clean`
  - route 诊断 CLI 可见性
  - route 诊断默认 secret masking
  - OpenAI-compatible fallback 回归测试
  - provider balancer / metadata 回归测试
  - `readonly-smoke.ps1` 已新增 `routing` / `diagnostics` workflow，可覆盖 `bun-tools routes|route|providers|health`
  - `doctorDiagnostic.ts` 已带出 `currentTaskRouteSnapshot`，且默认保持 masked 输出
  - `src/utils/status.tsx` 已消费 `currentTaskRouteSnapshot`
  - `src/components/Settings/Status.tsx` 已通过现有 `buildInstallationHealthDiagnostics()` 链路天然接入这条新诊断信息
  - `src/utils/status.tsx` 已新增 main route 的只读 `Property[]` summary，并接入现有 Status 属性展示链
  - `src/screens/Doctor.tsx` 已在 Diagnostics 区显式显示 main route summary
  - 主线程复核：
    - `scripts/terminal-safe.ps1 typecheck` => `clean`
    - `.\\scripts\\readonly-smoke.ps1 -Workflow routing,diagnostics` => `6 passed / 0 failed`
- 当前分工：
  - `Doctor` 诊断主线：
    - 已完成：`src/utils/doctorDiagnostic.ts`
    - 已补：`DiagnosticInfo.currentTaskRouteSnapshot`
    - 已验证：在存在 `NEKO_CODE_MAIN_API_KEY` 时，doctor diagnostic 输出仍只包含 masked `apiKey`
  - `readonly-smoke` 主线：
    - 已完成：`scripts/readonly-smoke.ps1`
    - 已补：`routing` / `diagnostics` workflow 与对应 filter/usage 路径
    - 已验证：`.\\scripts\\readonly-smoke.ps1 -ListOnly -Workflow routing,diagnostics`
- 当前判断：
  - 这两条线都比“正式 taskRoutes 编辑 UI”更低冲突，也更符合当前“先做可观察与可验证”的阶段目标
  - `Doctor` 数据侧已经就位，但消费面还没有使用 `currentTaskRouteSnapshot`
  - 这两个轻量候选现在都已落地：
    - 低冲突消费面：`status.tsx` -> `Settings/Status.tsx`
    - `readonly-smoke` 实际执行：`routing,diagnostics` 已经主线程复核通过
  - 下一步更适合转向“高冲突区域前的探路”，而不是直接改大文件：
    - `Doctor.tsx` 若要显式展示 route snapshot，最小插入点在哪里
    - `Settings` 若要把 `taskRoutes` 做成更明确的只读/编辑入口，最小写集能压到哪里
- 当前探路进展：
  - `Doctor.tsx` 方向已完成最小探路：
    - 最小可行写集只需 `src/screens/Doctor.tsx`
    - 不需要再动 `doctorDiagnostic.ts`
    - 最适合的插点是 `Doctor` 组件现有 `Diagnostics` 文本块内部，在 Search 展示之后、recommendation / multipleInstallations / warnings 之前
    - 低风险原因：
      - 数据已在 `diagnostic.currentTaskRouteSnapshot` 中就位
      - 只动渲染层，不改 state / effect / 数据获取链路
    - 已知冲突点：
      - `Doctor.tsx` 是 React Compiler 产物，手改应尽量靠近现有 `<Text>` 拼装区，避免大块重排
      - 更适合展示压缩后的 summary，而不是原样输出整份 snapshot
  - `Settings` 方向已完成方案对比：
    - 只读 summary 方案：
      - 最小可行写集：`src/utils/status.tsx` + `src/components/Settings/Status.tsx`
      - 若接受继续挂在 diagnostics 区，甚至可以只动 `src/utils/status.tsx`
    - 可编辑入口方案：
      - 最小可行写集可压到 `src/components/Settings/Config.tsx`
      - 但会进入立即写盘、dirty/revert、source-aware 回滚逻辑，冲突面明显更高
    - 当前结论：
      - 更低冲突的是“只读 summary”
      - 原因是它只走读路径，且能直接展示 route 的多层来源；编辑 UI 则必须额外处理 source、回滚和“看起来未生效”的解释
- 当前决策：
  - route 可见性的低冲突阶段已完成：
    - `bun-tools routes/route`
    - `doctorDiagnostic.currentTaskRouteSnapshot`
    - `Status` 只读 summary
    - `Doctor` Diagnostics 显式 route summary
  - 主线程独立复核后，当前 `typecheck` 仍为 `clean`
  - 下一阶段候选只剩：
    - 单文件推进 `src/components/Settings/Config.tsx` 的 `taskRoutes` 可编辑 MVP
    - 或继续停留在当前状态，等待更低冲突窗口再进入该文件

## 2026-04-07 Config MVP 补充

- 正在完成的任务：
  - `taskRoutes.main` 可编辑 MVP 已完成，正在评估下一步是扩更多 route 还是补交互验证
  - 继续避免把 `Config` 改动扩散成多文件写集
- 已经完成的任务：
  - `src/components/Settings/Config.tsx` 已完成 `taskRoutes.main` 的单文件可编辑 MVP
  - 当前只覆盖 `provider` / `apiStyle` / `model` / `baseUrl`
  - 当前只写 `localSettings.taskRoutes.main`
  - 当前已补 `changes` / `isDirty` / `revertChanges` 的最小回滚语义
  - 主线程独立复核：`scripts/terminal-safe.ps1 typecheck` => `clean`
- 当前判断：
  - 这一轮已经把 route 可见性从“诊断可见”推进到“main route 可编辑”
  - 继续扩到更多 route 仍然可做，但收益开始下降，且 `Config.tsx` 单文件冲突风险会上升
  - 更合理的下一步候选是：
    - 为当前 `Config` route editor 补最小交互验证或 smoke
    - 或在更低冲突窗口里再扩到 `subagent` / `frontend` / `review`

## 阻塞根因

### 1. 仓库快照不完整

- 一批源码模块并不是配置错误，而是仓库快照里直接缺失
- 这类缺口会在 `typecheck` 中表现为大量 `TS2307`
- 当前优先级最高的是被高频引用的基础模块，例如消息类型、assistant 入口、transport 基类和若干 oauth / secureStorage 类型模块

### 2. SDK 生成类型尚未恢复

- 当前 `src/entrypoints/sdk/*` 中仍有占位导出
- 这些占位足够支撑源码模式 CLI 启动，但不足以支撑 bridge / structured IO / remote 等深路径的静态类型
- 结果是大量字段退化成 `unknown`，进一步放大 `typecheck` 噪声

### 3. bridge / remote 路径对真实类型结构依赖最重

- 当前高频报错集中在 `bridgeMessaging`、`initReplBridge`、`inboundMessages`、`structuredIO`
- 这些模块本身不是根因，它们只是最早暴露出“缺失模块 + 占位类型过宽”的组合问题
- 随着 SDK/control 占位类型逐步收紧，错误头已经从底层桥接路径前移到命令层，再进一步推进到组件层，说明当前阻塞已经从“基线缺件”切换为“局部类型细节待修复”

## 后续开发顺序

### 第一阶段：先恢复高频缺失模块

目标：

- 将 `TS2307` 这类“模块不存在”错误先压下去
- 让工程暴露出更真实的下一层类型问题

优先对象：

- `src/types/message.ts`
- `src/types/tools.ts`
- `src/services/oauth/types.ts`
- `src/utils/secureStorage/types.ts`
- 以及后续扫描出的 `assistant/index`、transport、querySource 相关缺失模块

### 第二阶段：逐步替换 SDK 占位类型

目标：

- 缩小 `unknown` 传播范围
- 为 bridge / structured IO / CCR 路径恢复真实字段约束

优先对象：

- `src/entrypoints/sdk/controlTypes.ts`
- `src/entrypoints/sdk/coreTypes.generated.ts`
- 与之关联的 bridge 类型守卫和消息转换层

### 第三阶段：沿 bridge 主链路收口类型错误

目标：

- 先打通一条高频链路，而不是分散清理全仓噪声

推荐顺序：

1. `src/bridge/bridgeMessaging.ts`
2. `src/bridge/inboundMessages.ts`
3. `src/bridge/initReplBridge.ts`
4. `src/cli/structuredIO.ts`
5. 在上述链路稳定后，继续按 `bun run typecheck` 头部顺序收口 `src/commands/bridge/bridge.tsx`、`src/commands/chrome/chrome.tsx`、`src/commands/clear/conversation.ts`

## 本阶段完成标准

本阶段不是追求一次性全仓零报错，而是达到下面的工程状态：

- CLI 基础命令可继续稳定运行
- 高频缺失模块不再反复阻塞
- `typecheck` 报错从“快照缺件”收敛为“真实类型细节待修复”
- 后续开发可按模块链路继续推进，而不是反复回到依赖和基线问题

## 开发导航

- 当前多 API / 多模型推进的收敛笔记见 [multi-api-provider-compatibility-dev-notes.md](./multi-api-provider-compatibility-dev-notes.md)

## 2026-04-07 并行同步注记 4

- roadmap 后续按追加式同步，尽量不重写已有段落，降低与他人并行编辑冲突。
- 当前新开的长线是“插件安装链”，覆盖：
  - `src/utils/plugins/pluginInstallationHelpers.ts`
  - `src/utils/plugins/mcpbHandler.ts`
- 当前判断：
  - `pluginInstallationHelpers` 主要是安装结果联合的失败分支没有被精确收窄
  - `mcpbHandler` 主要是 number schema 上的 `min/max` 仍为 `unknown`

## 2026-04-07 并行同步注记 5

- “插件安装链” 当前一轮已完成：
  - `src/utils/plugins/pluginInstallationHelpers.ts` 已补 `InstallCoreResult` / `ResolutionResult` 的 failure 守卫，安装包装层不再直接从未收窄联合读取失败字段
  - `src/utils/plugins/mcpbHandler.ts` 已补 number schema `min/max` 的数值收窄，避免把 `unknown` 直接用于比较
- 已验证对以下文件执行定向过滤后，`bun run typecheck` 输出为空：
  - `src/utils/plugins/pluginInstallationHelpers.ts`
  - `src/utils/plugins/mcpbHandler.ts`
- 继续保持 append-only roadmap 同步，避免与他人正在编辑的既有段落发生冲突

## 2026-04-07 并行同步注记 6

- 当前新开的短链是“权限判定链”，覆盖：
  - `src/utils/permissions/pathValidation.ts`
  - `src/utils/permissions/yoloClassifier.ts`
  - `src/utils/settings/validateEditTool.ts`
- 当前判断：
  - `pathValidation` 与 `validateEditTool` 都是布尔判别联合未被失败分支精确收窄
  - `yoloClassifier` 则是 assistant content block 仍混有字符串，访问 `tool_use.name/input` 前需要显式守卫

## 2026-04-07 并行同步注记 7

- “权限判定链” 当前一轮已完成：
  - `src/utils/permissions/pathValidation.ts` 已补 path safety 失败分支守卫
  - `src/utils/permissions/yoloClassifier.ts` 已改为通过 `getMessageContentBlocks` 遍历 assistant content，并只在 `tool_use` block 上读取 `name/input`
  - `src/utils/settings/validateEditTool.ts` 已补 settings validation 失败分支守卫
- 已验证对以下文件执行定向过滤后，`bun run typecheck` 输出为空：
  - `src/utils/permissions/pathValidation.ts`
  - `src/utils/permissions/yoloClassifier.ts`
  - `src/utils/settings/validateEditTool.ts`
- roadmap 继续保持 append-only 更新，避免影响他人正在编辑的既有段落

## 2026-04-07 并行同步注记 8

- 原计划接力的 `sliceAnsi/textHighlighting` 与后续的插件管理刷新链，在最新工作树中已被并行推进到定向 `typecheck` 清空，因此主线程未重复改写这些文件，只做了复核。
- 复核范围包括：
  - `src/utils/sliceAnsi.ts`
  - `src/utils/textHighlighting.ts`
  - `src/hooks/useManagePlugins.ts`
  - `src/utils/plugins/refresh.ts`
- 进一步验证结果：
  - `bun run typecheck` 已整仓通过，退出码为 `0`
  - 这意味着当前阶段已经从“持续压缩头部错误”推进到“TypeScript 全仓基线通过”
- 后续若继续推进，重点就不再是 `typecheck` 清零，而应切到回归验证、运行时路径和并行协作后的收尾检查

## 2026-04-07 并行同步注记 9

- 在整仓 `typecheck` 通过后，继续做了最小运行时回归：
  - `bun src/entrypoints/cli.tsx --version`
  - `bun src/entrypoints/cli.tsx --help`
- 两个命令均已成功返回，说明最近这一轮类型修补没有破坏 CLI 基础启动路径。
- 当前阶段可以把重点转向：
  - 更高价值的运行时路径回归
  - 插件 / LSP / MCP 等动态链路抽样验证
  - 并行修补后的清理与文档收尾

## 2026-04-07 并行同步注记 6

- 主线程已完成对上一轮代理写集的本地复核；以下文件在全仓静默 `typecheck` 输出中已为 0 命中：
  - `src/utils/forkedAgent.ts`
  - `src/utils/messages/mappers.ts`
  - `src/utils/model/modelOptions.ts`
  - `src/utils/notebook.ts`
  - `src/utils/permissions/classifierDecision.ts`
  - `src/utils/permissions/filesystem.ts`
  - `src/utils/plugins/mcpbHandler.ts`
- 主线程额外检查了上述文件的 `git diff`，当前写集仍限制在约定文件内，没有发现越界改写。
- 全仓静默 `typecheck` 头部已继续前移到：
  - `src/utils/permissions/pathValidation.ts`
  - `src/utils/permissions/yoloClassifier.ts`
  - `src/utils/plugins/lspPluginIntegration.ts`
  - `src/utils/plugins/marketplaceManager.ts`
  - `src/utils/plugins/pluginOptionsStorage.ts`
  - `src/utils/sessionFileAccessHooks.ts`
  - `src/utils/sessionRestore.ts`
  - `src/utils/settings/validateEditTool.ts`
  - `src/utils/sliceAnsi.ts`
- 当前 top files 变为：
  - `src/utils/tokens.ts`
  - `src/utils/permissions/yoloClassifier.ts`
  - `src/utils/sliceAnsi.ts`
  - `src/utils/toolSearch.ts`
  - `src/utils/permissions/pathValidation.ts`
  - `src/utils/settings/validateEditTool.ts`
  - `src/utils/swarm/inProcessRunner.ts`
  - `src/utils/textHighlighting.ts`
- 下一轮继续保持不互相干扰的三路并行拆分：
  - 权限簇：`src/utils/permissions/pathValidation.ts`、`src/utils/permissions/yoloClassifier.ts`
  - 插件簇：`src/utils/plugins/lspPluginIntegration.ts`、`src/utils/plugins/marketplaceManager.ts`、`src/utils/plugins/pluginOptionsStorage.ts`
  - 会话/文本簇：`src/utils/sessionFileAccessHooks.ts`、`src/utils/sessionRestore.ts`、`src/utils/settings/validateEditTool.ts`、`src/utils/sliceAnsi.ts`

## 2026-04-07 并行同步注记 7

- 本轮复核结论已经分化为“已完成”与“剩余尾巴”两部分，主线程按完成项先追加同步，避免等整轮全清才更新 roadmap。
- 已完成并在全仓静默 `typecheck` 中验证为 0 命中的文件：
  - 权限簇：`src/utils/permissions/pathValidation.ts`、`src/utils/permissions/yoloClassifier.ts`
  - 会话簇：`src/utils/sessionFileAccessHooks.ts`、`src/utils/sessionRestore.ts`、`src/utils/settings/validateEditTool.ts`
- 主线程 review 结果：
  - 权限簇采用的是本地 type guard / 内容块提取收窄，没有扩大到相邻权限模块
  - 会话簇采用的是兼容 require 类型、`getMessageContentBlocks` 收窄和 settings 校验联合守卫，改动边界符合当前“只做局部收口”的约束
- 插件与文本处理簇仍有剩余尾巴：
  - `src/utils/plugins/lspPluginIntegration.ts` 仍余 3 个错误，主要是 `ScopedLspServerConfig` 与当前对象字面量/入参数量级不对齐
  - `src/utils/plugins/pluginOptionsStorage.ts` 仍余 1 个 spread object 错误
  - `src/utils/sliceAnsi.ts` 仍余 5 个错误，包含 `@alcalzone/ansi-tokenize` 导出名不匹配和 `Token` 联合字段访问未完全收窄
- 当前新的静默头部已经收敛到：
  - `src/utils/plugins/lspPluginIntegration.ts`
  - `src/utils/plugins/pluginOptionsStorage.ts`
  - `src/utils/sliceAnsi.ts`
  - `src/utils/textHighlighting.ts`
  - `src/utils/tokens.ts`
- 为继续避免冲突，当前分工保持：
  - 代理继续收尾：`lspPluginIntegration.ts`、`pluginOptionsStorage.ts`、`sliceAnsi.ts`
  - 用户可并行接手且当前未与代理重叠：`src/utils/textHighlighting.ts`、`src/utils/tokens.ts`

## 2026-04-07 并行同步注记 8

- 文本/渲染相关尾巴在当前工作区已继续前移；主线程重新跑全仓静默 `typecheck` 后确认以下文件当前为 0 命中：
  - `src/utils/sliceAnsi.ts`
  - `src/utils/textHighlighting.ts`
  - `src/utils/tokens.ts`
- 其中 `sliceAnsi.ts` 的当前收口方向已经明确为本地 token type guard；`textHighlighting.ts` / `tokens.ts` 也已不再出现在当前错误集中。由于这几处发生在并行工作区中，本段只记录现状，不额外归属到单一执行者。
- 插件簇进一步推进后，当前只剩一个明确的类型出口尾巴：
  - `src/utils/plugins/lspPluginIntegration.ts` 仍有 1 个本地错误
  - 该错误同时外溢到 `src/hooks/useManagePlugins.ts` 与 `src/utils/plugins/refresh.ts`
  - 根因已经定位为 `extractLspServersFromPlugins()` 内把未加 scope 的 `servers` 回写到了 `plugin.lspServers`
- `src/utils/plugins/pluginOptionsStorage.ts` 当前已在全仓静默 `typecheck` 中验证为 0 命中。
- 因此当前最小剩余阻塞已经进一步收敛为“插件 LSP 缓存回写类型出口”这一点；修完后应再刷新一次全仓头部，决定下一轮并行拆分。

## 2026-04-07 并行同步注记 9

- 插件 LSP 缓存回写尾巴已继续收口；主线程再次执行全仓静默 `typecheck` 后确认以下文件当前均为 0 命中：
  - `src/utils/plugins/lspPluginIntegration.ts`
  - `src/utils/plugins/pluginOptionsStorage.ts`
  - `src/hooks/useManagePlugins.ts`
  - `src/utils/plugins/refresh.ts`
  - `src/utils/sliceAnsi.ts`
  - `src/utils/textHighlighting.ts`
  - `src/utils/tokens.ts`
- 当前 `bun run typecheck` 的退出码已经为 `0`。在 PowerShell 下经由 `bun.ps1` 重定向时仍会看到一小段 launcher 包装噪声，但不再包含任何 `TS` 诊断。
- 这意味着“类型基线恢复”这一阶段的主要目标已达成：项目已从“CLI 可运行、typecheck 持续恢复中”推进到“全仓 typecheck 通过”。
- 主线程已补做基础运行 smoke，当前结果：
  - `bun src/entrypoints/cli.tsx --version` 正常返回 `dev (Neko Code)`
  - `bun src/entrypoints/cli.tsx --help` 正常输出主命令帮助
  - `bun src/entrypoints/cli.tsx plugin --help` 正常输出插件命令帮助
  - `bun src/entrypoints/cli.tsx mcp --help` 正常输出 MCP 命令帮助
- roadmap 下一阶段不再以类型头部为主导航，而应切到“可用性 smoke / 关键链路回归验证”，优先确认：
  - plugin 管理链是否在真实列表/校验路径上可用
  - MCP 管理链是否在 list/get/serve 基础入口上可用
  - interactive / resume / auth 等高频入口是否仍保持可启动

## 2026-04-07 并行同步注记 10

- 主线程已开始执行“可用性 smoke / 关键链路回归验证”，当前已确认以下实际入口可以正常执行：
  - `bun src/entrypoints/cli.tsx plugin list`：成功返回 “No plugins installed”
  - `bun src/entrypoints/cli.tsx agents`：成功列出内置 agent
  - `bun src/entrypoints/cli.tsx mcp list`：在当前目录无 `.mcp.json` 的前提下成功返回 “No MCP servers configured”
  - `bun src/entrypoints/cli.tsx auth status`：成功返回已登录状态（`loggedIn: true`，`authMethod: oauth_token`，`apiProvider: firstParty`）
- 辅助判断：
  - 当前仓库目录下 `Test-Path .mcp.json` 为 `False`，因此本轮 `mcp list` smoke 不会因为项目级 stdio server 而引入额外副作用
  - plugin / mcp / auth / agents 这几条高频非交互入口已经从“只验证帮助命令可解析”推进到“真实命令可执行”
- 到这一节点，项目状态可更新为：
  - `全仓 typecheck 已通过`
  - `CLI 主入口、plugin、mcp、auth、agents 基础非交互链路可执行`
  - `下一阶段应转向更深一层的真实工作流 smoke，而不是继续做类型收口`
- 建议下一轮并行方向：
  - plugin 侧：挑一个只读校验路径，例如 `plugin validate <manifest-path>` 或 marketplace 只读命令
  - MCP 侧：继续验证 `mcp get` / `mcp serve --help` 之外的最小真实链路
  - 会话侧：选择不触发实际模型调用的 interactive / resume / doctor / setup 相关只读或帮助型入口

## 2026-04-07 并行同步注记 11

- plugin 管理链已继续通过更深一层的只读 smoke：
  - `bun src/entrypoints/cli.tsx plugin marketplace list`：成功返回 `No marketplaces configured`
  - 使用系统临时目录中的最小样本执行 `plugin validate` 成功路径：
    - 最小 `plugin.json` 目录样本验证通过，带 1 个预期 warning：缺少 `author`
    - 最小 `marketplace.json` 文件样本验证通过，带 2 个预期 warning：空 `plugins` 与缺少 `metadata.description`
- 本轮还顺手验证了一个 MCP 错误路径：
  - `bun src/entrypoints/cli.tsx mcp get does-not-exist`：按预期返回 `No MCP server found with name: does-not-exist`
- 执行细节补充：
  - 初次用 PowerShell `Set-Content -Encoding UTF8` 生成临时 JSON 时，因为写入 BOM，`plugin validate` 将其识别为严格 JSON 语法错误（`Unrecognized token '﻿'`）
  - 改为通过 `.NET UTF8Encoding($false)` 写入无 BOM 文件后，验证命令即恢复正常
  - 这更像是 Windows/Pwsh 生成样本文件时的编码细节，不是 CLI 校验链本身的问题
- `doctor` 命令当前不再作为无人值守 smoke 继续强推：
  - 实际执行在当前终端里超时
  - 静态检查 [util.tsx](/E:/Github/claude-code/src/cli/handlers/util.tsx#L72) 可见 `doctorHandler()` 通过 React/Ink 渲染 `Doctor` 界面并等待 `onDone` 回调后才退出
  - 因此它更适合作为交互式人工 smoke，而不是当前这类无交互批量验证
- 当前阶段结论可再收紧为：
  - `typecheck` 已通过
  - plugin / marketplace / mcp / auth / agents 多条基础非交互链路已做过真实命令级 smoke
  - 剩余未覆盖重点主要在交互式会话链与更深层插件/MCP 实操路径

## 2026-04-07 长程协作规划

- 当前阶段定位已经从“类型基线恢复”切换为“运行时可用性与交付基线固化”。
- 后续总目标不再是继续追 `typecheck` 头部，而是把项目推进到下面这个状态：
  - `整仓 typecheck 持续保持通过`
  - `CLI 高频非交互命令可稳定执行`
  - `plugin / MCP / auth / session / LSP 关键工作流至少各有一条真实链路完成 smoke`
  - `并行协作下的 roadmap、验证记录和剩余风险可持续维护`

### 里程碑拆分

1. M1: 回归基线固化
   - 目标：把当前零散 smoke 变成可重复执行的“最小回归矩阵”
   - 完成标准：
     - 高频 CLI 入口至少覆盖 `help / version / plugin / mcp / auth / agents`
     - 每条命令有明确“预期结果、退出码、是否只读、是否依赖本地环境”的记录
     - roadmap 中可直接看到哪些入口已验证、哪些仍是空白

2. M2: 动态链路抽样验证
   - 目标：验证插件、MCP、LSP、会话恢复这类动态路径不是“只会 typecheck，不会跑”
   - 完成标准：
     - plugin 至少验证一条读取型路径和一条刷新/校验型路径
     - MCP 至少验证一条读取型路径和一条配置解析路径
     - 会话侧至少验证一条 resume/continue/print/bare 相关只读链路
     - 每个链路的副作用范围清楚可控

3. M3: 运行时污染与边界收敛
   - 目标：确认缓存、设置、插件目录、MCP 配置、LSP 初始化不会在并行协作中制造隐性污染
   - 完成标准：
     - 识别所有“会写本地状态”的验证命令
     - 这些验证优先切到临时目录、测试配置或显式只读模式
     - roadmap 中有“安全运行约束”而不是口头约定

4. M4: 交付收尾
   - 目标：把当前战术性修补沉淀为可交接的工程状态
   - 完成标准：
     - roadmap、开发导航、残余风险同步完成
     - 关键 smoke 命令和结果可被后续协作者直接复用
     - 若后续再引入回归，能快速定位到是类型、运行时还是环境问题

### 工作流拆分

- 工作流 A: CLI 基础与会话链
  - 范围：`version/help/print/bare/continue/resume/doctor/setup-token` 等入口
  - 重点：不触发真实模型调用时的启动、参数解析、只读状态查看
  - 适合分工：单命令或单链路领取，避免多人同时碰同一入口文件

- 工作流 B: Plugin 管理链
  - 范围：`plugin list/validate/reload/refresh/discover` 及相关缓存更新
  - 重点：列表、校验、刷新、副作用边界、错误文案与返回码
  - 适合分工：读取型命令与写入型命令分开；写入型优先在临时环境做

- 工作流 C: MCP 管理链
  - 范围：`mcp list/get/add/remove/serve` 及项目级配置解析
  - 重点：无 `.mcp.json`、有最小配置、错误配置 三种场景
  - 适合分工：一个人管配置样本，一个人管 CLI 行为验证

- 工作流 D: LSP / Plugin-LSP 动态链
  - 范围：LSP manager 初始化、plugin LSP 注入、刷新后重载
  - 重点：动态配置读取、刷新一致性、无配置时的 no-op 行为
  - 适合分工：只在已有 smoke 足够后推进，避免一开始就卷进状态污染

- 工作流 E: 文档与验证工装
  - 范围：roadmap、验证清单、临时 smoke 脚本或命令模板
  - 重点：把“谁测过什么、用什么环境测的、结果如何”固定下来
  - 适合分工：主线程持有，减少多人抢写同一文档块

### 建议分工槽位

- 主线程
  - 负责：选长线、审 diff、跑定向验证、维护 roadmap 尾部追加记录
  - 不负责：与代理重叠的同文件实现

- 代理槽位 1
  - 负责：CLI / session 只读 smoke
  - 产出：命令、退出码、结果摘要、风险点

- 代理槽位 2
  - 负责：plugin 管理链
  - 产出：读取型命令回归结果，必要时附带最小修补

- 代理槽位 3
  - 负责：MCP 管理链
  - 产出：最小配置样本、解析结果、错误场景覆盖

- 代理槽位 4
  - 负责：LSP / plugin refresh / 动态加载尾巴
  - 产出：是否会污染状态、是否需要额外隔离环境

### 协作规则

- roadmap 继续 append-only，不重写旧段落；每轮只在文件尾部追加同步注记。
- 一次只给代理分配一个明确写集；优先“单文件”或“单工作流”所有权。
- 主线程默认只 review、验证、记账；除非代理超时或链路只剩单点，才直接下场补。
- 每次完成都至少记录三件事：
  - 做了什么
  - 怎么验证
  - 还有什么残余风险

### 近期任务池

1. 回归矩阵补齐
   - 把当前已跑过的 `version/help/plugin list/mcp list/auth status/agents` 统一沉淀成清单
   - 补齐 `plugin --help`、`mcp --help`、`doctor --help`、`resume --help`、`print` 侧只读 smoke

2. Plugin 工作流抽样
   - 验证 `plugin validate` 或等价只读校验路径
   - 验证 `reload-plugins` 在当前“无插件/少插件”状态下的最小行为

3. MCP 工作流抽样
   - 构造最小安全配置样本，验证配置读取与错误提示
   - 明确 `mcp get` / `mcp serve` 的最小无害验证策略

4. Session / auth 工作流抽样
   - 继续验证不触发模型调用的 `resume/continue/bare/print` 相关路径
   - 区分“需要真实凭证”和“只检查启动逻辑”的命令

5. 工装与收尾
   - 视需要补一个最小 smoke 脚本或命令文档，减少重复手工执行
   - 将风险较高、可能污染环境的命令单独列为“需隔离执行”

### 当前建议优先级

1. 先固化回归矩阵，把已经通过的命令沉淀成可重复清单
2. 再补 plugin / MCP 的只读或低副作用真实路径
3. 然后再碰 LSP / refresh / 会写本地状态的动态链路
4. 最后补文档收尾和必要的 smoke 工装

## 2026-04-07 并行同步注记 11

- 当前主线已切到 `M1: 回归基线固化`，目标是把“命令跑过了”升级为“可重复、可派发、可追踪的最小回归矩阵”。
- 本轮按工作流拆分为三组只读或低副作用 smoke：
  - CLI / session：`version/help/bare/help/doctor --help/resume --help/auth status/agents`
  - plugin：`plugin --help/plugin list` 与插件只读帮助入口
  - MCP：`mcp --help/mcp list` 与 MCP 只读帮助入口
- 主线程职责：
  - 只做命令矩阵归档、结果复核、roadmap 追加
  - 不与并行执行者重叠跑同一组命令，避免重复和日志噪声
- 本轮交付预期：
  - roadmap 尾部出现一个可扩展的回归矩阵
  - 每条命令至少记录：工作流、命令、是否只读、结果、备注

## 2026-04-07 并行同步注记 12

- 已新增只读 smoke 工装与清单：
  - `scripts/readonly-smoke.ps1`
  - `docs/plans/2026-04-07-readonly-smoke-matrix.md`
- 当前自动化覆盖的工作流：
  - CLI / session：`--version`、`--help`、`--bare --help`、`--print --help`、`doctor --help`、`resume --help`、`auth status`、`agents`
  - plugin：`plugin --help`、`plugin list`、`plugin marketplace list`、`plugin validate package.json`
  - MCP：`mcp --help`、`mcp serve --help`、`mcp list`、`mcp get definitely-missing-server`
- 当前本地环境的实际结果：
  - `plugin list` 返回无已安装插件
  - `plugin marketplace list` 返回无已配置 marketplace
  - `mcp list` 在仓库无 `.mcp.json` 的前提下返回无 MCP server
  - `mcp get definitely-missing-server` 以退出码 `1` 返回明确缺失错误
  - `plugin validate package.json` 以退出码 `1` 返回明确 schema 校验错误
  - `auth status`、`agents` 均正常返回
- 当前明确不纳入自动脚本的入口：
  - `doctor` 实际命令会进入交互式诊断页并等待 `PressEnterToContinue`
  - `reload-plugins`、`mcp add/remove/serve`、实际 `resume/continue/print` 路径仍应在隔离环境或显式无副作用前提下验证
- 这样后续协作者可以先复用同一套只读矩阵，再去补动态链路，避免多人重复跑同一批命令或误触本地状态

## 2026-04-07 回归矩阵 v0

| 工作流 | 命令 | 只读/低副作用 | 结果 | 备注 |
|---|---|---|---|---|
| CLI / session | `bun src/entrypoints/cli.tsx --version` | 是 | 通过 | 输出 `dev (Neko Code)` |
| CLI / session | `bun src/entrypoints/cli.tsx --help` | 是 | 通过 | 主帮助正常输出 |
| CLI / session | `bun src/entrypoints/cli.tsx --bare --help` | 是 | 通过 | `--bare` 说明正常 |
| CLI / session | `bun src/entrypoints/cli.tsx doctor --help` | 是 | 通过 | 仅帮助；正文提示真实 `doctor` 会跳过 trust dialog 并可能拉起 `.mcp.json` 中的 stdio server |
| CLI / session | `bun src/entrypoints/cli.tsx resume --help` | 是 | 通过 | 当前返回主帮助页；后续可单独确认这是否为预期 CLI 设计 |
| CLI / session | `bun src/entrypoints/cli.tsx auth status` | 是 | 通过 | 读取本机登录状态；当前为已登录 OAuth token |
| CLI / session | `bun src/entrypoints/cli.tsx agents` | 是 | 通过 | 当前列出 `2 active agents` |
| plugin | `bun src/entrypoints/cli.tsx plugin --help` | 是 | 通过 | 可见 `disable/enable/install/list/marketplace/uninstall/update/validate` |
| plugin | `bun src/entrypoints/cli.tsx plugin list` | 是 | 通过 | 当前环境输出 `No plugins installed` |
| plugin | `bun src/entrypoints/cli.tsx plugin validate --help` | 是 | 通过 | 帮助正常输出，说明 `<path>` 入参要求 |
| MCP | `bun src/entrypoints/cli.tsx mcp --help` | 是 | 通过 | `mcp` 帮助正常输出 |
| MCP | `bun src/entrypoints/cli.tsx mcp list` | 是 | 通过 | 当前环境输出 `No MCP servers configured` |
| MCP | `bun src/entrypoints/cli.tsx mcp get --help` | 是 | 通过 | 仅帮助；正文提示真实执行可能跳过 trust dialog 并为健康检查拉起 stdio server |

- 主线程抽样复核已完成：
  - `bun src/entrypoints/cli.tsx doctor --help`
  - `bun src/entrypoints/cli.tsx plugin list`
  - `bun src/entrypoints/cli.tsx mcp list`
- 当前结论：
  - 回归矩阵的第一批命令已经从“零散 smoke”固化为可复用清单
  - plugin / MCP 真实写入型链路仍未触碰，后续应继续保持隔离策略
  - 下一轮更适合扩展 `plugin validate` 实际只读校验路径，以及 `resume/continue/print` 一类不触发模型调用的会话路径

## 2026-04-07 并行同步注记 12

- 已补一条真实只读 plugin 工作流：
  - 命令：`bun src/entrypoints/cli.tsx plugin validate .`
  - 退出码：`1`
  - 结果：按预期返回目录缺少 manifest 的校验错误，输出 `No manifest found in directory. Expected .claude-plugin/marketplace.json or .claude-plugin/plugin.json`
  - 判断：这是有效的负向 smoke，说明 `plugin validate` 主链可执行，且错误文案可读
- MCP 配置入口补验证时发现一个需要单独处理的 CLI 语义点：
  - `--mcp-config <configs...>` 是顶层 variadic 选项，前置在 `mcp list` 前时会吞并后续子命令参数
  - 后置到 `mcp list` 后又会被当成未知选项
  - 结论：`mcp` 管理子命令不适合作为 `--mcp-config` 的验证载体；后续应改为 `print/bare` 路径，或使用单独的配置解析入口做 smoke
- 下一轮建议：
  - session 侧继续补 `resume/continue` 的安全只读负向场景
  - MCP 侧把“空配置 / 错配置”的验证切换到更符合 CLI 语法的入口

## 2026-04-07 并行同步注记 13

- session 侧已尝试一条更真实的负向 smoke：
  - 命令：`bun src/entrypoints/cli.tsx --resume 00000000-0000-0000-0000-000000000000`
  - 结果：在当前环境下未快速失败，而是超时挂起
  - 判断：`resume` 不能简单按“给不存在 session id 应快速报错”的假设来做无交互 smoke
- 这说明会话链路需要单独分层：
  - `help` 级别 smoke 仍然安全
  - 真实 `resume/continue` 更适合放进带超时、TTY 约束和预制会话样本的专门 harness
- 对后续分工的影响：
  - session 工作流不应再直接拿主 CLI 做裸跑
  - 应先补一层“可控输入 + 可控会话样本”的验证方案，再继续做真实 resume/continue 回归

## 2026-04-07 并行同步注记 14

- MCP 侧已补两条基于临时目录的实际读取 smoke，均未触碰仓库本身：
  - 临时目录 + 最小 `.mcp.json` 内容 `{"mcpServers":{}}` + `bun src/entrypoints/cli.tsx mcp list`
    - 退出码：`0`
    - 结果：`No MCP servers configured`
    - 结论：`mcp list` 可以正常读取“空项目配置”场景
  - 临时目录 + 损坏 `.mcp.json` 内容 `{invalid-json` + `bun src/entrypoints/cli.tsx mcp list`
    - 退出码：`0`
    - 结果：仍然是 `No MCP servers configured`
    - 结论：`mcp list` 不是严格配置校验入口；损坏项目配置不会在这个命令上显式失败
- 结合 handler 复核结果，当前判断进一步明确：
  - `mcp list` 的职责偏向“读取并列出当前可用 MCP server，再做健康检查”
  - `--mcp-config` 的严格校验逻辑存在于主入口动态配置路径，而不是 `mcp` 子命令链
  - 因此 MCP 工作流后续应拆成两类：
    - inventory / health-check 路径：继续使用 `mcp list/get`
    - strict config validation 路径：改走 `--mcp-config` 所在主入口，或补专门 harness

## 2026-04-07 并行同步注记 15

- plugin validate 已补齐正向样本，使用的是系统临时目录中的最小插件夹具：
  - 目录结构：`<temp>/.claude-plugin/plugin.json`
  - 内容：`{"name":"smoke-plugin"}`
  - 命令：`bun src/entrypoints/cli.tsx plugin validate .`
  - 退出码：`0`
  - 结果：`Validation passed with warnings`
- 当前这条正向样本的稳定结论：
  - `plugin validate` 不要求完整 manifest；仅有合法 `name` 也能通过基础结构校验
  - 缺失 `version/description/author` 会以 warnings 暴露，而不是 hard error
- 额外发现的 harness 约束：
  - Windows PowerShell 默认 `Set-Content` 写出的 UTF-8 BOM 会让 `plugin validate` 报 `Invalid JSON syntax: Unrecognized token '﻿'`
  - 因此后续所有临时 JSON 夹具都应显式使用 UTF-8 无 BOM 写入
- 这使 plugin 工作流当前已经具备：
  - 一条负向真实 smoke（目录无 manifest）
  - 一条正向真实 smoke（最小 manifest 通过并产生 warnings）

## 2026-04-07 并行同步注记 16

- 已继续补两条真实只读管理链路：
  - `bun src/entrypoints/cli.tsx plugin marketplace list --json`
    - 退出码：`0`
    - 输出：`[]`
    - 判断：当前环境下 marketplace 配置读取链可执行，且空状态 JSON 输出正常
  - `bun src/entrypoints/cli.tsx mcp get definitely-missing-server`
    - 退出码：`1`
    - 输出：`No MCP server found with name: definitely-missing-server`
    - 判断：`mcp get` 的缺失项负向路径可快速失败，比 `resume` 更适合作为稳定的 CLI 负向 smoke
- 到这一节点，回归矩阵已经不只是帮助命令：
  - plugin 已覆盖 `help/list/validate/marketplace list`
  - MCP 已覆盖 `help/list/get(negative)` 与项目级空配置读取
  - session 当前仍以 `help/status/agents` 为主，真实 `resume` 需单独 harness

## 2026-04-07 分工任务板 v0

### 可立即领取

1. Session harness 槽位
   - 目标：为 `resume/continue` 建一个可控的无交互 smoke 方案
   - 起点：`--resume <uuid>` 在当前环境会超时挂起，不能直接裸跑
   - 建议做法：
     - 准备临时会话样本目录
     - 加显式超时与非交互输入约束
     - 先证明“不存在 session 时的稳定返回行为”
   - 完成标准：至少沉淀 1 条真实 session 负向 smoke，不依赖人工交互

2. MCP strict-config 槽位
   - 目标：验证 `--mcp-config` 的严格配置校验路径
   - 起点：该选项是顶层 variadic，不能直接拿 `mcp list/get` 当载体
   - 建议做法：
     - 找到适合挂 `--mcp-config` 的主入口或 headless harness
     - 准备空配置、损坏配置、最小合法配置三类样本
   - 完成标准：明确哪条命令链真正覆盖 dynamic MCP config validation

3. Plugin write-path 槽位
   - 目标：把 plugin 工作流从只读矩阵推进到“可控写入”的最小 smoke
   - 起点：当前只读链已经覆盖 `list/validate/marketplace list`
   - 建议做法：
     - 先在隔离目录或临时 settings 下验证 `reload-plugins` / 低风险 marketplace 行为
     - 避免直接修改协作者共享环境
   - 完成标准：至少 1 条写入型或刷新型 plugin 链路完成可控 smoke

4. LSP / refresh 槽位
   - 目标：验证 plugin refresh 后 LSP 动态链不会退化
   - 起点：类型层面已通，但运行时只做过基础启动 smoke
   - 建议做法：
     - 以临时 plugin 夹具或受控配置为入口
     - 先验证“无 LSP/空 LSP” no-op，再验证最小合法 LSP 配置注入
   - 完成标准：至少确认一条 plugin-LSP refresh 运行时链路

### 主线程后续职责

- 继续维护回归矩阵和任务板，只做 append-only 更新
- 对各槽位提交的结果做抽样复核
- 将“可重复命令”升级成统一 smoke 清单或脚本草案

## 2026-04-07 协作状态约定

- 为避免并行冲突，后续 roadmap 与阶段同步统一使用以下状态标签：
  - `进行中`：当前主线程或代理已领取、正在执行，其他人默认不要碰
  - `已完成`：已经实现并验证过，可作为后续工作的稳定输入
  - `待领取`：尚未开始，或明确留给他人接手
  - `风险/备注`：不会单独占坑，但需要协作者避坑或调整验证策略
- 后续每轮同步至少明确写出：
  - 当前 `进行中` 的任务
  - 本轮新进入 `已完成` 的任务
  - 剩余 `待领取` 任务与关键 `风险/备注`
- 主线程执行约束：
  - 不再只写“下一轮建议”，而会显式标注状态
  - 若任务状态变化，会先更新 roadmap 再继续推进下一条链

## 2026-04-07 状态同步 1

### 进行中

- `Session harness`
  - 负责人：主线程
  - 目标：为 `resume/continue` 建立可控、可重复、无交互的 smoke 方案

- `MCP strict-config` 入口识别
  - 负责人：并行代理
  - 目标：找到真正覆盖 `--mcp-config` 严格校验的安全入口，不与现有 `mcp list/get` 混用

### 已完成

- `TypeScript 基线恢复`
  - `bun run typecheck` 已整仓通过

- `CLI / plugin / MCP 基础只读矩阵 v0`
  - 已覆盖 `version/help/bare/help/doctor --help/auth status/agents/plugin list/plugin validate --help/mcp list/mcp get --help`

- `plugin validate` 真实样本
  - 已完成 1 条负向样本与 1 条正向样本

- `MCP inventory / health-check` 链路归类
  - 已明确 `mcp list/get` 适合 inventory/health-check，不适合 strict config validation

### 待领取

- `Plugin write-path`
  - 目标：补 `reload-plugins` 或等价低风险写入链

- `LSP / refresh`
  - 目标：验证 plugin-LSP refresh 运行时链路

### 风险/备注

- `resume` 裸跑不存在 session id 会挂起，不能再当作简单负向 smoke 直接使用
- 所有临时 JSON 夹具在 Windows 下都要显式使用 UTF-8 无 BOM 写入

## 2026-04-07 并行同步注记 14

- MCP 写入链已补一条隔离型真实 smoke，不再只停留在 help / list / get：
  - 新增 `scripts/isolated-mcp-smoke.ps1`
  - 新增 `docs/plans/2026-04-07-isolated-mcp-write-smoke.md`
- 当前 harness 的隔离策略：
  - 用临时 workspace 承接 project scope 的 `.mcp.json`
  - 用 `NEKO_CODE_CONFIG_DIR=<temp>` 承接 local scope 的全局配置写入
  - 用 `CLAUDE_CODE_PLUGIN_CACHE_DIR=<temp>` 与 `CLAUDE_CODE_SIMPLE=1` 降低额外启动噪声
- 当前实际验证结果：
  - `mcp add -s local isolated-local cmd /c exit 0`：通过
  - `mcp remove isolated-local -s local`：通过
  - `mcp add -s project isolated-project cmd /c exit 0`：通过
  - `mcp remove isolated-project -s project`：通过
  - 汇总：`4 passed, 0 failed`
- 当前结论：
  - MCP 写入型验证已经有了可复用的“隔离执行模板”，后续协作者不需要直接在真实 repo/workspace 上试 `add/remove`
  - 只读矩阵继续保持给所有人复用；写入型命令统一优先走隔离 harness，避免互相污染本地状态

## 2026-04-07 状态同步 2

### 进行中

- `Plugin write-path`
  - 负责人：Codex（本线程）
  - 选择原因：当前任务板里仍是 `待领取`，且可以复用现成的隔离目录 / 临时配置策略，不会和 `Session harness`、`MCP strict-config` 入口识别发生写集冲突
  - 当前目标：先把 `reload-plugins` 或等价低风险 plugin 刷新链路收敛到隔离 smoke，再决定是否继续推进 marketplace 相关最小写入样本

### 已完成

- `Roadmap 状态对账`
  - 负责人：Codex（本线程）
  - 已复核 `docs/plans/2026-04-07-readonly-smoke-matrix.md` 与 `docs/plans/2026-04-07-isolated-mcp-write-smoke.md`
  - 已确认 `scripts/readonly-smoke.ps1` 具备 `-ListOnly` 与 workflow 过滤，可继续作为共享只读矩阵入口
  - 已确认 `scripts/isolated-mcp-smoke.ps1` 已覆盖 `local-add` / `local-remove` / `project-add` / `project-remove` 四条隔离 MCP 写入 smoke

### 待领取

- `LSP / refresh`
  - 保持 `待领取`
  - 原因：应放在 `Plugin write-path` 隔离刷新链路稳定之后再接手，避免两个槽位同时改 plugin 运行时边界

### 风险/备注

- `Plugin write-path` 与 `LSP / refresh` 需要继续拆开追踪：前者验证“刷新/写入动作是否可控”，后者验证“刷新后运行时与 LSP 行为是否正常”
- roadmap 继续 append-only；后续若本线程任务状态变化，先在尾部追加同步，再切换下一槽位

## 2026-04-07 状态同步 3

### 进行中

- `Plugin write-path`
  - 负责人：Codex（本线程）
  - 当前判断：仍是最明确的“已选中但未收口”槽位；在没有隔离型 `reload-plugins` 或等价刷新 smoke 之前，不应把 plugin 动态链标成完成
  - 收口标准：至少补出 1 条隔离执行、可重复、不会污染共享配置的 plugin 刷新/写入型 smoke

### 已完成

- `TypeScript 基线恢复` 复核
  - 已在当前工作树再次执行 `bun run typecheck`
  - 结果：通过；说明 roadmap 中“整仓 typecheck 已通过”这一状态仍然成立，不是历史快照残留

- `CLI / routing / provider` 只读矩阵复核
  - 已执行 `powershell -ExecutionPolicy Bypass -File scripts/readonly-smoke.ps1`
  - 结果：`22 passed, 0 failed, total 22`
  - 相比上一版文档，当前脚本已不止覆盖 CLI / plugin / MCP 基础帮助与清单，还覆盖：
    - `routes`
    - `route compact`
    - `route agent:builtin:plan`
    - `providers`
    - `health`
    - `health glm`
  - 已同步更新 `docs/plans/2026-04-07-readonly-smoke-matrix.md`，避免“脚本已扩、文档仍停留在 16 条”的状态漂移

- `MCP isolated write smoke` 复核
  - 已执行 `powershell -ExecutionPolicy Bypass -File scripts/isolated-mcp-smoke.ps1`
  - 结果：`4 passed, 0 failed, total 4`
  - 结论：`mcp add/remove` 的隔离型真实 smoke 仍然稳定，可继续作为后续动态链路的参考模板

### 待领取

- `LSP / refresh`
  - 保持 `待领取`
  - 原因：plugin 刷新链本身尚未形成隔离 smoke；此时提前推进 LSP 动态链，容易把“刷新动作失败”和“刷新后行为异常”混在一起

- `Session harness`
  - 暂不改状态为 `已完成`
  - 原因：roadmap 尾部尚无对应产物或验证记录追加，本轮未复核到可复用 harness；在新证据落地前，应继续视作未收口

- `MCP strict-config`
  - 暂不改状态为 `已完成`
  - 原因：当前只确认了 `mcp list/get` 不适合作为 strict-config 入口，但还没有看到最终选定的稳定验证载体

### 风险/备注

- 当前最容易造成“做到一半”错觉的不是代码基线，而是文档状态漂移；本轮已经先把 smoke 矩阵文档与脚本实况重新对齐
- 后续不要回到“重新证明 typecheck 还过”这种低收益重复劳动，除非核心类型文件再次大规模变动
- 下一步应直接围绕 `Plugin write-path` 产出可复用隔离 harness；完成后再切 `LSP / refresh`，这样阶段边界最清楚

## 2026-04-07 状态同步 4

### 进行中

- `LSP / refresh`
  - 当前已经成为更合理的下一槽位
  - 原因：`Plugin write-path` 本身的隔离 smoke 已落地，后续可以把“刷新动作可控”和“刷新后 LSP 行为是否正确”分开追踪

### 已完成

- `Plugin write-path`
  - 已新增 `scripts/plugin-refresh-smoke.ts`
  - 已新增 `docs/plans/2026-04-07-isolated-plugin-refresh-smoke.md`
  - 当前隔离策略：
    - 临时 workspace 承接 `getOriginalCwd()` 与会话内刷新上下文
    - `NEKO_CODE_CONFIG_DIR=<temp>` 隔离设置写入
    - `CLAUDE_CODE_PLUGIN_CACHE_DIR=<temp>` 隔离插件缓存
    - `CLAUDE_CODE_SIMPLE=1` 降低无关启动噪声
    - 通过会话级 inline plugin 注入临时插件，不污染共享插件安装状态
  - 当前验证方式：
    - 先跑一次无 inline plugin 的 baseline refresh
    - 再跑一次带临时 inline plugin 的 refresh
    - 对比 `enabled_count` 与 `command_count` 的 delta，而不是写死绝对值，避免 builtin plugin 数量影响稳定性
  - 当前实测结果：
    - `baseline-no-inline-plugin`：通过
    - `refresh-with-inline-plugin`：通过
    - delta：enabled plugins `+1`、commands `+1`
  - 当前补充断言：
    - 临时 inline plugin 出现在 `AppState.plugins.enabled`
    - `pluginReconnectKey` 递增到预期值，说明 refresh 仍会触发后续 MCP 重连观察链

### 待领取

- `Session harness`
  - 保持 `待领取`
  - 原因：当前仍缺稳定、无交互的会话样本与退出行为定义

- `MCP strict-config`
  - 保持 `待领取`
  - 原因：当前仍只完成了入口识别，还没固化成可复用 harness

### 风险/备注

- `Plugin write-path` 已经不再是“做到一半”的状态；后续不要再把 `reload-plugins` 与只读 `plugin validate` 混成同一个阶段
- 下一步应把验证重点切到 `LSP / refresh`，确认刷新后动态配置注入与 no-op 场景都不回退

## 2026-04-07 状态同步 5

### 进行中

- `Session harness`
  - 当前成为更适合接手的剩余槽位
  - 原因：plugin refresh 与 LSP refresh 两条动态链都已有隔离验证模板，剩余不确定性更集中在会话恢复路径

- `MCP strict-config`
  - 保持 `进行中` 候选
  - 原因：入口识别已完成，但尚未沉淀为稳定 harness

### 已完成

- `LSP / refresh`
  - 已新增 `scripts/lsp-refresh-smoke.ts`
  - 已新增 `docs/plans/2026-04-07-isolated-lsp-refresh-smoke.md`
  - 当前隔离策略：
    - 临时 workspace 承接 `getOriginalCwd()` 与 LSP manager 的工作目录
    - `NEKO_CODE_CONFIG_DIR=<temp>` 与 `CLAUDE_CODE_PLUGIN_CACHE_DIR=<temp>` 隔离设置与缓存
    - 不启用 `CLAUDE_CODE_SIMPLE=1`，避免 LSP manager 被 short-circuit
    - 通过会话级 inline plugin 注入一个带 `lspServers` 的临时插件
  - 当前验证方式：
    - 先初始化一次无 inline plugin 的 baseline LSP manager
    - 再注入临时 LSP plugin，执行 `refreshActivePlugins()`
    - 等待 `reinitializeLspServerManager()` 完成后，对比 manager 内部 server 数量与 scoped server 名称
  - 当前实测结果：
    - `baseline-lsp-manager`：通过
    - `refresh-with-inline-lsp-plugin`：通过
    - delta：LSP servers `+1`
  - 当前补充断言：
    - `refreshActivePlugins().lsp_count >= 1`
    - manager 中出现 `plugin:<plugin-name>:smoke`
    - 刷新后插件仍出现在 `AppState.plugins.enabled`

### 待领取

- `Session harness`
  - 继续保持高优先级
  - 原因：当前仍是剩余动态链中最缺可复用 harness 的部分

- `MCP strict-config`
  - 继续保持高优先级
  - 原因：当前只有语义判断，没有最终验证载体

### 风险/备注

- 当前 plugin 动态链已经拆成两条并各自收口：
  - 刷新动作本身：`scripts/plugin-refresh-smoke.ts`
  - 刷新后的 LSP 配置重建：`scripts/lsp-refresh-smoke.ts`
- 后续不要把这两条再混回单一“plugin smoke”表述；否则 roadmap 很容易再次出现“做到一半但看起来像完成”的状态漂移

## 2026-04-07 状态同步 6

### 进行中

- `Session harness`
  - 继续保持首要剩余动态链
  - 原因：当前 plugin / MCP / LSP 三类 smoke 都已有稳定模板，只有 session 恢复链仍缺同等级别的隔离 harness

### 已完成

- `LSP / refresh` 回归修补
  - 在隔离 LSP smoke 首轮验证中发现了一个真实回归：
    - manager 内部 server 名称被重复 scope，出现 `plugin:<name>:plugin:<name>:<server>` 形态
    - 根因：`refreshActivePlugins()` 已把 `plugin.lspServers` 写成 scoped cache，而 `getPluginLspServers()` 再次执行 `addPluginScopeToLspServers()`
  - 已修：`src/utils/plugins/lspPluginIntegration.ts`
    - 对 `plugin.lspServers` 的缓存分支不再重复加 scope
    - 仅对 fresh manifest / `.lsp.json` 读取结果执行 `addPluginScopeToLspServers()`
  - 修后复核：
    - `bun run scripts/lsp-refresh-smoke.ts`：通过
    - manager server 名称恢复为 `plugin:smoke-inline-lsp-plugin:smoke`
    - `bun run typecheck`：通过

### 待领取

- `MCP strict-config`
  - 保持待领取
  - 原因：仍没有最终 harness

- `Session harness`
  - 保持待领取
  - 原因：仍没有最终 harness

### 风险/备注

- 这轮说明隔离 smoke 不只是“验收脚本”，还能提前暴露 runtime cache 形态回归；后续剩余动态链应继续沿这个模式推进
