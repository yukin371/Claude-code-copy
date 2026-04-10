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
- 本轮收尾对齐记录：
  - [2026-04-10-release-preflight-signed-workflow-alignment.md](../plans/2026-04-10-release-preflight-signed-workflow-alignment.md)
- 当前默认执行规则：
  - 以后默认按阶段计划推进
  - 只有当前 active phase 的 Exit Conditions 满足后，才切到下一阶段
  - 不属于当前阶段 in-scope 的事项，默认回收到 roadmap 或后续阶段，不临时插队

## 当前改动面说明

- 当前这轮已按阶段目标持续收敛；历史上较大的改动面主要来自此前多轮代理推进，不是用户手工修改。
- 这些历史改动并非单一功能线，而是同时覆盖：
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
  - Phase 4. native build 与本地分发版
- 本阶段要解决的问题：
  - 把已经提前打通的 native build / 本地安装 / release candidate 基线正式收口成固定发布前流程
  - 把签名、正式发布源、update workflow 与 release-facing 文案继续推进到可发布状态
- 当前阶段状态：
  - Phase 3 已完成并切出：
    - `bun run smoke:session-resume`
    - `bun run smoke:mcp-state`
    - `bun run smoke:phase3-system-regression`
    - `bun run smoke:migrated-config-system`
    - `bun run smoke:distribution-readiness`
    - 最后一轮补齐了 `.jsonl path` / `--resume-session-at` 与 MCP 多 scope / fallback 回归，剩余问题已不再是状态流主链能力缺失
  - Phase 2 已完成：
    - `bun run typecheck`
    - `bun run test:routing`
    - `bun run smoke:claude-config`
    - `powershell -ExecutionPolicy Bypass -File scripts/readonly-smoke.ps1 -Workflow routing`
    - `bun src/entrypoints/cli.tsx -p --max-turns 1 "Reply with exactly OK"`
    - `dist/neko-code.exe -p --max-turns 1 "Reply with exactly OK"`
  - Phase 4 已成为当前主线：
    - 本机 PATH 直启 `neko`
    - `dist/neko-code.exe` 脱离源码路径运行
    - 本地 unsigned beta 安装
    - local bundle / native installer / unsigned release candidate staging

## 当前进行中

### 1. Release Candidate 闭环

- 目标：把当前本地 build、bundle、installer、release candidate 产物组织成可重复执行的发布前闭环。
- 当前状态：
  - native build、local bundle、native installer、本地 PATH 安装、release candidate / deploy / GitHub Release staging 与 `smoke:release-preflight` 已经打通
  - GitHub Release 资产整理与 publish plan 已落地，本地候选发布物 gate 也已覆盖到 deploy publish / GitHub Release publish / native update
  - 当前主要缺口已经收敛到签名、正式发布源和真实外部发布动作
- 剩余收口：
  - 对接 signed artifact 与签名后的正式上传流程
  - 把外部发布环境中的凭据、签名和 promote 动作固定到 CI/workflow

### 2. Update / 发布源

- 目标：把 `neko update` 从本地 beta 体验推进到面向真实发布源的可验证流程。
- 当前状态：
  - update 相关提示、diagnostics 与本地 alias 建议已大体切到 `neko`
  - 本轮已把 native / package-manager 的版本探测源收敛到与 native installer 一致的 release source 解析，不再让 `doctor`、package-manager auto-updater 与 CLI `update` 各自看不同后端
  - 本地 deploy 源与 GitHub Release mock 下的 `neko update` 已不再只验证“看到新版本”，而是会真实注入下一版本并断言升级成功
  - 真实发布源、channel 切换与发布后验证仍未闭环
- 剩余收口：
  - 对接正式发布源
  - 补正式发布后的升级 / 回滚验证

### 3. Release-facing 文案与文档

- 目标：让 README、安装诊断、升级提示与 release-facing 文案持续跟上当前可用形态。
- 当前状态：
  - 大部分用户可见入口已切到 `Neko Code` / `neko`
  - 仍需随着 Phase 4 的 installer / update / release 流程继续同步
- 剩余收口：
  - 清理剩余旧路径兼容尾项
  - 保持 roadmap / staged plan / README 同步

### 4. 固定 Gate 维护

- 目标：把 `smoke:distribution-readiness`、`smoke:release-preflight` 等 gate 固定维持为绿色，而不是阶段性回看。
- 当前状态：
  - Phase 3 相关 gate 已经完成收口任务
  - Phase 4 额外拥有本地候选发布物 gate 作为对照验证
- 剩余收口：
  - 继续把签名、发布源和 installer 相关检查并入固定流程

## 待完成

### P0

1. 把签名、GitHub Release 资产与正式发布源闭环
2. 把 `smoke:distribution-readiness`、`smoke:release-preflight` 固定维持为绿色 gate，并继续把签名/正式发布检查并进去
3. 继续清理 release-facing 旧路径兼容、安装/升级提示和少量品牌残留
4. 同步 roadmap / staged plan / README，让文档状态不再落后于本地 beta 实际能力
5. 把 `neko update` 面向真实发布源的稳定验证与发布流程整理清楚

### P1

1. 更完整的品牌文案清理与旧路径兼容收尾
2. 更上层的交互式配置入口
3. 外部网关接入示例、运维约束与观测文档补强

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
- 已验证：`scripts/session-resume-smoke.ts` 已补齐 `.jsonl path` 与 `--resume-session-at` 变体，锁定 transcript path 恢复、assistant-only truncation 与错误提示分支
- 已验证：新增 `scripts/session-resume-worktree-smoke.ts`，在隔离 transcript 中注入 `worktree-state` 记录并确认 `loadConversationForResume()` 返回相同 `worktreeSession` 信息与 null 退出态
- 已验证：新增 `scripts/session-continue-smoke.ts`，可在隔离配置目录中真实执行 `-p --continue` 并断言 transcript 继续追加而非新建会话
- 已验证：`scripts/session-continue-smoke.ts` 已补齐 compact 后 continue 的大 transcript 变体，锁定 seeded compact boundary transcript 在 `-p --continue` 下仍会追加到原 session，而不是重新建链或丢失 post-compact 对话
- 已验证：`scripts/session-continue-smoke.ts` 已切到本地 `openai-compatible` mock server，`FIRST` / `SECOND` / `COMPACT` 断言不再依赖外部 provider 配额或网络抖动
- 已验证：`bun run smoke:session-continue:no-serena` 已通过，测试时可配合 `NEKO_CODE_DISABLED_MCP_SERVERS=serena` 避免无关 MCP server 干扰
- 已验证：新增 `scripts/plugin-cli-state-smoke.ts`，可在隔离配置目录中真实执行 `plugin marketplace add/remove`、`plugin install/uninstall`、`plugin enable/disable`，并在 `refreshActivePlugins()` 后断言命令能力随状态切换
- 已验证：`bun run smoke:plugin-cli-state:no-serena` 已通过，测试时可继续配合 `NEKO_CODE_DISABLED_MCP_SERVERS=serena` 避免无关 MCP server 干扰
- 已验证：`scripts/plugin-refresh-smoke.ts`、`scripts/lsp-refresh-smoke.ts` 与 `scripts/mcp-strict-config-smoke.ts` 现已纳入 `smoke:phase3-system-regression`，补齐 inline plugin refresh、LSP manager refresh 与 strict MCP config 三类隔离状态变体
- 已验证：`scripts/plugin-state-smoke.ts` 已改为真实 stateful refresh 序列，锁定 disable/reenable 过程中 commands/agents/hooks 与 reconnect state 的同步收敛，不再用每轮重置的默认 app state 掩盖 stale cleanup 问题
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
- 已验证：`bun run scripts/bun-tools.ts routes` 现已输出可读 route matrix 与 querySource example matrix，便于继续做 provider/router 阶段回归
- 已验证：route diagnostics / smoke 已补 representative helper `querySource` 覆盖，当前已显式核对 `session_search` 与 `permission_explainer` 在 direct-provider / gateway 两种模式下都沿用 `main` 路由
- 已验证：带 `querySource` 的 token estimation 现已对 Anthropic helper 路由做 route-aware 选择，不再一律固定走 `main`；对 OpenAI-compatible helper 路由暂保守回落到 `main`
- 已验证：MCP 大结果截断链路现已透传调用侧 `querySource`，避免 `chrome_mcp` 等 helper 路径进入 token estimation 时丢失来源
- 已验证：ToolSearch auto-threshold 计算现已在 `query` / `compact` / context analysis 等路径透传 `querySource`
- 已验证：新增 `scripts/context-compact-smoke.ts`，构造 compact boundary 前后的消息并借助 `getMessagesAfterCompactBoundary()` 验证 post-boundary 视图真正裁掉旧消息、compact summary 保持可见，stub collapse 不改变 helper 输出
- 已验证：`bun run smoke:context-compact:no-serena`
- 已验证：新增 `scripts/phase3-system-regression-smoke.ts`，顺序调用 continue/resume/plugin/LSP/MCP/context smoke，照会执行结果并输出 PASS/FAIL 汇总
- 已验证：新增 `scripts/migrated-config-system-smoke.ts`，顺序调用 `smoke:claude-config:no-serena`、`smoke:mcp-state`、`smoke:plugin-install`、`smoke:plugin-state` 与 `smoke:phase3-system-regression`，形成一轮“复制现有 Claude 配置后跑常见工作流”的系统回归入口
- 已验证：`scripts/mcp-state-smoke.ts` 已扩到 user/project/local 多 scope 写路径、同名 server fallback 与父/子 `.mcp.json` 优先级回落，锁定 persisted config 不携带 scope metadata
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
- 已验证：`scripts/native-distribution-smoke.ts` 与 `scripts/native-local-install-smoke.ts` 已切到本地 `openai-compatible` mock server，`smoke:distribution-readiness` 不再受外部 provider quota / timeout 干扰
- 已修复安装脚本 `scripts/install-local-launcher.ps1`，将本地安装产物主命令 `neko.exe` 直接复制自 `dist/neko-code.exe` 并把 launcher 编译为 `neko-launcher.exe`，让 `neko --version` / `--help` 在任何 PATH 中都走原生产物；`scripts/native-local-install-smoke.ts` 现在安装目录内通过 `Reply with exactly OK` 的 `-p --max-turns 1` 断言安装版与源码版的 exit/output 完全一致
- 已明确：`install-local-launcher` 只把 `dist/neko-code.exe` 复制成 `~/.local/bin/neko.exe`（主命令），`neko-launcher.exe` 只是兼容层，PATH 只需包含目录即可运行；流程仍依赖本地构建二进制，未升级到正式 unsigned installer
- 已验证：新增 `scripts/distribution-readiness-smoke.ts`，顺序调用 no-serena help 命令、`smoke:migrated-config-system`、`smoke:native-distribution:no-serena` 与 `smoke:native-local-install:no-serena`，形成一条覆盖“帮助入口 + 真实迁移配置 + 本地分发/PATH workflow”的聚合 gate
- 已验证：`bun run smoke:distribution-readiness`
- 已修复：`src/cli/update.ts` 与 `src/utils/doctorDiagnostic.ts` 的用户可见提示不再继续把 `claude doctor` / `claude install` / `~/.local/bin/claude` 当作当前主入口；native 诊断与升级提示现已对齐 `neko`
- 已验证：新增 `scripts/release-facing-diagnostics-smoke.ts` 并纳入 `smoke:distribution-readiness`，在受控环境里覆盖 `update` 的 native/global 失败提示分支，并真实触发 `doctorDiagnostic` 的 npm-local alias 提示，锁定 `neko doctor` / `neko install` / `alias neko="~/.neko-code/local/claude"` 等 release-facing 文案
- 已验证：native / package-manager 相关版本探测现已统一走 native installer 的 source selection；`doctor`、package-manager auto-updater 与 CLI `update` 的 package-manager 分支不再继续硬编码查 GCS 或 npm
- 已验证：新增 `scripts/build-local-release-bundle.ts`，可生成 `dist/release-local/`，写入 `latest` / `stable` channel 文件、`manifest.json` 与当前平台产物，形成可供 native installer 消费的本地 bundle 格式
- 已验证：新增 `scripts/native-installer-local-bundle-smoke.ts`，通过 `NEKO_CODE_NATIVE_INSTALLER_BASE_URL` 把 native installer 指向本地临时 HTTP 源，并在隔离 `HOME` / `XDG_*` / `NEKO_CODE_CONFIG_DIR` 下真实执行下载、安装与帮助入口验证
- 已验证：`bun run smoke:native-installer-local-bundle`
- 已验证：新增 `scripts/stage-release-candidate.ts`，可生成 `dist/release-candidate/<version>/`，收口 unsigned 可上传产物、bundle、安装脚本、metadata 与 `SHA256SUMS.txt`
- 已落地：新增 `.github/workflows/release-candidate.yml`，在 `windows-latest` 上执行 `typecheck`、`smoke:release-preflight`、`stage-release-candidate`，并上传 unsigned release candidate artifact
- 已验证：新增 `scripts/release-preflight.ts`，顺序执行 `bun run build:native`、`bun run smoke:distribution-readiness`，再校验 `dist/neko-code.exe`、`scripts/install-local-launcher.ps1` 主命令和 README / 关键 release-facing 文本一致性，形成“本地候选发布物 gate”
- 已验证：`bun run smoke:release-preflight`
- 已验证：新增 `scripts/release-deploy-publish.ts` 与 `bun run release:deploy-publish -- --target-root <path>`，把 `dist/release-deploy/<version>/payload/` 按 `upload-manifest.json` 真正发布到本地镜像根目录；`release-deploy-publish` 相关 smoke 已改为调用真实脚本而非手写复制
- 已收口：`scripts/release-deploy-publish.ts` 现已对 source / destination 做根目录边界校验，不再允许篡改 `upload-manifest.json` 后越过 deploy payload 或 publish target 根目录
- 已验证：`scripts/release-deploy-publish-smoke.ts` 现会逐项比对 `upload-manifest.json` 的 source/destination 内容；`scripts/native-update-cli-release-deploy-smoke.ts` 与 `scripts/native-update-cli-github-release-smoke.ts` 现会注入合成的 `0.1.1` 发布物，真实断言 `neko update` 完成升级而不是只看到 “No newer update”
- 已验证：新增 `scripts/publish-github-release.ts` 与 `scripts/publish-github-release-smoke.ts`，GitHub Release 创建/更新命令已统一收口到脚本与 workflow，不再在 workflow 里手写拼接发布命令
- 已收口：`scripts/promote-github-release.ts` 已从 `gh release edit` 切到显式 `gh api PATCH`，直接更新 `draft` / `prerelease` / `make_latest`，避免 promote 继续依赖 CLI flag 的隐式行为
- 已验证：`scripts/promote-github-release-smoke.ts` 现已覆盖 `draft` / `prerelease` / `stable` 三种 promote target 与手工布尔参数组合；`smoke:release-preflight` 也已纳入 promote smoke
- 已验证：`scripts/signed-release-publication-workflow-smoke.ts` 现已支持跳过重复 build/candidate staging，并已纳入 `smoke:release-preflight`，可在本地候选发布物 gate 中模拟“外部 unsigned artifact + 外部 signed exe 回灌”的 signed publication/deploy 交接链
- 已落地：补齐 `scripts/analyze-text-hygiene.ts`、`scripts/check-text-hygiene.ts` 与共享规则库，避免 `package.json` 中的文本卫生入口继续悬空
- 已收口：bridge / auth 路径里的旧 `claude` 命令提示，并把 Remote Control / auth status 的旧入口指导纳入文本卫生规则，避免 bridge 尾路径回退到错误命令
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
  - 当前它已经把“构建 + 分发 smoke + 本地 release bundle 驱动的 installer 下载/安装 + unsigned/signed release candidate staging + signed artifact 回灌 workflow 模拟 + GitHub Release publish/promote + 安装脚本主入口 + README / 关键 release-facing 文本一致性”收成单条固定检查
  - 该 gate 通过不代表 signing / 正式发布源 / 真实 auto-update 已完成，只代表本地候选产物没有明显回退
- 所以现在的状态不是“只能源码内演示”，而是“本地 beta 可体验、正式发布链路未完成”。

## 下一步

### 当前阶段下一步

1. 继续把 `smoke:distribution-readiness` 与 `smoke:release-preflight` 维持为绿色固定 gate
2. 推进 signed artifact、签名流程、GitHub Release promote 与正式发布源的真实闭环
3. 补正式发布后的升级 / 回滚验证，避免当前验证只停留在本地 mock / staged source
4. 清理 stale error / 旧路径兼容 / release-facing 文案尾项，减少本地 beta 使用中的误报和混乱
5. 继续把源码模式、分发产物与本地 PATH 安装作为固定对照验证项

### 下一阶段入口

1. 当前已进入 Phase 4，下一步聚焦签名、正式发布源与 update workflow
2. Phase 4 收口后，再考虑把更高层的交互式配置入口和运维文档补强提到主线
3. 后续新增完成项时，直接迁入归档而不是继续膨胀主 roadmap
