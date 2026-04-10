# Neko Code

Neko Code 是一个从上游 CLI 源码快照反向补全出来的可运行项目。

当前目标不是复刻一个 100% 完整等价的官方仓库，而是先把它推进到：

- 可直接运行的 Bun CLI
- 默认关闭遥测和 1P 行为上报
- 支持多 API / 多 provider 共存
- 支持把任务路由到不同 provider / model / apiStyle / baseUrl
- 支持按任务类型路由不同模型，逐步接近类似 Oh My Opencode 的任务级模型分配体验
- 支持把现有历史配置迁移到 Neko Code

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
- 保留上游 CLI 的主交互体验和工具能力
- 逐步让主线程、subagent、review、前端修改等任务使用不同模型
- 在迁移成本尽可能低的前提下，把历史配置平滑迁入 Neko Code

## 已验证能力

当前已经完成并经过验证的部分：

- 默认品牌切换为 `Neko Code`
- 默认配置目录、临时目录、tmux socket 与历史目录隔离
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
- 使用迁移后的真实历史配置回放 `bun src/entrypoints/cli.tsx -p --max-turns 1 "Reply with exactly OK"` 已可返回 `OK`
- Bun 工程依赖基线已补齐
- native build 基线已打通
- `bun run build:native` 已可生成 `dist/neko-code.exe`
  - 编译产物已通过 `--version`、`--help` 验证
  - 编译产物在脱离仓库路径的临时目录下，已通过 `-p --max-turns 1 "Reply with exactly OK"` 验证
- 本地安装/PATH workflow 已通过
  - 安装脚本产出的 `neko.exe` 已在临时安装目录和真实 PATH 环境中通过 `--version`、`--help` 与 `-p --max-turns 1 "Reply with exactly OK"` 验证
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
bun src/entrypoints/cli.tsx install --help
bun src/entrypoints/cli.tsx update --help
bun run install:local-beta
bun src/entrypoints/cli.tsx -p --max-turns 1 "Reply with exactly OK"
bun run scripts/bun-tools.ts routes
bun run build:native
bun run build:local-release-bundle
bun run stage:release-candidate
bun run stage:release-publication
bun run stage:release-deploy
bun run release:deploy-publish -- --target-root C:\path\to\publish-root
bun run stage:github-release
bun run scripts/publish-github-release.ts --version 0.1.0 --dry-run
bun run release:apply-signed-artifact -- --signed-binary C:\path\to\signed.exe
bun run smoke:signed-release-publication-workflow
bun run smoke:stage-github-release
bun run smoke:publish-github-release
bun run smoke:promote-github-release
bun run smoke:native-update-cli-github-release
bun run smoke:release-deploy-publish
bun run smoke:native-update-cli-release-deploy
bun run smoke:readonly-routing
bun run smoke:distribution-readiness
bun run smoke:native-installer-local-bundle
bun run smoke:native-installer-release-publication
bun run smoke:release-preflight
bun run analyze:text-hygiene
bun run check:text-hygiene
bun run typecheck
bun run test:routing
bun run smoke:claude-config
```

这说明以下能力已经具备基本可用性：

- Bun 源码模式启动
- CLI 顶层参数解析
- provider/model 入口参数
- agents / plugin / mcp / doctor 等顶层命令注册
- install / update 等分发相关命令帮助入口
- 真实 `--print` / headless 单轮执行
- 配置迁移后的真实网关回放
- 基础任务路由诊断与回归
- 可读的 task route / querySource 路由诊断输出
- 只读 routing smoke，可断言 `direct-provider` / `single-upstream gateway` 两种模式
- 迁移后的隔离配置 smoke 也已覆盖并断言 `direct-provider` / `single-upstream gateway` 两种模式
- native build 编译与基础 CLI 自检
- 本地 release bundle 已可生成
- native installer 已可在隔离环境中从本地 release bundle 下载并安装
- unsigned release candidate staging 已可生成

需要注意：

- `--print` 已验证主链路可用，但若显式设置过低的 `--max-budget-usd`，仍会因预算上限而退出
- 这类报错属于预算策略，不再是当前已修复的应用内执行链故障

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

在 Windows 上安装本地终端 launcher（无需 Bun 源码入口）：

```powershell
bun run install:local-launcher
```

该脚本会：

- 先运行 `bun run build:native` 生成主命令 `dist/neko-code.exe`
  - 把 `neko-code.exe` 复制为 `~/.local/bin/neko.exe`（可视为真正的 `neko` 命令）
  - 编译一个辅助 launcher `neko-launcher.exe` 来桥接旧 Bun 入口，PATH 只需包含目录即可调用 `neko.exe`
- 提示把 `~/.local/bin` 加入 PATH，完成后 `neko` 命令就直接调用复制的 native binary

注意：

- launcher 本身只是辅助进程；主可执行体是 `dist/neko-code.exe`（复制到 `~/.local/bin/neko.exe` 供 PATH 使用）
- 故整体流程仍不依赖 Bun 或源码入口，只要 PATH 中有 `neko.exe`，即可直接运行

注意：

- 这是“本地发行”的最小可用入口，适合作为 native distribution 的快速验收
- 生产级发布还需补齐完整安装器、路径注册和签名

注意：

- 这是“本地终端直启”方案，不是完整 native release build
- `neko` 主命令直接运行复制后的 native binary，不再依赖 Bun 或仓库源码路径
- `neko-launcher.exe` 只是保留的兼容桥接件，不是 PATH 上的主入口
- PATH 更新后通常需要重新打开一个终端窗口

本地候选发布物预检：

```bash
bun run smoke:release-preflight
```

该 gate 会顺序执行：

- `bun run build:native`
- `bun run smoke:distribution-readiness`
- `bun run scripts/native-installer-local-bundle-smoke.ts --skip-build`
- `bun run scripts/stage-native-installer.ts --skip-stage-publication`
- `bun run scripts/stage-native-installer-smoke.ts --skip-stage-native-installer`
- 校验 `dist/neko-code.exe` 已生成且非空
- 校验 `scripts/install-local-launcher.ps1` 仍以 `neko.exe` 作为主安装命令
- 校验 README 与关键 release-facing 提示未回退到旧 `claude` 主入口

本地 release bundle / installer 烟测：

```bash
bun run build:local-release-bundle
bun run smoke:native-installer-local-bundle
bun run smoke:native-installer-release-publication
```

这两步会：

- 生成 `dist/release-local/`，写入 `latest` / `stable` channel 文件、`manifest.json` 和当前平台产物
- 通过 `NEKO_CODE_NATIVE_INSTALLER_BASE_URL` 把 native installer 指向本地临时 HTTP 源
- 在隔离的 `HOME` / `XDG_*` / `NEKO_CODE_CONFIG_DIR` 环境里真实执行下载、安装和帮助入口验证

其中 `bun run smoke:native-installer-release-publication` 会直接消费 `dist/release-publication/<version>/`，验证 publication 目录已与现有 native installer 下载布局兼容。

unsigned release candidate staging：

```bash
bun run stage:release-candidate
```

该命令会生成 `dist/release-candidate/<version>/`，包含：

- `neko-code-<version>-<platform>-unsigned.exe`
- `bundle/` 下的 channel 文件、manifest 与 installer 输入产物
- `install-local-launcher.ps1`
- `release-candidate.json`
- `SHA256SUMS.txt`
- `publish-ready/channels/latest.json` 和 `publish-ready/channels/stable.json`（version/platform/artifact/sha256/signed=false）
- `signing-manifest.json`（声明 unsigned 输入、预期 signed 输出与 sha256）

publication staging：

```bash
bun run stage:release-publication
```

该命令会读取 `dist/release-candidate/<version>/`，生成 `dist/release-publication/<version>/`，包含：

- 与 native installer 兼容的发布目录：`latest`、`stable`、`<version>/manifest.json`、`<version>/<platform>/neko(.exe)`
- `publish-ready/channels/latest.json` 和 `publish-ready/channels/stable.json`
- `release-publication.json`（记录当前发布目录实际使用的是 signed 还是 unsigned 输入、canonical binary 路径与 sha256）

portable native installer staging：

```bash
bun run stage:native-installer
```

该命令会读取 `dist/release-publication/<version>/`，生成 `dist/native-installer/<version>/`，包含：

- `package/neko.exe`
- `package/install.ps1`
- `package/install.cmd`
- `package/installer-manifest.json`
- `nsis/neko-code-installer.nsi`
- `nsis/build-installer.ps1`
- `nsis/nsis-metadata.json`
- `neko-code-<version>-<platform>-portable-installer.zip`
- `native-installer.json`
- `SHA256SUMS.txt`

其中 `bun run smoke:stage-native-installer` 会先解压 `portable-installer.zip`，再在临时目录里真实执行 `install.ps1`，把预编译 `neko.exe` 安装到隔离 `bin/` 后校验 `--version` / `--help` / `update --help`；同时会对 `NSIS` 构建脚本执行 dry-run，确认后续可接 `makensis` 产出真正 setup.exe。

本地 beta 安装（NSIS setup）：

```powershell
bun run install:local-beta
```

该命令会：

- 先执行 `stage-native-installer`
- 调用 `dist/native-installer/<version>/nsis/build-installer.ps1` 真实构建 `setup.exe`
- 静默卸载旧的 `%LOCALAPPDATA%\\NekoCode\\bin` 安装（如存在）
- 静默安装新的 beta 版本
- 自动校验已安装的 `neko.exe --version`、`neko.exe --help`、`neko.exe update --help`

需要注意：

- 这一步依赖本机已安装 `NSIS` / `makensis`
- 当前得到的是“本机可体验的 unsigned beta 安装包”，不是正式签名发布版

signed artifact 接入口：

```bash
bun run release:apply-signed-artifact -- --signed-binary C:\path\to\signed.exe
```

该命令会把外部签名后的 exe 放入 `dist/release-candidate/<version>/signed/` 既定路径，再自动重建 `dist/release-publication/<version>/`。
如果签名产物存在，publication metadata 与 channel metadata 会自动切到 `signed=true` / `signingStatus=signed`。

deploy staging：

```bash
bun run stage:release-deploy
```

该命令会读取 `dist/release-publication/<version>/`，生成 `dist/release-deploy/<version>/`，包含：

- `payload/`：可直接映射到对象存储或下载页根目录的发布内容
- `upload-manifest.json`：声明每个 payload 文件应该上传到的目标相对路径
- `release-deploy.json`：说明当前 deploy 目录使用的签名状态、主 binary、payload 指针与上传入口

真正发布到本地镜像目录时，可以直接执行：

```bash
bun run release:deploy-publish -- --target-root C:\path\to\publish-root
```

该命令会严格按 `upload-manifest.json` 把 `payload/` 映射到目标根目录，等价于把 deploy 目录发布成一个可被 native installer / `neko update` 消费的静态发布源。

其中 `bun run smoke:release-deploy-publish` 会严格按 `upload-manifest.json` 把 `payload/` 映射到本地 HTTP 根目录，再让 native installer 真实下载安装，验证 deploy 目录已经足够作为发布上传输入。

其中 `bun run smoke:native-update-cli-release-deploy` 会在隔离环境里先从 deploy 根目录完成 native 安装，再直接执行已安装的 `neko update`，验证 CLI 自身的 native update 路径能消费这套本地发布源。

CI 骨架：

- [release-candidate.yml](.github/workflows/release-candidate.yml)
- [release-signed-publication.yml](.github/workflows/release-signed-publication.yml)
- [github-release-publish.yml](.github/workflows/github-release-publish.yml)
- [github-release-promote.yml](.github/workflows/github-release-promote.yml)
- 当前会在 `windows-latest` 上执行 `typecheck`、`smoke:release-preflight`、`stage-release-candidate`、`stage-release-publication`、`stage:native-installer`、`stage-release-deploy`
- 最终上传 unsigned release candidate artifact、`publish-ready` metadata artifact、`release-publication` artifact、`native-installer` artifact，以及 `release-deploy` artifact
- `release-signed-publication.yml` 可手动输入 version、unsigned RC 所在 run id、signed exe 所在 run id 与 artifact 名称，自动下载两侧 artifact，执行 `apply-signed-release-artifact -> stage:native-installer -> stage-release-deploy`，再跑 signed publication / installer / deploy / native update smoke，并重新上传 signed 版 `release-candidate`、`release-publication`、`native-installer`、`release-deploy`
- 本地也可先跑 `bun run smoke:signed-release-publication-workflow`，模拟 GitHub 下载 unsigned artifact 与 signed exe 后的整条 signed publication/deploy 流程
- `stage:github-release` 会把 signed candidate/publication/deploy/native-installer 产物整理成 `dist/github-release/<version>/`，其中包含 `portable-installer.zip`，输出 GitHub Release 可上传资产、checksums 和 release notes
- `github-release-publish.yml` 可手动输入 version 与 signed publication run id；它会下载 signed artifacts，执行 `stage:github-release`，校验 `smoke:stage-github-release` / `smoke:publish-github-release`，然后创建或更新 `v<version>` GitHub Release
- `scripts/publish-github-release.ts` 负责真正的 GitHub Release 发布命令拼装；首次创建 release 时会连同所有 staged assets 一起上传，不会出现“创建成功但没有资产”的空 release
- `github-release-promote.yml` 可在已有 `v<version>` release 上单独调整 `draft` / `prerelease` / `latest`，把 prerelease 升级为正式 stable，或把草稿 release 发布出去
- `scripts/promote-github-release.ts` 现在通过 `gh api` 显式 PATCH `draft` / `prerelease` / `make_latest`，避免 promotion 继续依赖 `gh release edit` 的隐式 flag 行为
- `smoke:native-update-cli-github-release` 会用本地假 GitHub Releases API 校验：已安装的 `neko update` 能直接消费 GitHub Release 资产
- `smoke:promote-github-release` 会校验 GitHub Release promotion 命令行计划，避免 promote workflow 参数漂移

GitHub Release 作为 native update 源：

- 设置 `NEKO_CODE_NATIVE_INSTALLER_GITHUB_REPO=<owner>/<repo>` 后，native installer 与 `neko update` 会优先从 GitHub Releases 解析版本与资产
- `stable` 走 GitHub `releases/latest`
- `latest` 走 Releases 列表里的最新非 draft 发布（允许 prerelease）
- 如需本地/测试替身，可额外设置 `NEKO_CODE_NATIVE_INSTALLER_GITHUB_API_BASE_URL`

需要注意：

- 该 gate 代表“本地候选发布物已具备基本自检”
- 它不会把签名服务、NSIS toolchain、发布流水线、真实 auto-update 渠道缺失判成失败
- 上述几项仍是正式发布前的外部 blocker

构建当前机器可用的 native binary：

```bash
bun run build:native
```

当前已验证：

- `dist/neko-code.exe --version`
- `dist/neko-code.exe --help`

当前仍待在 API 连通正常时复验：

- `dist/neko-code.exe -p --max-turns 1 "Reply with exactly OK"`

使用现有历史配置做隔离 smoke：

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

- 复制真实历史配置做回归烟测，识别剩余运行时缺口
- 继续恢复高级交互链路和真实会话路径
- 逐步把 SDK 占位类型替换成真实结构
- 沿 `bridgeMessaging -> inboundMessages -> initReplBridge -> structuredIO` 主链路收口类型问题
- 系统梳理剩余 `MACRO.*` 构建注入点，提升源码模式直跑覆盖面
- 补齐任务级模型/API 路由与外部网关模式的回归验证

## 相关文档

- 路线图：[`docs/analysis/neko-code-roadmap.md`](docs/analysis/neko-code-roadmap.md)
- Provider 接入说明：[`docs/analysis/neko-code-provider-integration-guide.md`](docs/analysis/neko-code-provider-integration-guide.md)
- 多提供商 key/模型策略/监控设计：[`docs/analysis/neko-code-multi-provider-keys-and-monitoring.md`](docs/analysis/neko-code-multi-provider-keys-and-monitoring.md)
- CLI 基线状态：[`docs/plans/2026-04-02-cli-baseline-status.md`](docs/plans/2026-04-02-cli-baseline-status.md)

## 说明

本仓库当前是反向补全中的工程快照，不代表官方发布版本。

如果你准备基于它继续开发，建议先接受下面这个前提：

- 它已经适合继续推进“可用版本”
- 但还不适合把“全仓源码完全恢复”当成已完成前提
