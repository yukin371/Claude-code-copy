# Neko Code

Neko Code 是一个从 Claude Code 源码快照反向补全出来的可运行项目。

当前目标不是复刻一个 100% 完整等价的官方仓库，而是先把它推进到：

- 可直接运行的 Bun CLI
- 默认关闭遥测和 1P 行为上报
- 支持多 API / 多 provider 共存
- 支持把任务路由到不同 provider / model / apiStyle / baseUrl
- 支持按任务类型路由不同模型，逐步接近类似 Oh My Opencode 的任务级模型分配体验
- 支持把现有 Claude Code 用户配置迁移到 Neko Code

## 项目方向

本项目当前围绕五条主线推进：

1. 品牌与目录隔离
2. 关闭遥测与最小化数据采集
3. 多 API / 多 provider 接入
4. 任务级 provider / model 路由
5. 按任务类型使用不同模型

核心设计目标：

- 让应用只负责任务路由，不内建长期负载均衡平台能力
- 把负载均衡、failover、key pool、重试等网关能力尽量下沉到外部聚合层
- 保留 Claude Code 的主交互体验和工具能力
- 逐步让主线程、subagent、review、前端修改等任务使用不同模型
- 在迁移成本尽可能低的前提下，把 Claude Code 配置平滑迁入 Neko Code

## 已完成进度

当前已经完成或基本完成的部分：

- 默认品牌切换为 `Neko Code`
- 默认配置目录、临时目录、tmux socket 与 Claude Code 隔离
- 保守的 Claude 配置迁移
  - 首次启动可从 `~/.claude` 导入核心配置到 `~/.neko-code`
  - 迁移范围包含全局配置、settings、credentials、用户 `CLAUDE.md`
  - 同步迁移用户自定义 `rules/`、`agents/`、`commands/`、`skills/`、`plans/`
- 新增隔离迁移 smoke
  - 可把 `~/.claude` 迁入临时 `NEKO_CODE_CONFIG_DIR`
  - 使用临时 plugin cache 跑一组只读 CLI / routing 诊断命令
- analytics 默认关闭，sink 改为 no-op
- 任务路由已支持从 `settings.json` 读取 route 级 provider / apiStyle / model / baseUrl
- query 主路径已按 route transport 切到 openai-compatible shim
- helper 路径已按任务 transport 走对应 provider 路由
- Bun 工程依赖基线已补齐
- 源码模式 CLI 基础入口已可运行
- `bun run typecheck` 已通过
- `bun run test:routing` 已通过

## 当前状态

当前项目状态应理解为：

- `CLI 基础启动可用`
- `依赖基线已补齐`
- `任务路由主链路已基本收口`
- `完整交互能力仍未完全恢复`

换句话说：

- 这已经不是“无法运行的源码残片”
- 但也还不是“完整恢复的上游源码仓库”

它更接近一个：

- 可运行
- 可继续开发
- 但仍存在若干缺失模块和占位类型的恢复中快照

## 当前可用部分

目前已验证可以直接运行的命令包括：

```bash
bun src/entrypoints/cli.tsx --version
bun src/entrypoints/cli.tsx --help
bun src/entrypoints/cli.tsx --provider gemini --help
bun src/entrypoints/cli.tsx --model sonnet --provider gemini --help
bun src/entrypoints/cli.tsx agents --help
bun src/entrypoints/cli.tsx plugin --help
bun src/entrypoints/cli.tsx mcp --help
bun src/entrypoints/cli.tsx doctor --help
bun run typecheck
bun run test:routing
bun run smoke:claude-config
```

这说明以下能力已经具备基本可用性：

- Bun 源码模式启动
- CLI 顶层参数解析
- provider/model 入口参数
- agents / plugin / mcp / doctor 等顶层命令注册

## 当前缺失与未完成部分

当前最主要的缺失不在“启动入口”，而在“深层功能恢复”。

### 1. 一部分功能目前只是可降级，不是完整恢复

已经补了若干占位模块和 graceful fallback，用于避免 CLI 因缺件直接崩溃。

这意味着某些功能当前的状态是：

- 入口存在
- 不会在模块解析时直接崩
- 但深层实现仍未完整恢复或仍待真实配置回归验证

### 2. 高级路径仍在恢复

目前仍在逐步恢复中的部分包括：

- bridge / remote control 相关链路
- compact / context collapse 相关链路
- 更完整的 plugin 管理界面类型与行为
- computer use 相关依赖或 shim 层
- 更完整的 SDK 类型与控制协议导出

### 3. 仍有部分构建期注入依赖待系统梳理

目前源码模式已经为若干 `MACRO.VERSION` / `MACRO.BUILD_TIME` 入口做了兜底，但还没有完成全仓梳理。

这意味着：

- 常用 CLI 帮助和版本命令已经可运行
- 但如果继续扩大“源码直跑”覆盖面，后续仍可能遇到尚未显式兜底的 `MACRO.*` 入口

## 为什么要先做“可运行”而不是“全量恢复”

因为项目当前最现实的推进方式是：

1. 先让 CLI 入口稳定可跑
2. 再补高频缺失模块
3. 再逐步收窄 SDK 和 bridge 类型
4. 最后继续恢复更宽泛的功能模块

如果一开始就追求全仓零错误，成本高且容易卡在大量不影响当前可用性的缺件上。

所以当前策略是：

- 优先修会导致 CLI 启动或常见命令崩溃的问题
- 对缺失模块先使用受控降级
- 后续再逐步替换成真实实现

## 运行方式

安装依赖：

```bash
bun install
```

查看版本：

```bash
bun src/entrypoints/cli.tsx --version
```

查看帮助：

```bash
bun src/entrypoints/cli.tsx --help
```

使用现有 Claude 配置做隔离 smoke：

```bash
bun run smoke:claude-config
```

该命令会：

- 从默认 `~/.claude` 读取可迁移配置
- 导入到临时 `NEKO_CODE_CONFIG_DIR`
- 使用临时 `CLAUDE_CODE_PLUGIN_CACHE_DIR` 运行只读命令矩阵
- 输出迁移文件列表、临时目录路径、每条命令的退出码和预览

## 当前推进重点

当前开发重点不是再补一层入口，而是继续收口这两类问题：

1. 高频缺失薄模块
2. bridge / SDK 类型收口

现阶段最值得继续推进的方向：

- 复制真实 Claude 配置做回归烟测，识别剩余运行时缺口
- 继续恢复高级交互链路和真实会话路径
- 逐步把 SDK 占位类型替换成真实结构
- 沿 `bridgeMessaging -> inboundMessages -> initReplBridge -> structuredIO` 主链路收口类型问题
- 系统梳理剩余 `MACRO.*` 构建注入点，提升源码模式直跑覆盖面

## 相关文档

- 路线图：[`docs/analysis/neko-code-roadmap.md`](docs/analysis/neko-code-roadmap.md)
- Provider 接入说明：[`docs/analysis/neko-code-provider-integration-guide.md`](docs/analysis/neko-code-provider-integration-guide.md)
- CLI 基线状态：[`docs/plans/2026-04-02-cli-baseline-status.md`](docs/plans/2026-04-02-cli-baseline-status.md)

## 说明

本仓库当前是反向补全中的工程快照，不代表官方发布版本。

如果你准备基于它继续开发，建议先接受下面这个前提：

- 它已经适合继续推进“可用版本”
- 但还不适合把“全仓源码完全恢复”当成已完成前提
