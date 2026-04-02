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
- 进行中：统一 provider/router 抽象（已加入 task route execution target 骨架）
- 进行中：按任务路由不同模型（主线程 / subagent / 前端 / 审查可由配置驱动）
- 进行中：OpenAI-compatible 接入（主查询路径已通过 route transport 接入 shim）
- 进行中：按任务路由不同 API（辅助路径与策略层仍在补齐）
- 进行中：fallback / 负载均衡 / 熔断（endpoint/provider 回退已接入）

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

## 交付顺序

1. 先完成品牌/路径隔离与 Claude 配置自动迁移
2. 再完成 provider/router 抽象
3. 再做任务级模型路由
4. 最后完善 fallback、负载均衡和验证

## 开发导航

- 当前多 API / 多模型推进的收敛笔记见 [multi-api-provider-compatibility-dev-notes.md](./multi-api-provider-compatibility-dev-notes.md)
