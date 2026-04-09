# Neko Code Roadmap

这份 roadmap 只追踪当前仍在推进和待完成的事项。  
已确认完成且经过验证的内容，转移到归档文档，避免主 roadmap 继续堆积为历史流水账。

## 使用规则

- 主文档只保留：
  - 当前版本目标
  - 进行中事项
  - 待完成事项
  - 最近经过验证的推进
  - 下一步
- 只有“已验证且已收口”的事项才能进入完成归档
- 未完成、未验证、或仍可能回滚的事项继续留在主 roadmap
- 后续新增归档时，使用按日期切分的快照文件

## 归档入口

- 已确认完成归档：
  - [neko-code-roadmap-confirmed-completed-2026-04-07.md](./archive/neko-code-roadmap-confirmed-completed-2026-04-07.md)

## 阶段计划入口

- 阶段交付计划：
  - [2026-04-08-staged-delivery-plan.md](../plans/2026-04-08-staged-delivery-plan.md)
- native build blocker 分类：
  - [2026-04-08-native-build-blockers.md](../plans/2026-04-08-native-build-blockers.md)
- 当前工作区改动分组：
  - [2026-04-09-worktree-change-inventory.md](../plans/2026-04-09-worktree-change-inventory.md)
- 当前默认执行规则：
  - 以后默认按阶段计划推进
  - 只有当前 active phase 的 Exit Conditions 满足后，才切到下一阶段
  - 不属于当前阶段 in-scope 的事项，默认回收到 roadmap 或后续阶段，不临时插队

## 当前改动面说明

- 当前工作区中大量 `M` / `??` 文件，均来自此前多轮代理推进，不是用户手工修改。
- 这些改动并非单一功能线，而是同时覆盖：
  - Phase 3 状态型 smoke 与系统回归
  - Phase 4 本地分发、release staging、GitHub workflow
  - release-facing 文案、品牌清理、配置路径与 provider/router 收口
- 之前 roadmap 主要记录阶段目标、gate 与里程碑，没有同步记录“实际触达的文件簇”，因此会出现“文档看起来改动不多，但工作区改动面很大”的观感差异。
- 这类范围说明现已转移到：
  - [2026-04-09-worktree-change-inventory.md](../plans/2026-04-09-worktree-change-inventory.md)

## 当前版本目标

1. 多 API 与原 Anthropic API 并存，默认行为不冲突
2. 支持每个对话使用不同 provider / model / API 路由
3. 保持工具协议兼容，不单独改协议层
4. 明确“应用内路由 vs 外部网关”的边界，避免把运维型流量治理继续堆进应用
5. 持续保持文档、验证脚本和实现状态一致，避免“做到一半但文档已宣告完成”
6. 产出一个像 Claude Code 一样可直接从终端启动的本地可运行版本，而不要求用户手动执行 `bun src/entrypoints/cli.tsx`

## 当前执行阶段

- active phase：
  - Phase 3. 状态型工作流闭环
- 本阶段要解决的问题：
  - 把 session resume / continue、plugin/MCP 状态写路径、compact/context collapse 等常见状态型工作流继续收口
  - 在迁移后的真实配置与隔离 smoke 里稳定这些状态流
- 当前阶段状态：
  - Phase 3 已接近收尾：
    - `bun run smoke:phase3-system-regression`
    - `bun run smoke:migrated-config-system`
    - `bun run smoke:distribution-readiness`
    - 现阶段剩余工作更偏向“补变体、清 stale state / 文案尾项、维持固定 gate 绿色”，而不是再补主链基础能力
  - Phase 2 已完成：
    - `bun run typecheck`
    - `bun run test:routing`
    - `bun run smoke:claude-config`
    - `powershell -ExecutionPolicy Bypass -File scripts/readonly-smoke.ps1 -Workflow routing`
    - `bun src/entrypoints/cli.tsx -p --max-turns 1 "Reply with exactly OK"`
    - `dist/neko-code.exe -p --max-turns 1 "Reply with exactly OK"`
  - Phase 4 关键基线已提前打通但尚未正式切 phase：
    - 本机 PATH 直启 `neko`
    - `dist/neko-code.exe` 脱离源码路径运行
    - 本地 unsigned beta 安装
    - local bundle / native installer / unsigned release candidate staging
- 本阶段完成前，不默认切去做：
  - 发布渠道 / auto-update
  - 非关键低频功能恢复
  - 与状态流主路径无关的零散体验优化

## 当前进行中

### 1. Session / Continue / Resume 状态流

- 目标：把 `continue`、resume、非交互恢复链路推进到稳定可用，而不是依赖人工修补
- 当前状态：
  - session resume 隔离 harness 已收口
  - session continue 隔离 smoke 已收口
  - 一批 provider/router 相关来源透传已不再阻塞这些状态流继续验证
- 剩余收口：
  - 把更多 resume 变体与真实迁移配置继续对齐
  - 排查仍依赖旧状态假设的恢复链路

### 2. Plugin / MCP 状态写路径

- 目标：把 plugin refresh / install / stateful write path，以及 MCP 写配置、刷新、严格校验之外的深链路做稳定化
- 当前状态：
  - plugin refresh 隔离 smoke 已收口
  - plugin CLI state 隔离 smoke 已收口
  - MCP strict-config 隔离 harness 已收口
- 剩余收口：
  - 继续补状态写路径和安装/刷新回归
  - 把更多真实配置迁移场景纳入验证矩阵

### 3. Compact / Context Collapse 主路径

- 目标：把 compact、context collapse、context analysis 这些会影响长会话稳定性的主链路继续收口
- 当前状态：
  - compact / context analysis 的 provider/router 辅助路径已补齐来源透传
  - native build 与 provider/router 已不再是这一块的主阻塞
- 剩余收口：
  - 补状态型回归和长会话场景验证
  - 继续排查 compact 后的状态一致性问题

### 4. Native Build 作为固定验证项

- 目标：把 `dist/neko-code.exe` 保持为阶段验证手段，而不是每轮重新回到 blocker 摸排
- 当前状态：
  - 本轮已再次验证源码模式与编译产物 `-p` 单轮回放都返回 `OK`
- 剩余收口：
  - 后续阶段继续把源码模式与编译产物做必要对照
  - 真正“不依赖源码路径的完整分发 workflow”仍留在 Phase 4

## 待完成

### P0

1. 完成 Phase 3 剩余状态流变体回归，而不是只在当前 smoke 集上成立
2. 继续清理 plugin / MCP / resume 相关 stale state、旧路径兼容尾项和少量品牌残留
3. 继续验证 compact / context collapse 在更长会话和更多真实配置下的状态一致性
4. 把 `smoke:migrated-config-system`、`smoke:distribution-readiness`、`smoke:release-preflight` 固定维持为绿色 gate
5. 同步 roadmap / staged plan / README，让文档状态不再落后于本地 beta 实际能力

### P1

1. 签名、GitHub Release 资产与正式发布源闭环
2. `neko update` 面向真实发布源的稳定验证与发布流程整理
3. 更完整的品牌文案清理与旧路径兼容收尾
4. 更上层的交互式配置入口
5. 外部网关接入示例、运维约束与观测文档补强

## 最近已验证推进

- 已验证：`bun run typecheck`
- 已验证：多 provider / route helper 回归已覆盖 `direct-provider` 与 `gateway` 两种模式
- 已验证：任务路由回归已覆盖 `querySource -> route` 的 review / frontend hint 映射
- 已验证：状态页已可查看非 `main` 任务路由矩阵
- 已验证：只读 smoke 矩阵已更新到 22 条用例
- 已验证：plugin refresh 隔离 smoke 已收口
- 已验证：LSP refresh 隔离 smoke 已收口，并修补了重复 scope 回归
- 已验证：session resume 隔离 harness 已收口，并修补了 direct resume metadata 漏传
- 已验证：`scripts/session-resume-smoke.ts` 现已纳入 `smoke:phase3-system-regression`，补齐 stored session、missing session 与 user-tail sentinel 三类 resume 基础变体
- 已验证：`scripts/session-resume-smoke.ts` 已补齐 compact 后 resume 的大 transcript 变体，锁定 compact boundary + summary + preserved tail 的恢复链、pre-boundary metadata 回读与 stale usage 清零
- 已验证：新增 `scripts/session-resume-worktree-smoke.ts`，在隔离 transcript 中注入 `worktree-state` 记录并确认 `loadConversationForResume()` 返回相同 `worktreeSession` 信息与 null 退出态
- 已验证：新增 `scripts/session-continue-smoke.ts`，可在隔离配置目录中真实执行 `-p --continue` 并断言 transcript 继续追加而非新建会话
- 已验证：`bun run smoke:session-continue:no-serena` 已通过，测试时可配合 `NEKO_CODE_DISABLED_MCP_SERVERS=serena` 避免无关 MCP server 干扰
- 已验证：新增 `scripts/plugin-cli-state-smoke.ts`，可在隔离配置目录中真实执行 `plugin marketplace add/remove`、`plugin install/uninstall`、`plugin enable/disable`，并在 `refreshActivePlugins()` 后断言命令能力随状态切换
- 已验证：`bun run smoke:plugin-cli-state:no-serena` 已通过，测试时可继续配合 `NEKO_CODE_DISABLED_MCP_SERVERS=serena` 避免无关 MCP server 干扰
- 已验证：`scripts/plugin-refresh-smoke.ts`、`scripts/lsp-refresh-smoke.ts` 与 `scripts/mcp-strict-config-smoke.ts` 现已纳入 `smoke:phase3-system-regression`，补齐 inline plugin refresh、LSP manager refresh 与 strict MCP config 三类隔离状态变体
- 已验证：MCP strict-config 隔离 harness 已收口
- 已验证：修补了 `--print` headless 入口未等待 `runHeadless(...)` 的收口问题，避免非交互执行链提前退出
- 已验证：源码模式下补齐 `MACRO` bootstrap 与关键热路径兜底，`--print` / headless 主链已不再因 `MACRO is not defined` 在启动阶段中断
- 已验证：修补 OpenAI-compatible client 的流式 `.withResponse()` 兼容层，避免任务路由走外部 OpenAI-compatible 代理时在真实 API 请求前崩溃
- 已验证：真实 `bun src/entrypoints/cli.tsx -p ...` 已可在迁移后的真实配置回放中返回 `OK`，当前基础 `--print` 主链已恢复
- 已验证：补了本地验证 launcher，并已编译出 `dist/neko-code-local.exe`
- 已验证：`dist/neko-code-local.exe` 已通过 `--version`、`--help` 与单轮 `-p` 回放验证
- 已验证：新增 `bun run install:local-launcher` Windows 安装脚本，可把本地 launcher 编译到指定目录
- 已验证：安装脚本产出的 `neko.exe` 已在临时安装目录通过 `--version`、`--help` 与单轮 `-p` 回放验证
- 已验证：真实用户目录 `C:\Users\yukin\.local\bin\neko.exe` 已安装完成，且新 shell 中可直接执行 `neko --version`、`neko --help`
- 已验证：PATH 上的 `neko -p --max-turns 1 "Reply with exactly OK"` 已返回 `OK`
- 已落地：native build blocker 已整理为分类清单与分批顺序，见 [2026-04-08-native-build-blockers.md](../plans/2026-04-08-native-build-blockers.md)
- 已验证：补齐 compile-safe 缺失模块与依赖基线后，`bun run build:native` 已成功生成 `dist/neko-code.exe`
- 已验证：编译产物 `dist/neko-code.exe --version`、`dist/neko-code.exe --help` 正常
- 已确认：本轮编译产物 `-p` 烟测遇到 API 连接失败；同一时刻源码模式 `bun src/entrypoints/cli.tsx -p ...` 也出现相同错误，因此暂不判定为 native build 回归
- 已验证：`bun run scripts/bun-tools.ts routes` 现已输出可读 route matrix 与 querySource example matrix，便于继续做 provider/router 阶段回归
- 已验证：route diagnostics / smoke 已补 representative helper `querySource` 覆盖，当前已显式核对 `session_search` 与 `permission_explainer` 在 direct-provider / gateway 两种模式下都沿用 `main` 路由
- 已验证：带 `querySource` 的 token estimation 现已对 Anthropic helper 路由做 route-aware 选择，不再一律固定走 `main`；对 OpenAI-compatible helper 路由暂保守回落到 `main`
- 已验证：MCP 大结果截断链路现已透传调用侧 `querySource`，避免 `chrome_mcp` 等 helper 路径进入 token estimation 时丢失来源
- 已验证：ToolSearch auto-threshold 计算现已在 `query` / `compact` / context analysis 等路径透传 `querySource`
- 已验证：新增 `scripts/context-compact-smoke.ts`，构造 compact boundary 前后的消息并借助 `getMessagesAfterCompactBoundary()` 验证 post-boundary 视图真正裁掉旧消息、compact summary 保持可见，stub collapse 不改变 helper 输出
- 已验证：`bun run smoke:context-compact:no-serena`
- 已验证：新增 `scripts/phase3-system-regression-smoke.ts`，顺序调用 continue/resume/plugin/LSP/MCP/context smoke，照会执行结果并输出 PASS/FAIL 汇总
- 已验证：新增 `scripts/migrated-config-system-smoke.ts`，顺序调用 `smoke:claude-config:no-serena`、`smoke:mcp-state`、`smoke:plugin-install`、`smoke:plugin-state` 与 `smoke:phase3-system-regression`，形成一轮“复制现有 Claude 配置后跑常见工作流”的系统回归入口
- 已验证：`scripts/plugin-state-smoke.ts` 现已纳入 `smoke:migrated-config-system`，补齐 migrated config 下 plugin enable/disable 与 runtime capability 切换回归
- 已验证：`bun run smoke:migrated-config-system`
- 已验证：SDK `get_context_usage` / 非交互 context analysis 路径现已显式透传 `sdk` querySource
- 已验证：Doctor 的 MCP context warning 诊断路径现已使用显式内部 source（`doctor_context_warning`）
- 已验证：ToolSearch deferred-tools token 计数缓存现已纳入 model / route 维度，避免不同路由下错误复用同一组工具名的旧结果
- 已验证：token-count VCR fixture key 现已纳入 `model` / `route` 维度，避免不同 helper 路由在测试/录制环境里误复用同一份 token 计数缓存
- 已验证：通用 API VCR fixture key 现已纳入 `systemPrompt` / `model` / `querySource` 上下文，避免主查询与 helper 查询在不同任务路由下误复用同一份旧响应
- 已验证：route diagnostics / status matrix 已补 `mcp_datetime_parse`、`generate_session_title`、`tool_use_summary_generation` 等 queryHaiku/queryWithModel helper source 样本
- 已验证：routing smoke 现已额外断言 `mcp_datetime_parse` 在 `single-upstream gateway` 模式下继续沿用主路由
- 已验证：`powershell -ExecutionPolicy Bypass -File scripts/readonly-smoke.ps1 -Workflow routing` 现已覆盖并断言 `direct-provider` 与 `single-upstream gateway` 两种模式
- 已验证：`bun run smoke:claude-config` 现已在迁移后的隔离配置目录内覆盖并断言 `direct-provider` 与 `single-upstream gateway` 两种模式
- 已验证：本轮 Phase 2 收尾时再次通过 `bun run typecheck`、`bun run test:routing`、`bun run smoke:claude-config`
- 已验证：本轮 Phase 4 native build 再跑 `bun run build:native`，`dist/neko-code.exe --version`、`dist/neko-code.exe --help` 均正常返回
- 已验证：`dist/neko-code.exe -p --max-turns 1 "echo native smoke"` 会在运行到 `Error: Reached max turns (1)` 时退出（且 `bun src/entrypoints/cli.tsx -p --max-turns 1 "echo source smoke"` 得到相同错误），所以当前失败属于通用 `max-turns` 行为而非编译产物回归
- 已验证：新增 `scripts/native-distribution-smoke.ts`，将 `dist/neko-code.exe` 复制到完全脱离仓库路径的临时目录，依次执行 `--version`、`--help`、`-p --max-turns 1`，并将 `-p` 输出与源码模式对照，证明编译产物在分发环境下可独立运行
- 已验证：新增 `scripts/native-local-install-smoke.ts`，模拟在临时目录 installer/bin 下把 `neko` 添加到 PATH，依次运行 `neko --version`、`neko --help`、`neko -p --max-turns 1 "Reply with exactly OK"`；现在要求安装版与源码版都 `exit 0` 且输出 `OK`，不再接受“同样失败也算一致”的弱校验
- 已修复安装脚本 `scripts/install-local-launcher.ps1`，将本地安装产物主命令 `neko.exe` 直接复制自 `dist/neko-code.exe` 并把 launcher 编译为 `neko-launcher.exe`，让 `neko --version` / `--help` 在任何 PATH 中都走原生产物；`scripts/native-local-install-smoke.ts` 现在安装目录内通过 `Reply with exactly OK` 的 `-p --max-turns 1` 断言安装版与源码版的 exit/output 完全一致
- 已明确：`install-local-launcher` 只把 `dist/neko-code.exe` 复制成 `~/.local/bin/neko.exe`（主命令），`neko-launcher.exe` 只是兼容层，PATH 只需包含目录即可运行；流程仍依赖本地构建二进制，未升级到正式 unsigned installer
- 已验证：新增 `scripts/distribution-readiness-smoke.ts`，顺序调用 no-serena help 命令、`smoke:migrated-config-system`、`smoke:native-distribution:no-serena` 与 `smoke:native-local-install:no-serena`，形成一条覆盖“帮助入口 + 真实迁移配置 + 本地分发/PATH workflow”的聚合 gate
- 已验证：`bun run smoke:distribution-readiness`
- 已修复：`src/cli/update.ts` 与 `src/utils/doctorDiagnostic.ts` 的用户可见提示不再继续把 `claude doctor` / `claude install` / `~/.local/bin/claude` 当作当前主入口；native 诊断与升级提示现已对齐 `neko`
- 已验证：新增 `scripts/release-facing-diagnostics-smoke.ts` 并纳入 `smoke:distribution-readiness`，在受控环境里覆盖 `update` 的 native/global 失败提示分支，并真实触发 `doctorDiagnostic` 的 npm-local alias 提示，锁定 `neko doctor` / `neko install` / `alias neko="~/.neko-code/local/claude"` 等 release-facing 文案
- 已验证：新增 `scripts/build-local-release-bundle.ts`，可生成 `dist/release-local/`，写入 `latest` / `stable` channel 文件、`manifest.json` 与当前平台产物，形成可供 native installer 消费的本地 bundle 格式
- 已验证：新增 `scripts/native-installer-local-bundle-smoke.ts`，通过 `NEKO_CODE_NATIVE_INSTALLER_BASE_URL` 把 native installer 指向本地临时 HTTP 源，并在隔离 `HOME` / `XDG_*` / `NEKO_CODE_CONFIG_DIR` 下真实执行下载、安装与帮助入口验证
- 已验证：`bun run smoke:native-installer-local-bundle`
- 已验证：新增 `scripts/stage-release-candidate.ts`，可生成 `dist/release-candidate/<version>/`，收口 unsigned 可上传产物、bundle、安装脚本、metadata 与 `SHA256SUMS.txt`
- 已落地：新增 `.github/workflows/release-candidate.yml`，在 `windows-latest` 上执行 `typecheck`、`smoke:release-preflight`、`stage-release-candidate`，并上传 unsigned release candidate artifact
- 已验证：新增 `scripts/release-preflight.ts`，顺序执行 `bun run build:native`、`bun run smoke:distribution-readiness`，再校验 `dist/neko-code.exe`、`scripts/install-local-launcher.ps1` 主命令和 README / 关键 release-facing 文本一致性，形成“本地候选发布物 gate”
- 已验证：`bun run smoke:release-preflight`
- 已落地：补齐 `scripts/analyze-text-hygiene.ts`、`scripts/check-text-hygiene.ts` 与共享规则库，避免 `package.json` 中的文本卫生入口继续悬空
- 已收口：`Doctor` dismiss 提示、通知标题、permission/hooks/trust dialog/memory/worktree/plugin/session-start UI 路径提示、`/insights` 命令描述、REPL 默认标题/挂起提示、keybindings schema 与 SDK settings source 描述等用户可见文案已改为 `Neko Code` / `.neko-code` 路径，不再继续直露 `Claude Code` / `.claude`
- 已验证：`bun run analyze:text-hygiene`
- 已验证：`bun run check:text-hygiene`
- 已验证：本轮再次通过 `bun run smoke:distribution-readiness` 与 `bun run smoke:release-preflight`
- 已验证：本轮再次通过 `bun run typecheck`

更多已确认完成项见归档文档，不再在主 roadmap 中重复展开。

## 发布渠道余留任务

- 当前已经具备：
  - `bun run build:native` 生成 `dist/neko-code.exe`
  - 本地 PATH 安装与 `neko` 直启
  - 本地 unsigned beta 安装包
  - local bundle / native installer / unsigned release candidate / release preflight
- 但把这些 artifact 包装成真正的 release 仍需：
  - 独立打包 + 多平台签名
  - GitHub Release / 发布源上传与消费闭环
  - 明确发布说明与 upgrade workflow，让用户在新机器上直接下载运行
- 当前还新增了一层本地候选发布物 gate：
  - `bun run smoke:release-preflight`
  - 当前它已经把“构建 + 分发 smoke + 本地 release bundle 驱动的 installer 下载/安装 + unsigned release candidate staging + 安装脚本主入口 + README / 关键 release-facing 文本一致性”收成单条固定检查
  - 该 gate 通过不代表 signing / 正式发布源 / 真实 auto-update 已完成，只代表本地候选产物没有明显回退
- 所以现在的状态不是“只能源码内演示”，而是“本地 beta 可体验、正式发布链路未完成”。

## 下一步

### 当前阶段下一步

1. 继续把 `smoke:migrated-config-system`、`smoke:distribution-readiness` 与 `smoke:release-preflight` 维持为绿色固定 gate
2. 继续补状态型工作流剩余变体，避免 Phase 3 只在当前 smoke 集上成立
3. 清理 stale error / 旧路径兼容 / release-facing 文案尾项，减少本地 beta 使用中的误报和混乱
4. 在不引入 signing 之前，继续把源码模式、分发产物与本地 PATH 安装作为固定对照验证项

### 下一阶段入口

1. Phase 3 完成后，再切到 Phase 4 的 native build 与本地分发收口
2. 由于 Phase 4 关键基线已大体具备，切 phase 后主要剩余项将集中到签名、正式发布源与 update workflow
3. 后续新增完成项时，直接迁入归档而不是继续膨胀主 roadmap
