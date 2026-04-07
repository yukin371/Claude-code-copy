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

- current

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

- queued

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

### Exit Conditions

- 任务级路由行为在主路径和关键辅助路径上保持一致
- 外部网关与本地 fallback 的职责边界已经稳定
- 不再因 provider/router 漂移阻塞后续状态型链路验证

## Phase 3. 状态型工作流闭环

### Status

- queued

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

### Exit Conditions

- 常见状态型工作流不再依赖人工临时修补
- 迁移现有 Claude 使用方式时，阻塞项已集中到少数明确的未完成功能

## Phase 4. native build 与本地分发版

### Status

- queued

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

- `bun build --compile ...`
- 编译产物 `--version`
- 编译产物 `--help`
- 编译产物 `-p` 单轮回放
- 新终端 PATH 调用验证

### Exit Conditions

- 当前机器上已可像普通 CLI 一样安装和启动
- 不再需要仓库内 launcher 作为主入口

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
4. Phase 4 再推进真正 native build
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
