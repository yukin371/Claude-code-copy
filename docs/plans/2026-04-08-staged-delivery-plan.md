# Neko Code 分阶段交付计划

日期：2026-04-08

## Goal

- 把当前“可运行但仍在收口”的仓库，推进成一个可以按阶段持续交付的项目。
- 明确每个阶段的目标、边界、依赖关系、验证方式和退出条件。
- 后续推进时默认按阶段执行，而不是每一轮都重新判断“下一步到底先做什么”。

## Scope

- in:
  - 为当前 roadmap 提供一个稳定的阶段执行顺序
  - 定义每个阶段的完成边界、禁止扩张项和进入下一阶段的条件
  - 约束“基础可用”“终端直启”“native build”“完整可迁移版本”之间的关系
- out:
  - 不在本计划里展开每个源码文件的具体实现细节
  - 不把所有长期想法都塞进当前阶段
  - 不把“未来可能有价值的优化”提前当作阶段阻塞项

## Constraints

- 阶段必须串行推进，除非上游阶段只剩低风险尾项且不阻塞下游主路径。
- 每个阶段都必须有明确的 out-of-scope，避免边做边膨胀。
- 阶段切换必须基于验证结果和文档状态，而不是“感觉差不多了”。
- 每阶段结束时必须同步：
  - `docs/analysis/neko-code-roadmap.md`
  - 必要的 `README.md`
  - 必要的 plan / ADR / MODULE 文档

## 当前工作区说明

- 当前工作区中的大量 `M` / `??` 文件，来自此前多轮代理连续推进，不是用户手工编辑。
- 这批改动已经跨越：
  - Phase 3 状态型 smoke / 系统回归
  - Phase 4 本地分发、release candidate、publication、deploy、GitHub Release workflow
  - release-facing 文案、品牌收口、配置路径与 provider/router 辅助修补
- 因为本计划此前只写阶段目标与 exit conditions，没有同步“文件面触达范围”，所以看起来像 roadmap 没覆盖这些改动。
- 具体分组说明见：
  - [2026-04-09-worktree-change-inventory.md](./2026-04-09-worktree-change-inventory.md)

## Phase Rules

### 阶段切换规则

- 只有满足当前阶段的 Exit Conditions，才允许默认进入下一阶段。
- 如果当前阶段出现新的 blocker，先记录到当前阶段，不直接跳到别的阶段规避。
- 如果某项工作不属于当前阶段的 in-scope，默认放回 roadmap 或下一阶段，不临时插入。

### 阶段完成定义

一个阶段只有在同时满足以下条件时，才算完成：

1. 本阶段定义的核心能力已落地
2. 本阶段验证命令已执行或阻塞已说明
3. 相关文档已同步
4. 剩余问题不再阻塞下一阶段主目标

## Design

## Phase 0. 已完成基线

### Status

- completed

### Goal

- 让源码模式从“残片不可跑”进入“基础 CLI 与基础 headless 可跑”

### Delivered

- 品牌、目录、配置迁移和 telemetry 默认关闭
- Bun CLI 基础入口恢复
- `--print` / headless 主链基础恢复
- 一批 smoke / harness 已建立

### Exit Conditions

- `bun run typecheck`
- `bun run test:routing`
- `bun run smoke:claude-config`
- 真实 `bun src/entrypoints/cli.tsx -p --max-turns 1 "Reply with exactly OK"` 可回放成功

## Phase 1. 终端直启最小闭环

### Status

- completed

### Goal

- 先满足“像 Claude 一样可以直接在终端输入命令运行”的最低目标，即使此时还不是完整分发版。

### In Scope

- 本地 launcher 可执行
- 本地 launcher 可安装到 PATH 或提供明确的终端调用 workflow
- launcher 与源码入口行为一致的最小验证
- 明确 native build 阻塞清单

### Out Of Scope

- 不要求这阶段就产出真正单文件正式发布版
- 不要求所有 optional provider 依赖都在这一阶段恢复
- 不要求 installer / auto-update / shell integration 全量收口

### Must Deliver

- 一个稳定的本地 launcher 命令入口
- 一份“本地终端直启”使用说明
- 一份 native build 阻塞清单，并按三类归档：
  - 缺失模块
  - 缺失依赖
  - 可裁剪 / ant-only / 非当前目标功能

### Current Progress

- 已有 `scripts/local-compiled-launcher.ts`
- 已有 `scripts/install-local-launcher.ps1`
- 已有 `bun run install:local-launcher`
- 已在临时安装目录验证安装脚本产出的 `neko.exe` 可运行 `--version`、`--help` 和单轮 `-p`
- 已在真实用户目录 `C:\Users\yukin\.local\bin\neko.exe` 完成安装
- 已验证新 shell 中可直接执行 `neko --version` 与 `neko --help`
- 已验证 PATH 上的 `neko -p --max-turns 1 "Reply with exactly OK"` 可返回 `OK`
- 已新增 native build blocker 分类清单：
  - [2026-04-08-native-build-blockers.md](./2026-04-08-native-build-blockers.md)
- 已完成 `bun run build:native`
- 已验证编译产物 `dist/neko-code.exe` 可运行 `--version` 与 `--help`

### Validation

- launcher `--version`
- launcher `--help`
- launcher `-p --max-turns 1 "Reply with exactly OK"`
- 从新终端直接调用命令，不依赖手动输入 `bun src/entrypoints/cli.tsx`

### Exit Conditions

- 用户可在当前机器上通过终端命令直接启动 Neko Code
- 终端直启 workflow 已写入文档
- native build 阻塞清单已完整记录并分类

### Must Not Expand Into

- 真正发布版安装器
- 全量 native build 收口
- 所有 UI / bridge / plugin 深层问题

### Next Phase Entry

- 本地终端直启已可用
- native build 阻塞项已可分批处理，而不是继续靠临时摸索

## Phase 2. provider/router 闭环

### Status

- completed

### Goal

- 把任务级 provider/model/api 路由真正收口成“主路径和关键辅助路径一致”的状态。

### In Scope

- 主查询路径、helper 路径、sideQuery、token estimation 等 route-aware 行为补齐
- Anthropic 直连与 OpenAI-compatible gateway 两种模式回归
- 最小应用内 fallback 边界收口

### Out Of Scope

- 不扩张应用内负载均衡平台能力
- 不在应用内继续做复杂 key pool / 熔断策略平台化
- 不把 plugin / MCP 深层状态问题混进来

### Must Deliver

- provider/router 相关行为矩阵
- “直连 provider” 与 “外部 gateway” 两种模式的最小回归集
- 文档中明确的网关边界

### Validation

- `bun run test:routing`
- route helper / diagnostics 命令
- 至少一组真实 headless 回放
- 编译产物链路验证失败时，必须先和源码模式做对照，避免把外部 API/网络抖动误判成 router 回归

### Exit Conditions

- 任务级路由行为在主路径和关键辅助路径上保持一致
- 外部网关与本地 fallback 的职责边界已经稳定
- 不再因 provider/router 漂移阻塞后续状态型链路验证

### Completion Notes

- 已补齐主查询、`sideQuery`、token estimation、MCP truncation、ToolSearch auto-threshold 等关键辅助路径的 `querySource` / route 透传。
- 已修补 ToolSearch deferred-tools token 计数缓存、token-count VCR、通用 API VCR 的 route/model/context 维度键，避免不同任务路由误复用旧缓存。
- route diagnostics、status matrix、只读 smoke、claude-config smoke 现已覆盖 representative helper source，并覆盖 `direct-provider` 与 `single-upstream gateway` 两种模式。
- 源码模式与编译产物 `-p --max-turns 1 "Reply with exactly OK"` 本轮均已返回 `OK`，Phase 2 所需 headless 对照验证已补齐。

## Phase 3. 状态型工作流闭环

### Status

- current
- nearing-exit

### Goal

- 把“能启动”推进到“常见状态型工作流可稳定使用”，包括插件、MCP、resume/continue 等。

### In Scope

- session resume / continue
- plugin refresh / install / stateful write path
- MCP 写配置、刷新、严格校验之外的深链路
- compact / context collapse 主路径

### Out Of Scope

- 真正发布版分发
- 所有低频命令全覆盖
- 非关键实验功能

### Must Deliver

- 一组状态型 smoke / harness
- 对主要状态写路径的隔离验证
- 明确哪些能力已可用于日常迁移，哪些仍不建议依赖

### Validation

- 现有隔离 smoke 扩充
- 新增的 stateful smoke
- 至少一轮“复制现有 Claude 配置后跑常见工作流”的回归

### Current Progress

- 已新增 `scripts/session-continue-smoke.ts`，在隔离 `workspace/config/plugin-cache` 中真实执行首轮 `-p` 与后续 `-p --continue`
- 已把 print/headless 的 `continue/resume` 恢复逻辑收敛到共享 helper，并补齐恢复前缓存清理与 worktree 状态恢复
- 已验证 `bun run smoke:session-continue:no-serena`
- 已新增 `scripts/plugin-cli-state-smoke.ts`，在隔离 `workspace/config/plugin-cache` 中真实执行 `plugin marketplace add/remove`、`plugin install/uninstall`、`plugin enable/disable`
- 已把 plugin CLI state smoke 的能力校验收敛到“CLI 写状态 + `refreshActivePlugins()` apply 后断言命令能力变化”，覆盖 Layer 2 写入与 Layer 3 应用的真实闭环
- 已验证 `bun run smoke:plugin-cli-state:no-serena`
- 已新增 `scripts/context-compact-smoke.ts`，构造 compact boundary 前后的消息并借助 `getMessagesAfterCompactBoundary()` 断言 post-boundary 视图真正裁掉旧消息、compact summary 顺序稳定、stub collapse 不改变 helper 输出
- 已验证 `bun run smoke:context-compact:no-serena`
- 已新增 `scripts/phase3-system-regression-smoke.ts`，依次跑 continue/resume/plugin/context smoke 并汇总各 case 的退出码，形成 Phase 3 的系统回归入口
- 已验证 `bun run smoke:phase3-system-regression`
- 已新增 `scripts/migrated-config-system-smoke.ts`，把 `smoke:claude-config:no-serena`、`smoke:mcp-state`、`smoke:plugin-install` 与 `smoke:phase3-system-regression` 串成一轮真实迁移配置下的系统回归
- 已验证 `bun run smoke:migrated-config-system`
- 已新增 `scripts/distribution-readiness-smoke.ts`，把 no-serena help 命令、`smoke:migrated-config-system`、`smoke:native-distribution:no-serena` 与 `smoke:native-local-install:no-serena` 串成更接近“正式可用”门槛的聚合回归
- 已验证 `bun run smoke:distribution-readiness`
- 已把 `doctor/install/update` 帮助入口纳入 source 与安装版 smoke，同时修补 `src/cli/update.ts`、`src/utils/doctorDiagnostic.ts` 中残留的旧命令提示，避免用户在分发/诊断路径看到 `claude` 入口
- 已新增 `scripts/session-resume-worktree-smoke.ts`，在隔离 transcript 中写入 `worktree-state` 记录并验证 `loadConversationForResume()` correctly restores the persisted worktree session or records exits
- 已验证 `bun run smoke:session-resume-worktree:no-serena`

### Exit Conditions

- 常见状态型工作流不再依赖人工临时修补
- `smoke:phase3-system-regression`、`smoke:migrated-config-system`、`smoke:distribution-readiness` 至少在当前主配置路径上稳定为绿色
- 剩余问题集中到少量状态流变体、stale state / 文案尾项，而不是主链能力缺失
- 迁移现有 Claude 使用方式时，阻塞项已集中到少数明确的未完成功能

## Phase 4. native build 与本地分发版

### Status

- substantially-delivered-not-active

### Goal

- 真正打通 `bun build --compile` 或等价 native build，产出不依赖仓库源码路径的本地分发版。

### In Scope

- 分批消除 compile blocker
- 补齐当前阶段所需的缺失依赖
- 明确哪些 ant-only / 内部功能应裁剪而不是硬恢复
- 本地安装、PATH、launcher、shell integration 验证

### Out Of Scope

- 云端发布渠道
- auto-update 全量打通
- 跨平台安装器一次性全做完

### Must Deliver

- 一个不依赖源码路径的 native build
- 一份本地安装与 PATH 验证流程
- compile blocker 清零或转为显式裁剪

### Validation

- `bun run build:native`
- 编译产物 `--version`
- 编译产物 `--help`
- 编译产物 `-p` 单轮回放
- 新终端 PATH 调用验证

### Current Notes

- 当前机器上已经打通 `bun run build:native`
- 当前编译产物已验证 `--version`、`--help`
- 虽然 active phase 仍是 Phase 3，但 Phase 4 的大量基线已经提前完成；剩余主要缺口不再是“能不能本机安装运行”，而是签名、正式发布与 update 源闭环
- 编译产物 `-p` 单轮回放需在 API 连通状态正常时复验；本轮同一时刻源码模式也出现相同连接失败，不视为 native build 特有回归
- 已验证：新增 `scripts/native-distribution-smoke.ts`，在脱离仓库源码路径的临时目录中复制 `dist/neko-code.exe` 并分别执行 `--version`、`--help`、`-p --max-turns 1`，同时与 `bun src/entrypoints/cli.tsx -p --max-turns 1` 的输出进行对照，确认分发入口可独立于源码工作区执行
- 已验证：新增 `scripts/native-local-install-smoke.ts`，在临时 installer/bin 目录里复制并注册 `neko`，通过 PATH 调用后跑 `--version`、`--help`、`-p --max-turns 1 "Reply with exactly OK"`；现在要求安装版与源码版都 `exit 0` 且输出 `OK`，不再接受“同样失败也算一致”的弱校验
- 已修复 `scripts/install-local-launcher.ps1`，把 `dist/neko-code.exe` 复制成 `~/.local/bin/neko.exe`（真正的主命令），`neko-launcher.exe` 仅作兼容桥接，PATH 只需包含目录，`scripts/native-local-install-smoke.ts` 现在用 `Reply with exactly OK` 的 `-p --max-turns 1` 验证安装版与源码版成功路径完全一致
- 已验证：`bun run smoke:distribution-readiness` 已把 help 入口、真实迁移配置系统回归、native distribution 与本地 PATH 安装回归收口成单条聚合命令
- 已验证：新增 `scripts/release-facing-diagnostics-smoke.ts`，在不触发真实升级副作用的前提下锁定 `update` 失败提示与 `doctorDiagnostic` 的本地 alias 建议，`smoke:distribution-readiness` 现已覆盖 release-facing `neko doctor` / `neko install` / `alias neko=...` 文案回归
- 已验证：新增 `scripts/build-local-release-bundle.ts`，可生成 `dist/release-local/`，写入 `latest` / `stable` channel 文件、`manifest.json` 与当前平台产物，形成本地 installer/pipeline 可消费的 release bundle 格式
- 已验证：新增 `scripts/native-installer-local-bundle-smoke.ts`，通过 `NEKO_CODE_NATIVE_INSTALLER_BASE_URL` 指向本地临时 HTTP 源，并在隔离 `HOME` / `XDG_*` / `NEKO_CODE_CONFIG_DIR` 下真实执行 native installer 下载、安装与帮助入口验证
- 已验证：`bun run smoke:native-installer-local-bundle`
- 已验证：新增 `scripts/stage-release-candidate.ts`，可生成 `dist/release-candidate/<version>/`，收口 unsigned 可上传产物、bundle、安装脚本、metadata 与 `SHA256SUMS.txt`
- 已落地：新增 `.github/workflows/release-candidate.yml`，在 `windows-latest` 上执行 `typecheck`、`smoke:release-preflight`、`stage-release-candidate`，并上传 unsigned release candidate artifact
- 已验证：新增 `scripts/release-preflight.ts`，顺序执行 `build:native`、`smoke:distribution-readiness`，并额外校验 `dist/neko-code.exe`、`scripts/install-local-launcher.ps1` 主命令与 README / 关键 release-facing 文本一致性，形成“本地候选发布物 gate”
- 已验证：`bun run smoke:release-preflight`
- 已验证：本轮 `dist/neko-code.exe -p --max-turns 1 "echo native smoke"` 会在命中 `max-turns` 限制时退出，并且源码入口 `bun src/entrypoints/cli.tsx -p --max-turns 1 "echo source smoke"` 则抛出完全相同的 `Error: Reached max turns (1)` 结果，说明当前失败属于通用行为而非编译产物里程碑差异

### Exit Conditions

- 当前机器上已可像普通 CLI 一样安装和启动
- 不再需要仓库内 launcher 作为主入口
- 本地候选发布物至少已有 `smoke:release-preflight` 这类固定 gate，而不是只靠手工 spot check
- native installer 至少已可消费本地 release bundle，不再完全依赖远端发布源才可验证
- unsigned release candidate 已有固定 staging 输出与 CI 上传入口，剩余主要缺口集中到签名与正式发布

## Phase 5. 可迁移候选版本

### Status

- queued

### Goal

- 让现有 Claude 用户可以把主要使用流迁到 Neko Code，而不是只能做技术演示。

### In Scope

- 真实配置迁移回归
- 常见命令、print/headless、plugin/MCP、resume/continue 的组合回归
- README 与路线图面向使用者重新表述

### Out Of Scope

- “全仓 100% 完整恢复”
- 低频边缘能力全部补齐

### Must Deliver

- 一份迁移验证清单
- 一份“已支持 / 未支持 / 不建议使用”的能力说明
- 一轮近似真实使用方式的回归记录

### Validation

- 真实用户配置回放
- 常见命令矩阵
- 关键工作流 smoke

### Exit Conditions

- 可以开始把日常工作迁入 Neko Code 试运行
- 剩余缺口已经是“非核心缺口”，而不是基础阻塞

## 当前执行顺序

1. Phase 1 先完成“终端直启最小闭环”
2. Phase 2 再完成 provider/router 闭环
3. Phase 3 再补状态型工作流
4. Phase 4 再把已提前落地的 native build / 本地分发基线正式收口并转成发布闭环
5. Phase 5 最后做迁移候选版本回归

只有在某阶段 Exit Conditions 满足后，才默认切到下一阶段。

## Validation

- 文档结构检查：本计划与 `docs/analysis/neko-code-roadmap.md` 保持一致
- 后续每轮执行时，至少核对：
  - 当前阶段是否仍是 active
  - 当前任务是否属于本阶段 in-scope
  - 当前阶段 exit conditions 是否已满足

## Exit Conditions

- 这份计划被主 roadmap 引用
- 主 roadmap 明确标记当前 active phase
- 后续执行可以直接按阶段推进，而不需要再次重做阶段划分
