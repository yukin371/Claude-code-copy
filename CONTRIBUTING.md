# 项目开发与提交规范

本文档定义当前仓库的基本开发约定、变更边界和提交规则。

## 1. 基本原则

- 默认运行时是 `Bun`，不是 `npm` / `node`。
- 新增工具脚本优先放在 `scripts/`，默认通过 `bun run` 执行。
- 先沿既有链路改动，不要平行再造一套入口。
- 单次改动只解决一个明确问题，避免把无关重构混进来。
- 配置优先于硬编码，尤其是模型、provider、base URL、API key 相关逻辑。

## 2. 开发前检查

开始动手前，优先确认下面几项：

1. 先看相关文档，再搜代码。
2. 涉及多 API / 多模型时，先看 `docs/analysis/multi-api-provider-compatibility-dev-notes.md`。
3. 涉及 Bun 运行时或脚本时，先看 `docs/analysis/bun-runtime-guide.md`。
4. 涉及架构级改动时，先在 `docs/plans/` 建计划或补现有计划。

如果 GitNexus 工具可用：

- 修改函数、类、方法前先做 impact analysis。
- 提交前做 change detection，确认影响范围符合预期。

如果 GitNexus 工具不可用：

- 用 `rg`、`git diff`、定向 smoke test 补足影响面检查。

## 3. 代码改动约束

### 3.1 运行时与工具

- 优先使用 `bun`、`bun run`、`bunx`。
- 不要默认补 `package.json` 包装层。
- 允许直接使用 Bun 能力，例如 `bun:bundle`、`Bun.file`、`Bun.spawn`。

### 3.2 多 API / 多模型

- `taskRoutes` 是任务路由配置入口。
- `src/utils/model/taskRouting.ts` 是路由决策单点。
- `src/utils/model/providerMetadata.ts` 是 provider 默认元数据单点。
- `src/services/api/openaiCompatibleClient.ts` 是 OpenAI-compatible 传输层单点。
- 不要在调用点散落 provider、base URL、API key 解析逻辑。
- 不要在源码里硬编码具体模型名。

### 3.3 遥测与网络行为

- 新功能默认不要恢复运行时遥测初始化。
- 若确实要增加额外上报或远程行为，必须先说明目的、边界和开关。
- 模型 API、认证、远程设置等业务请求与遥测要明确区分。

### 3.4 文档同步

以下情况必须同步更新文档：

- 修改了架构主链路。
- 新增或调整了运行时约定。
- 新增了 provider / model / route 规则。
- 增加了新的脚本工具或诊断入口。

文档位置约定：

- `docs/analysis/` 放开发说明、约束、导航文档。
- `docs/plans/` 放阶段计划、实施计划、拆解清单。

## 4. 提交规范

### 4.1 提交格式

- 提交信息统一使用 Conventional Commits。
- 推荐格式：`type(scope): 中文说明`
- `type` 使用英文，说明部分使用中文。
- `scope` 保持简短，指向模块或主题，不要过度细分。

推荐的 `type`：

- `feat`：新增功能
- `fix`：缺陷修复
- `refactor`：不改变外部行为的重构或清理
- `docs`：文档或说明更新
- `test`：测试补充或测试调整
- `chore`：工具、脚本、构建、维护项

推荐的 `scope`：

- `telemetry`
- `api`
- `routing`
- `model`
- `runtime`
- `docs`
- `scripts`

推荐示例：

- `refactor(telemetry): 移除运行时遥测链路`
- `feat(api): 接入多 API 路由与兼容层`
- `docs(runtime): 补充 Bun 工具与开发文档`
- `docs(contrib): 补充项目开发与提交规范`

### 4.2 分批原则

- 一次提交只表达一个主题。
- 代码行为变更、架构清理、文档工具补充，尽量拆成独立 commit。
- 非直接相关的文件不要混入同一个 commit。

推荐拆分方式：

1. 运行时 / 遥测 / 生命周期清理
2. 多 API / 路由 / 兼容层接入
3. 文档 / 脚本 / 开发说明补充

如果使用 Conventional Commits，可对应为：

1. `refactor(telemetry): ...`
2. `feat(api): ...`
3. `docs(runtime): ...` 或 `chore(scripts): ...`

### 4.3 不应提交的内容

- 临时调试输出
- 无关格式化噪音
- 未使用的新文件
- 与当前主题无关的重命名或搬迁

## 5. 提交前检查

提交前至少完成以下检查：

1. `git diff --cached --stat` 确认暂存范围正确。
2. 运行最小必要 smoke test。
3. 若改了路由或 provider，至少验证一次相关模块可加载。
4. 若改了脚本或运行时约定，至少跑一次对应 Bun 命令。
5. 若改了架构入口，确认文档已经同步。

## 6. 推荐命令

- `git status --short`
- `git diff --stat`
- `git diff --cached --stat`
- `bun run scripts/bun-tools.ts doctor`
- `bun run scripts/bun-tools.ts providers`
- `bun run scripts/bun-tools.ts health [provider]`

## 7. 当前阶段的工作重点

当前仓库优先级如下：

1. 稳定多 API / 多模型主链路
2. 保持运行时以 Bun 为主
3. 避免遥测链路回流
4. 用分批提交维持可审查的历史
