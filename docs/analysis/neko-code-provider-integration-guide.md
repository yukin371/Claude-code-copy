# Neko Code Provider Integration Guide

这份文档定义 Neko Code 的多 API 接入方向。目标不是一次性绑定某个厂商，而是先建立统一内部协议，再把不同 API/模型接成可切换的适配器。

## 目标

- 支持多个 API 提供方并存
- 支持同一提供方内的多个模型/端点/Key
- 支持按任务路由不同模型与不同 provider
- 支持自动 fallback、熔断、降级与重试
- 保持 OpenAI-compatible 作为主要外部接口形态

## 推荐方案

采用三层结构：

1. 任务路由层
2. 统一请求层
3. Provider 适配层

### 1. 任务路由层

负责决定“这次任务应该用哪个 provider / model”。

输入信号建议包括：

- 任务类型
- agent 类型
- prompt 内容
- 工具类型
- 权限模式
- 历史健康状态

输出只应该是一个抽象决策：

- `route`
- `provider`
- `model`
- `fallback chain`

### 2. 统一请求层

负责把内部消息格式归一化成统一的请求对象。

建议内部主格式优先向 OpenAI-compatible 靠拢，原因是：

- 适配面最广
- 结构更适合多 provider 映射
- 后续更容易接入网关、代理和第三方 SDK

这一层应处理：

- message / tool call / tool result 归一化
- system prompt 拼装
- model name 规范化
- token / context 限制
- streaming 与 non-streaming 统一

### 3. Provider 适配层

每个 provider 只负责“把统一请求翻译成自己的 API”。

建议至少分这几类：

- `openai-compatible`
- `anthropic`
- `gemini`
- `glm`
- `minimax`
- `codex`

适配层职责：

- API key / base URL / header 注入
- request / response 映射
- provider 特有参数转换
- 错误码标准化
- 健康检查

## 路由原则

- 主线程默认走主模型
- subagent 可独立于主线程配置模型池
- 前端改动任务优先走适合代码生成的模型
- 审查/verification 优先走更强、更稳的模型
- 探索类任务优先走低成本模型

## Fallback 原则

- 同 provider 内先切换模型，再切换 endpoint
- provider 不可用时切换到下一个 provider
- 模型失败要区分限流、超时、不可用、参数错误
- fallback 需要保留原因和命中记录，便于观测

## 配置建议

建议把配置分成四组：

- provider 基础配置：key、base URL、organization、endpoint
- model 映射配置：主模型、subagent 模型、frontend 模型、review 模型
- 路由策略配置：任务到 provider/model 的映射
- 容错策略配置：重试、熔断、fallback、权重

## 接入顺序

1. 先定义统一请求数据结构
2. 再把现有 Anthropic 调用接到适配层
3. 再接入 OpenAI-compatible provider
4. 再接 Gemini / GLM / MiniMax 等 provider
5. 最后补路由、fallback、权重和健康检查

## 现阶段约束

- 不要把 provider 逻辑散落到业务代码里
- 不要把任务判断写死在每个调用点
- 不要用单一 SDK 反向约束所有 provider
- 不要在没有统一协议前做大量 provider 特化
