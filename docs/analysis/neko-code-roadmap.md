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
- 当前默认执行规则：
  - 以后默认按阶段计划推进
  - 只有当前 active phase 的 Exit Conditions 满足后，才切到下一阶段
  - 不属于当前阶段 in-scope 的事项，默认回收到 roadmap 或后续阶段，不临时插队

## 当前版本目标

1. 多 API 与原 Anthropic API 并存，默认行为不冲突
2. 支持每个对话使用不同 provider / model / API 路由
3. 保持工具协议兼容，不单独改协议层
4. 明确“应用内路由 vs 外部网关”的边界，避免把运维型流量治理继续堆进应用
5. 持续保持文档、验证脚本和实现状态一致，避免“做到一半但文档已宣告完成”
6. 产出一个像 Claude Code 一样可直接从终端启动的本地可运行版本，而不要求用户手动执行 `bun src/entrypoints/cli.tsx`

## 当前执行阶段

- active phase：
  - Phase 2. provider/router 闭环
- 本阶段要解决的问题：
  - 把 provider/router 主路径与关键辅助路径继续收口
  - 在真实回归里稳定“直连 provider”和“外部 gateway”两种模式
- 当前阶段状态：
  - Phase 1 已完成并归档到阶段计划
  - native build 基线已提前打通，可作为后续阶段的稳定验证手段
- 本阶段完成前，不默认切去做：
  - 大范围状态型工作流补完
  - 发布渠道 / auto-update
  - 非关键低频功能恢复

## 当前进行中

### 1. 统一 provider / router 抽象

- 目标：把主线程、subagent、前端修改、审查等任务路由到统一 provider/router 层
- 当前状态：
  - task route execution target 骨架已接入
  - 主查询路径已通过 route transport 接入 openai-compatible shim
  - `sideQuery` 与 token estimation 等主辅助链路已接入 route-aware client
- 剩余收口：
  - 辅助路径与策略层继续补齐
  - 降低不同 provider 下行为漂移

### 2. 任务级模型与 API 路由闭环

- 目标：主线程 / subagent / review / frontend 等任务可按配置选择不同 provider/model/apiStyle/baseUrl
- 当前状态：
  - 路由配置已可从 `settings.json` 读取
  - 运行时已接入任务提示词解析，用于前端 / 审查类任务自动切换模型
- 剩余收口：
  - 继续补齐非主查询路径
  - 确保配置可见性和回归验证足够稳定

### 3. 外部网关集成边界与最小应用内回退

- 目标：应用内只保留任务级 provider/model/api 路由与最小安全回退，权重均衡、健康检查、熔断、key 池与聚合转发由外部网关承接
- 当前状态：
  - endpoint/provider 回退代码已存在，可作为过渡期兼容层
  - 已确认长期方向：外部网关承担负载均衡与故障转移的主职责
- 剩余收口：
  - 把长期边界同步到指南、计划和模块文档
  - 明确哪些本地 fallback 仍然保留为安全兜底
  - 补充“直连 provider”与“接外部网关”两种模式的回归验证

### 4. 终端直启版本与本地分发收口

- 目标：像 Claude Code 一样，用户安装后可直接在终端运行 `neko` / `neko-code`，而不是依赖仓库源码入口命令
- 当前状态：
  - 当前仓库已可通过 `bun src/entrypoints/cli.tsx` 直接运行
  - 已补一个本地验证 launcher，可编译出仅面向当前仓库的 `dist/neko-code-local.exe`
  - 该 launcher 已验证可跑 `--version`、`--help`、`-p --max-turns 1 "Reply with exactly OK"`
  - 直接对主入口执行 `bun run build:native` 已成功生成 `dist/neko-code.exe`
  - 编译产物已验证可跑 `--version`、`--help`
- 当前已知尾项：
  - 编译产物 `-p` 单轮回放需要在 API 连通状态正常时复验
  - Phase 4 仍需补“安装后不依赖仓库源码路径”的完整本地分发 workflow
- 剩余收口：
  - 把当前 native build 能力沉淀成稳定脚本与阶段验证项
  - 后续再补 shell integration / PATH / launcher install 的完整分发路径

## 待完成

### P0

1. 完成 provider/router 主链路收口
2. 完成任务级模型/API 路由闭环
3. 完成外部网关集成边界收口，并限制应用内 fallback 只保留最小安全能力
4. 建立“终端直启版本”收口清单，并把 native build 阻塞按“缺失模块 / 缺失依赖 / 可裁剪 ant-only 功能”三类拆开清零
5. 产出一个在当前机器可安装到 PATH 的本地 launcher/workflow，先满足“终端直接输入命令即可运行”的最低目标

### P1

1. 更完整的品牌文案清理与旧路径兼容收尾
2. 更上层的交互式配置入口
3. 外部网关接入示例、运维约束与观测文档补强
4. 继续推进真正可分发的单文件 native build，而不是仅限本仓库内可运行的 launcher

## 最近已验证推进

- 已验证：`bun run typecheck`
- 已验证：多 provider / route helper 回归已覆盖 `direct-provider` 与 `gateway` 两种模式
- 已验证：任务路由回归已覆盖 `querySource -> route` 的 review / frontend hint 映射
- 已验证：状态页已可查看非 `main` 任务路由矩阵
- 已验证：只读 smoke 矩阵已更新到 22 条用例
- 已验证：plugin refresh 隔离 smoke 已收口
- 已验证：LSP refresh 隔离 smoke 已收口，并修补了重复 scope 回归
- 已验证：session resume 隔离 harness 已收口，并修补了 direct resume metadata 漏传
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
- 已验证：`powershell -ExecutionPolicy Bypass -File scripts/readonly-smoke.ps1 -Workflow routing` 现已覆盖并断言 `direct-provider` 与 `single-upstream gateway` 两种模式
- 已验证：本轮入口收口后再次通过 `bun run typecheck`、`bun run smoke:claude-config`、`bun run test:routing`

更多已确认完成项见归档文档，不再在主 roadmap 中重复展开。

## 下一步

### 当前阶段下一步

1. 按 Phase 2 继续补齐 provider/router 的辅助路径与真实回归矩阵
2. 在 API 连通状态恢复时补跑源码模式与编译产物的 `-p` 对照烟测
3. 把 native build 结果作为后续阶段的固定验证项，而不是重新回到 blocker 摸排

### 下一阶段入口

1. Phase 2 完成后，切入 Phase 3 的状态型工作流闭环
2. Phase 3 再做“复制现有 Claude 配置”的系统回归
3. 后续新增完成项时，直接迁入归档而不是继续膨胀主 roadmap
