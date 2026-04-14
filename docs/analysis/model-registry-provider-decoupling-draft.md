日期：2026-04-13

## Goal

- 让使用者、主代理和 `subagent` 在选择模型时只面对“模型名称”，不需要理解 provider、gateway 或代理来源。
- 把“模型选择”和“请求来源选择”拆成两个独立层次，避免当前配置把模型名和 provider 绑定在一起。
- 支持“同名模型可由多个 provider/source 提供”，同时保持路由可预测、可诊断、可回退。

## Problem

当前配置和实现更接近“模型归属于 provider”，而不是“provider 提供模型”。

- 简化配置 `providers/models/defaults` 会先展开成低层 `providerKeys/taskRoutes/model`。
- `models.<name>` 当前本质上是 “model -> provider alias” 的映射。
- `/model`、模型选择器、route override 和 key 解析都依赖“先从模型反推 provider”。
- 这会让下面两类场景变得不自然：
  - `glm-4.5` 通过 `minimax` 代理或兼容网关提供
  - 同一个模型名可以被多个 provider/source 提供

结果是：

- 用户明面上只在选模型，系统内部却在隐式猜 provider。
- 一旦同名模型多来源或模型族与 transport 不一致，系统行为会变得不可解释。

## Design Principles

- 用户层只暴露模型名，不暴露 provider。
- route 层只决定“用哪个模型”，不决定“走哪个 source”。
- provider/source 层只负责 transport：`key`、`baseUrl`、`apiStyle`、provider family。
- 同名模型多来源必须可解释，禁止隐式、无规则地猜测。
- diagnostics 必须同时展示：
  - 选中的模型名
  - 解析得到的 source/provider
  - 是否触发 fallback

## Terms

- provider:
  - 一个可请求的真实上游定义
  - 负责 `type`、`baseUrl`、`apiStyle`、`keyEnv/key`
- source:
  - 本文中等同于一个可被模型引用的 provider 实例
  - 为避免引入新概念，配置层可直接复用 `provider`
- model:
  - 用户可见、可选择的模型名，如 `gpt-5.4`、`glm-4.5`
- route:
  - 粗粒度任务分类，如 `main`、`subagent`、`frontend`、`review`
- defaultSource:
  - 同名模型在多个 source 中的默认执行来源

## Proposed Config Shape

### 1. Providers

`providers` 定义真实 transport/source：

```json
{
  "providers": {
    "openai_main": {
      "type": "codex",
      "baseUrl": "https://api.openai.com/v1",
      "keyEnv": "OPENAI_API_KEY"
    },
    "minimax_proxy": {
      "type": "openai-compatible",
      "baseUrl": "https://proxy.example.com/v1",
      "keyEnv": "MINIMAX_API_KEY"
    },
    "glm_direct": {
      "type": "glm",
      "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
      "keyEnv": "GLM_API_KEY"
    }
  }
}
```

约束：

- `providers.*` 是系统级唯一 id。
- 每个 provider 代表一个单一 upstream 定义。
- 不再把 provider 作为“模型归属标签”。

### 2. Models

`models` 定义用户可见模型和其可用来源：

```json
{
  "models": {
    "gpt-5.4": {
      "sources": [
        { "provider": "openai_main", "priority": 10 }
      ],
      "defaultSource": "openai_main"
    },
    "glm-4.5": {
      "sources": [
        { "provider": "minimax_proxy", "priority": 10 },
        { "provider": "glm_direct", "priority": 20 }
      ],
      "defaultSource": "minimax_proxy"
    }
  }
}
```

约束：

- `models` 的 key 就是最终给用户和代理选择的模型名。
- `sources[*].provider` 必须引用 `providers` 中存在的 id。
- `defaultSource` 必须指向该模型 `sources` 中的某个 provider。
- `priority` 越小越优先，仅用于默认来源缺失时或 fallback 排序。

### 3. Defaults

`defaults` 只负责 route 到模型名的默认映射：

```json
{
  "defaults": {
    "main": "gpt-5.4",
    "subagent": "glm-4.5",
    "frontend": "glm-4.5",
    "review": "gpt-5.4"
  }
}
```

约束：

- `defaults.*` 只写模型名，不写 provider。
- route 解析后拿到的是模型名，之后再单独解析 source。

### 4. Optional Agent-Level Rules

若后续要区分不同类型 `subagent`，建议新增规则层，但仍然只输出模型名：

```json
{
  "agentModelRules": [
    { "agentType": "explorer", "model": "glm-4.5" },
    { "agentType": "worker", "model": "gpt-5.4" },
    { "agentType": "reviewer", "model": "gpt-5.4" }
  ]
}
```

此层覆盖 `defaults.subagent`，但不直接指定 provider。

## Resolution Flow

推荐把解析链路拆成两步：

```text
route -> model name -> source/provider -> transport config
```

### Step 1. Resolve Route To Model

- `main` 默认取 `defaults.main`
- `subagent` 默认取 `defaults.subagent`
- `frontend` 默认取 `defaults.frontend`
- `review` 默认取 `defaults.review`
- 若存在更细粒度规则：
  - 先看 `agentModelRules`
  - 再看 route 默认

输出：

- `route`
- `model`

### Step 2. Resolve Model To Source

输入：

- `model`

算法：

1. 读取 `models[model]`
2. 若存在 `defaultSource`，直接使用
3. 若不存在 `defaultSource`：
   - 按 `priority` 升序选择第一个 source
4. 若有多个 source 拥有相同最高优先级：
   - 报配置冲突
   - 禁止静默选择

输出：

- `provider`
- `apiStyle`
- `baseUrl`
- `apiKey`
- `sourceResolutionReason`

### Step 3. Fallback

只有 source 解析或 transport 初始化失败时才进入 fallback。

允许 fallback 的场景：

- `defaultSource` 缺 key
- `defaultSource` key 过期
- `defaultSource` 明确健康检查失败
- `defaultSource` 明确拒绝该模型

fallback 规则：

1. 从当前 source 后续候选里按 `priority` 继续尝试
2. 所有 fallback 都必须记录原因
3. diagnostics 必须显示最终命中的 source

不允许的行为：

- 在无错误时随机切换 source
- 因为“看起来像更快/更便宜”而偷偷切换默认 source

## User Experience

### Model Picker

用户只看到：

- `gpt-5.4`
- `glm-4.5`

不默认展示：

- `openai_main`
- `minimax_proxy`
- `glm_direct`

高级模式或调试模式可附加展示：

- `glm-4.5 (resolved via minimax_proxy)`

### Main Agent

主代理默认模型来自 `defaults.main`。

- 用户通过 `/model glm-4.5` 覆盖当前会话模型时，只写模型名
- provider/source 不进入用户心智模型

### Subagent

`subagent` 默认模型来自 `defaults.subagent`。

- `subagent` 不直接选 provider
- `subagent` 只拿到模型名
- 实际 source 仍由 `models[model].defaultSource` 解析

### Doctor And Status

`doctor` / `status` 必须展示：

- route
- chosen model
- resolved provider/source
- apiStyle
- baseUrl
- key source
- fallback status

示例：

```text
route=subagent
model=glm-4.5
resolvedSource=minimax_proxy
providerType=openai-compatible
baseUrl=https://proxy.example.com/v1
fallback=no
```

## Compatibility Strategy

当前系统已存在：

- `taskRoutes.*.provider`
- `taskRoutes.*.apiStyle`
- `taskRoutes.*.model`
- `taskRoutes.*.baseUrl`
- `providerKeys`
- 简化配置 `providers/models/defaults`

建议兼容策略如下：

### Preferred New Path

新配置优先读取：

- `providers`
- `models`
- `defaults`
- 可选 `agentModelRules`

### Legacy Compatible Path

兼容保留：

- `taskRoutes.*.model`
- `taskRoutes.*.provider/apiStyle/baseUrl`
- `providerKeys`

建议优先级：

1. 显式 route override
2. `agentModelRules`
3. 新 `defaults/models/providers`
4. 旧 `taskRoutes`
5. 环境变量 fallback

说明：

- 旧低层配置仍然可以作为“强制 transport 覆盖层”
- 但产品层应逐步把用户编辑入口迁移到新模型

## Why This Is Better Than The Current Shape

与当前“model -> provider alias”的简化配置相比，新设计有这些优势：

- 能自然表达“模型族和 transport 来源不一致”
- 能显式承载同名模型多来源
- 能让 `/model`、模型选择器、主代理、`subagent` 真正只面对模型名
- 能让 fallback 可解释，不再依赖隐式猜测
- 能把 provider/source 的复杂性压回 transport 层

## Risks

### 1. Config Complexity Increases

风险：

- `models.sources` 比当前单值映射更复杂

缓解：

- UI 只展示模型名和 route 默认值
- provider/source 只在高级配置里暴露

### 2. Mixed Old/New Config May Drift

风险：

- 新旧配置并存时，用户可能不理解最终谁生效

缓解：

- status/doctor 明确展示配置来源
- 尽快把配置 UI 切到新模型

### 3. Silent Fallback Can Hide Errors

风险：

- 默认 source 坏了但系统自动切走，用户误以为仍在走原 source

缓解：

- fallback 必须带事件记录和状态展示

## Non-Goals

- 不在本设计中引入完整的外部网关策略引擎
- 不把按 token/cost 的智能 provider 调度做成默认行为
- 不在本设计中替代已有 provider adapter 边界
- 不在第一阶段改写所有历史配置和所有 UI 面板

## Recommended Next Step

按最小变更路线推进：

1. 先定义新的 schema 和 model registry
2. 再让 `/model`、picker、主代理、`subagent` 统一读取 registry
3. 最后把 route 和 diagnostics 切到“model -> source -> transport”的解析链路

## Implementation Snapshot

截至 2026-04-14，这份设计里已有一部分落地：

- `providers/models/defaults` 已接入 settings schema、normalize 和 route/source 解析链路。
- `/model`、模型选择器和 ConfigTool 的模型选项已开始统一读取 registry。
- Config UI 已开始迁到 `defaults.*`：
  - `main` 已拆成 “default model + transport override”
  - `subagent/frontend/review/explore/plan/guide/statusline` 已可直接写入 `defaults.*`
- agent 创建/编辑/列表展示中的“未设置模型”文案已开始切到 `subagent route default`，不再直接显示成 “inherit from parent (default)”
- `status/doctor` 已可展示：
  - chosen model
  - resolved source
  - model source（`defaults.*` vs `taskRoutes.*.model`）
  - 更具体的 config source label（如 `defaults.main`、`taskRoutes.main.provider`、对应 env 名）

当前仍未完全完成的部分：

- 更完整的 source fallback reason 展示
- 更系统的 deprecation messaging
- 更进一步收拢旧 `taskRoutes.*.model` 的用户心智负担
