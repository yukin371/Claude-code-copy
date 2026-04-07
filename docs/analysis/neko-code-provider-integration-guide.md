# Neko Code Provider Integration Guide

这份文档定义 Neko Code 的多 API 接入方向。目标不是一次性绑定某个厂商，而是先建立统一内部协议，再把不同 API/模型接成可切换的适配器，同时把可跨应用复用的流量治理能力下沉到外部网关。

## 目标

- 支持多个 API 提供方并存
- 支持按任务路由不同模型与不同 provider
- 保持 OpenAI-compatible 作为主要外部接口形态
- 支持把负载均衡、熔断、key 池和聚合转发交给外部网关，而不是在应用内重复实现

## 推荐方案

采用四层结构：

1. 任务路由层
2. 统一请求层
3. Provider 适配层
4. 外部网关层（可选但推荐）

## 边界总览

```text
taskRoutes -> route decision -> unified request -> provider adapter -> direct provider
                                                           \
                                                            -> external gateway -> provider pool / key pool / failover
```

应用内负责“本次任务该走谁、请求怎么归一化、用哪种传输协议”。

外部网关负责“多个端点和多个 key 之间怎么调度、怎么观测、怎么熔断、怎么给多个应用复用同一套流量治理策略”。

### 1. 任务路由层

负责决定“这次任务应该用哪个 provider / model”。

输入信号建议包括：

- 任务类型
- agent 类型
- prompt 内容
- 工具类型
- 权限模式

输出只应该是一个抽象决策：

- `route`
- `provider`
- `model`
- `apiStyle`
- `baseUrl`

这一层不负责端点轮询、权重选择或健康打分。

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

这一层也不负责多 endpoint 调度；如果请求目标是网关，只需要把请求稳定发给网关。

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

适配层应尽量保持薄，不承接跨 provider 的运维型调度逻辑。

### 4. 外部网关层（可选但推荐）

当多个应用都需要共享 provider 池、key 池或聚合转发能力时，优先接入外部网关，而不是在每个应用里重复做一套 balancer。

外部网关建议承接：

- key 池与配额治理
- 多 endpoint 轮换
- 权重均衡
- 健康检查
- 熔断与恢复
- 重试退避
- 聚合转发与统一观测

## 路由原则

- 主线程默认走主模型
- subagent 可独立于主线程配置模型池
- 前端改动任务优先走适合代码生成的模型
- 审查/verification 优先走更强、更稳的模型
- 探索类任务优先走低成本模型

## Fallback 原则

- 默认不要在应用内偷偷做复杂负载均衡
- 如果 route 已经指向外部网关，请把端点轮换、权重和熔断交给网关
- 应用内 fallback 只保留最小安全回退，例如能力不支持、显式备用 route 或直连模式下的硬失败兜底
- 任何本地 fallback 都需要保留原因和命中记录，避免行为不可解释

## 配置建议

建议把配置分成四组：

- provider 基础配置：key、base URL、organization、endpoint
- model 映射配置：主模型、subagent 模型、frontend 模型、review 模型
- 路由策略配置：任务到 provider/model 的映射
- 网关接入配置：是否走外部 gateway、gateway base URL、鉴权方式、可选显式备用 route

推荐的路由配置入口是 `settings.json` 下的 `taskRoutes`：

```json
{
  "taskRoutes": {
    "main": {
      "provider": "glm",
      "apiStyle": "openai-compatible",
      "model": "YOUR_MAIN_MODEL"
    },
    "subagent": {
      "provider": "minimax",
      "apiStyle": "openai-compatible",
      "model": "YOUR_SUBAGENT_MODEL"
    },
    "frontend": {
      "provider": "gemini",
      "apiStyle": "openai-compatible",
      "model": "YOUR_FRONTEND_MODEL"
    },
    "review": {
      "provider": "codex",
      "apiStyle": "openai-compatible",
      "model": "YOUR_REVIEW_MODEL"
    }
  }
}
```

模型名不要在源码里硬编码，应该由用户自己在配置里提供。

如果某条 route 要接外部网关，优先通过该 route 的 `baseUrl` 指向网关 OpenAI-compatible 入口，而不是继续往应用内增加新的均衡策略字段。

## 接入顺序

1. 先定义统一请求数据结构
2. 再把现有 Anthropic 调用接到适配层
3. 再接入 OpenAI-compatible provider
4. 再把任务级 provider/model 路由接通
5. 最后为需要共享流量治理的场景接入外部网关

## 现阶段约束

- 不要把 provider 逻辑散落到业务代码里
- 不要把任务判断写死在每个调用点
- 不要用单一 SDK 反向约束所有 provider
- 不要在没有统一协议前做大量 provider 特化
- 不要把 key 池、权重均衡、熔断和聚合转发继续做成应用内核心能力

## 参考决策

- [ADR-2026-04-07-provider-routing-and-gateway-boundary.md](../decisions/ADR-2026-04-07-provider-routing-and-gateway-boundary.md)
