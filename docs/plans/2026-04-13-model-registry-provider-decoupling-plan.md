日期：2026-04-13

## Goal

- 落地“用户和代理只选模型名，系统再解析实际 source/provider”的配置与路由模型。
- 在不破坏现有 `taskRoutes/providerKeys` 工作流的前提下，逐步把系统迁到新的 model registry。
- 明确主代理和 `subagent` 的默认模型来源与诊断方式。

## Scope

- in:
  - schema 扩展：`providers`、`models.sources`、`defaultSource`
  - model registry 构建
  - route 到 model 的默认选择
  - model 到 source 的解析
  - `/model`、模型选择器、诊断信息接入
  - 向后兼容 `taskRoutes/providerKeys`
- out:
  - 不重写所有 provider adapter
  - 不把组织级网关调度引入应用内
  - 不在本阶段设计复杂成本/性能自动择优

## Current State

- 简化配置已接入读取链路，但当前 `models` 更接近 “model -> provider alias”。
- 模型列表主要从 `providerKeys/taskRoutes/taskRouteRules` 汇总，而不是从一等 model registry 汇总。
- route 和 `/model` 相关逻辑仍然存在“由模型反推 provider”的行为。
- Config UI / ConfigTool 已开始迁到 `defaults.*`，但仍保留 `taskRoutes.*` 作为 transport override 兼容层。
- `status/doctor` 已能展示 `resolved source`，并区分模型来自 `defaults.*` 还是显式 `taskRoutes.*.model`。

## Progress Update

- 已完成/已部分完成：
  - schema 扩展：`providers`、`models.sources`、`defaultSource`、`defaults.*`
  - model registry 已接入模型列表与 `/model` 相关选择面
  - route -> model -> source 的最小链路已打通
  - `status/doctor` 已展示 chosen model、resolved source 与具体 config source label
  - Config UI 已支持编辑 `defaults.main`，并新增其余 route 的 `defaults.*` 默认模型入口
  - ConfigTool 已支持 `defaults.main/subagent/frontend/review/explore/plan/guide/statusline`
  - agent UI / `claude agents` 展示已开始改用 `subagent route default` 语义，未设置 agent model 时不再默认渲染成“inherit”
- 当前剩余：
  - 继续压缩旧 `taskRoutes.*.model` 心智负担，只保留其兼容/高级 override 角色
  - 继续同步 README / design docs / user-facing 文案
  - 如后续引入 fallback 细化策略，继续把 fallback reason 接入 diagnostics
- 本轮补充：
  - `/model` picker、ConfigTool model section、CLI `--fallback-model` help、tips 等剩余用户可见文案已继续统一到 `main model` / route default 语义

## Target State

最终目标链路：

```text
defaults / route rule
  -> model name
  -> model registry entry
  -> resolved source/provider
  -> transport config
```

用户侧默认感知：

- 只看到模型名
- 主代理默认模型由 `defaults.main` 决定
- `subagent` 默认模型由 `defaults.subagent` 决定
- diagnostics 可以解释实际 source

## Milestones

### M1. Schema And Registry

目标：

- 增加一等 `providers` 和新 `models` schema
- 构建统一 model registry

工作项：

- 在 `src/utils/settings/types.ts` 增加：
  - `providers`
  - `models.*.sources`
  - `models.*.defaultSource`
  - 可选 `agentModelRules`
- 保留旧 schema，不破坏现有设置文件
- 在 `src/utils/model/` 下新增 registry 层，统一汇总：
  - model name
  - candidate sources
  - default source

验收标准：

- 给定新配置，系统可构建一份稳定的全局 model registry
- 同名模型多来源时，registry 可判断默认来源或报冲突

### M2. Model Selection Surface

目标：

- 让模型选择入口只依赖 registry，不再从低层配置拼凑模型列表

工作项：

- 更新模型选项来源：
  - `/model`
  - Model picker
  - Config tool 的 model 说明
- 保留对旧配置的补充兼容，但新 registry 为主

验收标准：

- 模型选择器展示的列表来自全局 registry
- 用户看不到 provider id
- 主代理和 `subagent` 都能拿到一致的模型列表

### M3. Route Resolution Refactor

目标：

- route 只决定模型，不直接耦合 provider/source

工作项：

- 改造 route 解析：
  - `defaults.main`
  - `defaults.subagent`
  - `defaults.frontend`
  - `defaults.review`
- 如引入 `agentModelRules`，在此层覆盖
- route 输出改为：
  - `route`
  - `model`

验收标准：

- 主代理默认模型走 `defaults.main`
- `subagent` 默认模型走 `defaults.subagent`
- route 层不再依赖“由模型反推 provider”

### M4. Source Resolution And Transport Wiring

目标：

- 在 route 之后新增 model -> source 解析层

工作项：

- 新增 `resolveModelSource(model)` 逻辑
- 支持：
  - `defaultSource`
  - `priority`
  - fallback
  - source 冲突报错
- 将解析结果接入 transport config 构建

验收标准：

- `glm-4.5` 可默认解析到 `minimax_proxy`
- 默认 source 缺 key 或失效时可按优先级回退
- 冲突时不再静默猜测

### M5. Diagnostics And UI Alignment

目标：

- 让最终行为可观察、可解释

工作项：

- 更新 `doctor` / `status`：
  - chosen model
  - resolved source
  - provider type
  - baseUrl
  - fallback status
- 更新 Config UI：
  - 默认编辑 `defaults.*`
  - 高级页才展示 provider/source

验收标准：

- 用户能明确看到“当前模型”和“当前实际 source”
- 新旧配置混用时可看出最终生效来源

当前进展：

- `doctor/status` 已能解释 chosen model、resolved source、model source 与 config source。
- Config UI 已开始从 `taskRoutes.main` 迁到 `defaults.* + transport override`。

## Compatibility Plan

### Stage 0. Read-Only Compatibility

策略：

- 先加入新 schema 与 registry
- 不立刻删除旧 `taskRoutes/providerKeys`
- 旧配置仍可工作

规则：

- 若新 `models/providers/defaults` 存在，优先走新链路
- 若不存在，回退到旧配置行为

### Stage 1. Bridge Legacy Config Into Registry

策略：

- 用兼容层把旧配置映射到临时 registry 结构

映射建议：

- 旧 `providerKeys[].models` -> registry candidate sources
- 旧 `taskRoutes.*.model` -> route 默认模型
- 旧 `taskRoutes.*.provider/apiStyle/baseUrl` -> source 强制覆盖

收益：

- `/model` 和模型选择器可以尽快统一到 registry 读取

### Stage 2. Prefer New Writes

策略：

- Config UI 和配置工具优先写新结构
- 旧低层配置只作为兼容和高级强制覆盖

### Stage 3. Deprecation Messaging

策略：

- 在 diagnostics 和文档中提示：
  - `taskRoutes/providerKeys` 仍支持
  - 但推荐迁到 `providers/models/defaults`

## Suggested File-Level Changes

建议优先改这些文件：

- `src/utils/settings/types.ts`
  - 新 schema
- `src/utils/settings/simplifiedModelConfig.ts`
  - 简化配置展开逻辑需要兼容新 shape
- `src/utils/model/`
  - 新增或扩展 registry/source resolution 模块
- `src/utils/model/modelOptions.ts`
  - 改为从 registry 提供模型名列表
- `src/utils/model/taskRouting.ts`
  - route 输出 model，再解析 source
- `src/utils/status.tsx`
  - 展示 chosen model 和 resolved source
- `src/components/Settings/Config.tsx`
  - 从编辑 `taskRoutes.main` 逐步迁到编辑 `defaults.*`
- `src/tools/ConfigTool/prompt.ts`
  - 模型说明改为从 registry 导出

## Open Questions

### 1. `providers` 是否允许内联 `models`

可选方案：

- A. 保持 `providers` 纯 transport，`models` 单独声明来源
- B. 允许 `providers.*.models`，再编译成 registry

建议：

- 优先 A

原因：

- 避免“provider transport”和“用户可见模型目录”混在一起
- 同名模型多来源时更容易表达

### 2. 是否保留 `providerKeys`

建议：

- 短期保留
- 中期让其退化为 transport credential 层的兼容表示

### 3. fallback 是否默认开启

建议：

- 默认只在 source 失效时开启
- 默认不开启基于成本或性能的动态切换

## Test Plan

### Unit Tests

- model registry 构建：
  - 单模型单来源
  - 单模型多来源含 `defaultSource`
  - 单模型多来源无 `defaultSource`，按 `priority`
  - 并列优先级冲突
- route 解析：
  - `defaults.main`
  - `defaults.subagent`
  - `agentModelRules`
- source 解析：
  - key 缺失
  - provider 不存在
  - fallback 命中

### Integration Tests

- 新配置文件可通过 schema 校验并完成 route/source 解析
- `/model` 选择 registry 中的模型后，最终请求落到预期 source
- `subagent` 默认使用 `defaults.subagent`
- `doctor` 输出显示最终 source

### Migration Tests

- 旧 `taskRoutes/providerKeys` 仍可工作
- 新旧混用时优先级符合预期
- Config UI 不会把新配置意外降级覆盖为旧配置

## Risks

- 新旧配置双轨期内，配置来源解释会更复杂
- route/source 双层解析会引入更多状态，需要强化 diagnostics
- 如果不及时调整 UI，用户仍会被旧低层入口误导

## Recommended Order

建议按以下顺序落地：

1. schema + registry
2. model picker + `/model`
3. route -> model
4. model -> source
5. diagnostics
6. Config UI

## Exit Criteria

满足以下条件即可认为第一阶段完成：

- 主代理和 `subagent` 都能只通过模型名工作
- 模型列表来自统一 registry
- 同名模型多来源时具备明确默认来源和 fallback 规则
- `doctor/status` 能解释最终命中的 source
- 旧配置仍可运行，且有清晰迁移路径
