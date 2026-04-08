# 2026-04-09 工作区改动分组说明

## 目的

- 解释当前工作区为什么会同时出现大量 `M` 与 `??`
- 区分“应保留的正式改动”与“已清理的临时产物”
- 为后续拆 commit / 做 release branch / 再次收口提供分组依据

## 结论

当前 `git status` 中剩余的改动，均来自此前多轮代理推进，不是用户手工修改。  
这批文件大多数已经进入实际执行链路，不能再按“孤立试验稿”处理。

此前 roadmap 只记录阶段目标、gate 和里程碑，没有同步记录“实际触达了哪些文件簇”，这是文档缺口，已在本说明中补齐。

## 已清理的无关产物

以下内容已按“本机噪音”处理，不再作为仓库改动的一部分：

- 根目录 `.*.bun-build`
- 根目录 `.tmp*`
- 根目录 `typecheck.log`
- 本地忽略：
  - `dist/`
  - `.*.bun-build`

说明：

- 这些文件仅是构建 / 调试 / typecheck 临时产物，不属于应提交内容
- 忽略规则写入 `.git/info/exclude`，只影响本地，不改仓库级 `.gitignore`

## 当前应保留的改动分组

### 1. 文档与阶段计划

用途：

- 对齐当前 active phase、Phase 4 提前落地情况、beta 可用性和 release-facing gate

主要文件：

- `README.md`
- `docs/analysis/neko-code-roadmap.md`
- `docs/plans/2026-04-08-staged-delivery-plan.md`
- `docs/plans/2026-04-08-session-continue-smoke.md`
- `docs/analysis/multi-api-provider-compatibility-dev-notes.md`

### 2. 发布 / 分发 / 安装链路

用途：

- 让本地 beta、release candidate、publication、deploy、GitHub Release 逐步形成可执行链路

主要文件：

- `scripts/build-local-release-bundle.ts`
- `scripts/stage-release-candidate.ts`
- `scripts/stage-release-publication.ts`
- `scripts/stage-release-deploy.ts`
- `scripts/stage-native-installer.ts`
- `scripts/stage-github-release.ts`
- `scripts/promote-github-release.ts`
- `scripts/apply-signed-release-artifact.ts`
- `scripts/install-local-beta-installer.ps1`
- `.github/workflows/release-candidate.yml`
- `.github/workflows/release-signed-publication.yml`
- `.github/workflows/github-release-publish.yml`
- `.github/workflows/github-release-promote.yml`

### 3. 状态型 smoke / 系统回归

用途：

- 为 Phase 3 与本地分发收口提供固定 smoke 和聚合 gate

主要文件：

- `scripts/session-continue-smoke.ts`
- `scripts/session-resume-worktree-smoke.ts`
- `scripts/plugin-cli-state-smoke.ts`
- `scripts/context-compact-smoke.ts`
- `scripts/phase3-system-regression-smoke.ts`
- `scripts/migrated-config-system-smoke.ts`
- `scripts/distribution-readiness-smoke.ts`
- `scripts/release-preflight.ts`
- `scripts/release-facing-diagnostics-smoke.ts`
- `scripts/native-distribution-smoke.ts`
- `scripts/native-local-install-smoke.ts`
- `scripts/native-installer-local-bundle-smoke.ts`
- `scripts/native-installer-release-publication-smoke.ts`
- `scripts/stage-native-installer-smoke.ts`
- `scripts/stage-github-release-smoke.ts`
- `scripts/stage-release-deploy-smoke.ts`
- `scripts/release-deploy-publish-smoke.ts`
- `scripts/native-update-cli-release-deploy-smoke.ts`
- `scripts/native-update-cli-github-release-smoke.ts`
- `scripts/signed-release-publication-workflow-smoke.ts`
- `scripts/promote-github-release-smoke.ts`
- `scripts/apply-signed-release-artifact-smoke.ts`

### 4. CLI / 命令 / 文案收口

用途：

- 对齐 `neko` 主入口、help/doctor/install/update 文案、MCP/plugin 状态页与旧品牌残留

主要文件：

- `src/cli/update.ts`
- `src/cli/print.ts`
- `src/cli/handlers/mcp.tsx`
- `src/commands/plugin/PluginSettings.tsx`
- `src/commands/plugin/index.tsx`
- `src/commands/plugin/DiscoverPlugins.tsx`
- `src/commands/plugin/ManageMarketplaces.tsx`
- `src/commands/doctor/index.ts`
- `src/utils/doctorDiagnostic.ts`
- `src/utils/status.tsx`
- `src/components/*` 下多处 release-facing / brand-facing UI

### 5. provider/router 与配置路径收口

用途：

- 继续稳定 route-aware 行为、token/vcr 缓存键、项目配置目录解析与迁移路径

主要文件：

- `src/services/api/claude.ts`
- `src/services/tokenEstimation.ts`
- `src/services/vcr.ts`
- `src/utils/model/taskRouting.ts`
- `src/utils/model/taskRouting.test.ts`
- `src/utils/analyzeContext.ts`
- `src/utils/markdownConfigLoader.ts`
- `src/utils/projectConfigPathResolution.ts`
- `src/utils/projectConfigPathResolution.test.ts`
- `src/migrations/migrateClaudeConfigToNekoHome.ts`
- `src/migrations/migrateClaudeConfigToNekoHome.test.ts`

### 6. MCP / skills / native installer 辅助收口

用途：

- 收敛 MCP 配置路径、skill 发现路径和 native installer 相关实现

主要文件：

- `src/services/mcp/client.ts`
- `src/services/mcp/config.ts`
- `src/services/mcp/client.test.ts`
- `src/services/mcp/config.test.ts`
- `src/skills/loadSkillsDir.ts`
- `src/skills/bundled/skillify.ts`
- `src/utils/skills/skillChangeDetector.ts`
- `src/utils/nativeInstaller/download.ts`
- `src/utils/nativeInstaller/installer.ts`
- `src/assets/neko-installer-icon.svg`

## 为什么 roadmap 之前看不出来

原因不是“文件没有对应工作”，而是 roadmap 的粒度过粗：

- 记录了阶段目标与验证 gate
- 记录了新增 smoke / release 流程
- 但没有把这些目标实际扩散到的文件簇写出来

结果就是：

- 文档看起来像只推进了少量阶段项
- 工作区却已经形成跨 `README / scripts / workflows / src / tests` 的大面积改动

这个差异本身就是文档欠账，不是用户遗漏操作。

## 后续整理建议

如果下一步要继续收口，建议按下面顺序拆：

1. `docs + README`
2. `Phase 3 smoke / stateful workflow`
3. `release pipeline / native installer / GitHub workflows`
4. `CLI / UI / branding / stale-state fix`
5. `provider-router / config-path / tests`

这样后续不管是拆 commit、做 PR 还是回退某一组，都更可控。
