# Neko Code Roadmap

这份 roadmap 记录 Neko Code 从 Claude Code 基线演进到独立、多模型、多 API 平台的开发方向。

## 当前进度

- 已完成：品牌默认值切换为 `Neko Code`
- 已完成：默认配置目录、临时目录、tmux socket 与 Claude Code 隔离
- 已完成：analytics 默认关停，sink 改为 no-op
- 进行中：统一 provider/router 抽象
- 进行中：按任务路由不同模型（主线程 / subagent / 前端 / 审查已接入运行时）
- 待开始：按任务路由不同 API
- 待开始：OpenAI-compatible 接入
- 待开始：fallback / 负载均衡 / 熔断

## Phase 1: 品牌与隔离

- 将产品默认品牌切换为 Neko Code
- 将配置目录、临时目录、socket 命名和 Claude Code 隔离
- 清理残留的 Claude Code 默认文案
- 保留旧环境变量作为兼容兜底

## Phase 2: Provider 抽象

- 建立统一 provider/router 层
- 支持 Anthropic、OpenAI-compatible 和现有第三方 provider
- 统一模型请求、响应、错误和重试策略
- 为 provider 加健康检查和自动切换

## Phase 3: 任务级模型路由

- 主线程使用主模型
- subagent 使用独立模型池
- review / verification 使用更强模型
- 前端修改任务使用专门模型
- built-in agent 支持显式映射
- 运行时已接入任务提示词解析，用于前端 / 审查类任务自动切换模型

## Phase 4: 负载均衡与容错

- 多 API key / 多 endpoint / 多 model 之间做轮询或权重分配
- provider 或模型失败时自动切换
- 对限流、超时、模型不可用做熔断与回退
- 路由策略保持可配置、可观测

## Phase 5: 隐私收敛

- 默认关闭非必要遥测
- 移除或降级会暴露路径、内容和行为的埋点
- 将剩余统计改为显式开关
- 保证默认配置是最少采集

## 交付顺序

1. 先完成品牌/路径隔离
2. 再完成 provider/router 抽象
3. 再做任务级模型路由
4. 最后完善 fallback、负载均衡和验证
