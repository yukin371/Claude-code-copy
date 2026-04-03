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
- 已补：`contextCollapse`、`reactiveCompact`、`TungstenTool`、`attributionHooks` 等缺失入口的占位模块，降低高频 `TS2307`
- 已补：`bridgeMessaging` 首轮类型修正，清掉错误头部中的权限模式导入与 request id 问题
- 当前剩余阻塞：全仓 `typecheck` 仍未通过，主要是快照缺失模块、未恢复的生成类型细节，以及若干 bridge/remote 相关类型收口问题

## 当前阻塞判断

当前项目状态应定义为：

- `CLI 基础启动可用`
- `Bun 工程依赖基线已补齐`
- `完整开发基线仍未收口`

这意味着项目已经不是“无法启动”的阶段，而是“可运行、但还不能稳定维护和继续开发”的阶段。

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

## 本阶段完成标准

本阶段不是追求一次性全仓零报错，而是达到下面的工程状态：

- CLI 基础命令可继续稳定运行
- 高频缺失模块不再反复阻塞
- `typecheck` 报错从“快照缺件”收敛为“真实类型细节待修复”
- 后续开发可按模块链路继续推进，而不是反复回到依赖和基线问题

## 开发导航

- 当前多 API / 多模型推进的收敛笔记见 [multi-api-provider-compatibility-dev-notes.md](./multi-api-provider-compatibility-dev-notes.md)
