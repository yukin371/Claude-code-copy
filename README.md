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

## 已验证能力

当前已经完成并经过验证的部分：

- 默认品牌切换为 `Neko Code`
- 默认配置目录、临时目录、tmux socket 与 Claude Code 隔离
- 默认关闭 analytics / telemetry，相关 sink 改为 no-op
- 保守的 Claude 配置迁移
  - 首次启动可从 `~/.claude` 导入核心配置到 `~/.neko-code`
  - 迁移范围包含全局配置、settings、credentials、用户 `CLAUDE.md`
  - 同步迁移用户自定义 `rules/`、`agents/`、`commands/`、`skills/`、`plans/`
- 隔离 smoke 已接入
  - 可把 `~/.claude` 迁入临时 `NEKO_CODE_CONFIG_DIR`
  - 可使用临时 plugin cache 跑只读 CLI / routing 诊断命令
- 任务路由已支持从 `settings.json` 读取 route 级 `provider` / `apiStyle` / `model` / `baseUrl`
- 主查询路径、helper 路径、route helper 已接入 route-aware transport
- 当存在全局 `ANTHROPIC_BASE_URL` 且未显式覆盖 route 时，默认任务路由可回退到 Anthropic 单上游
- 源码模式 `--print` / headless 主链路已恢复到真实可用
  - 已修补 headless 未等待 `runHeadless(...)` 的提前退出问题
  - 已补齐关键 `MACRO.*` bootstrap / 兜底
  - 已修补 OpenAI-compatible stream `.withResponse()` 兼容问题
- 使用迁移后的真实 Claude 配置回放 `bun src/entrypoints/cli.tsx -p --max-turns 1 "Reply with exactly OK"` 已可返回 `OK`
- Bun 工程依赖基线已补齐
- native build 基线已打通
  - `bun run build:native` 已可生成 `dist/neko-code.exe`
  - 编译产物已通过 `--version`、`--help` 验证
- `bun run typecheck` 已通过
- `bun run test:routing` 已通过
- `bun run smoke:claude-config` 已通过

## 当前状态

当前项目状态应理解为：

- `基础 CLI 可用`
- `基础 headless / --print 可用`
- `多 provider / 多 route 基础能力可用`
- `当前机器上的 native build 基线可用`
- `仍处于从源码快照向长期可维护版本收口的阶段`

换句话说：

- 这已经不是“无法运行的源码残片”
- 基本功能已经能跑起来并做真实 API 回放
- 但也还不是“完整恢复的上游源码仓库”

它更接近一个：

- 可运行
- 可继续开发
- 可用于迁移现有配置做逐步回归
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
bun src/entrypoints/cli.tsx -p --max-turns 1 "Reply with exactly OK"
bun run scripts/bun-tools.ts routes
bun run build:native
 bun run smoke:readonly-routing
bun run typecheck
bun run test:routing
bun run smoke:claude-config
```

这说明以下能力已经具备基本可用性：

- Bun 源码模式启动
- CLI 顶层参数解析
- provider/model 入口参数
- agents / plugin / mcp / doctor 等顶层命令注册
- 真实 `--print` / headless 单轮执行
- 配置迁移后的真实网关回放
- 基础任务路由诊断与回归
- 可读的 task route / querySource 路由诊断输出
- 只读 routing smoke，可断言 `direct-provider` / `single-upstream gateway` 两种模式
- 迁移后的隔离配置 smoke 也已覆盖并断言 `direct-provider` / `single-upstream gateway` 两种模式
- native build 编译与基础 CLI 自检

需要注意：

- `--print` 已验证主链路可用，但若显式设置过低的 `--max-budget-usd`，仍会因预算上限而退出
- 这类报错属于预算策略，不再是当前已修复的应用内执行链故障
- 本轮编译产物 `-p` 烟测遇到 API 连接失败；同一时刻源码模式也出现相同错误，因此暂不判定为 native build 特有问题

## 预计继续补完

当前最主要的缺失不在“启动入口”，而在“深层功能恢复”。

### 1. 高级交互与会话链路

- bridge / remote control 相关链路
- compact / context collapse 相关链路
- 更完整的 resume / continue / 长会话回归
- 更完整的 SDK 类型与控制协议导出

### 2. 插件、MCP 与周边恢复深度

- 更完整的 plugin 管理界面类型与行为
- 更多写路径 smoke 与真实插件回归
- MCP 写配置、刷新、严格校验之外的更深链路验证
- computer use 相关依赖或 shim 层

### 3. provider/router 与外部网关边界继续收口

- 继续补齐非主查询路径的 route-aware 行为
- 继续降低不同 provider 下的行为漂移
- 围绕“应用内只做任务路由，流量治理交给外部网关”补齐文档、样例和回归

### 4. 源码模式长期维护性

- 继续系统梳理剩余 `MACRO.*` 构建注入点
- 继续移除临时占位类型与兼容 shim
- 把更多“可降级但未完整恢复”的路径替换成真实实现

### 5. native build 到完整分发版的最后一段

- 补齐“安装后不依赖仓库源码路径”的本地分发 workflow
- 把编译产物 `-p` 烟测纳入稳定回归
- 继续判断哪些 ant-only 能力应显式裁剪，哪些应恢复真实实现

## 为什么先做“可运行”

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

在 Windows 上安装本地终端 launcher：

```powershell
bun run install:local-launcher
```

该脚本会：

- 使用 `scripts/local-compiled-launcher.ts` 编译本地 launcher
- 默认安装到 `~/.local/bin/neko.exe`
- 如有需要，把 `~/.local/bin` 加入用户 PATH

注意：

- 这是“本地终端直启”方案，不是完整 native release build
- 当前 launcher 仍依赖本机已安装 Bun，且依赖当前仓库源码仍存在
- PATH 更新后通常需要重新打开一个终端窗口

构建当前机器可用的 native binary：

```bash
bun run build:native
```

当前已验证：

- `dist/neko-code.exe --version`
- `dist/neko-code.exe --help`

当前仍待在 API 连通正常时复验：

- `dist/neko-code.exe -p --max-turns 1 "Reply with exactly OK"`

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

1. provider/router 主链路与真实回归继续收口
2. 高级交互链路与类型债继续收口

现阶段最值得继续推进的方向：

- 复制真实 Claude 配置做回归烟测，识别剩余运行时缺口
- 继续恢复高级交互链路和真实会话路径
- 逐步把 SDK 占位类型替换成真实结构
- 沿 `bridgeMessaging -> inboundMessages -> initReplBridge -> structuredIO` 主链路收口类型问题
- 系统梳理剩余 `MACRO.*` 构建注入点，提升源码模式直跑覆盖面
- 补齐任务级模型/API 路由与外部网关模式的回归验证

## 相关文档

- 路线图：[`docs/analysis/neko-code-roadmap.md`](docs/analysis/neko-code-roadmap.md)
- Provider 接入说明：[`docs/analysis/neko-code-provider-integration-guide.md`](docs/analysis/neko-code-provider-integration-guide.md)
- CLI 基线状态：[`docs/plans/2026-04-02-cli-baseline-status.md`](docs/plans/2026-04-02-cli-baseline-status.md)

## 说明

本仓库当前是反向补全中的工程快照，不代表官方发布版本。

如果你准备基于它继续开发，建议先接受下面这个前提：

- 它已经适合继续推进“可用版本”
- 但还不适合把“全仓源码完全恢复”当成已完成前提
