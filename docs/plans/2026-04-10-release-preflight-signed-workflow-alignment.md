# 2026-04-10 release-preflight 与 signed workflow 对齐记录

## 背景

- Phase 4 收尾中，`smoke:release-preflight` 已作为本地候选发布物 gate。
- 本轮新增目标是把 signed publication/deploy 交接链纳入固定 gate，避免只在独立 smoke 中验证。

## 本轮对齐项

1. `scripts/signed-release-publication-workflow-smoke.ts`
   - 新增 `--skip-build` 与 `--skip-stage-candidate` 参数。
   - 支持在已有候选产物基础上复用现场，减少 preflight 内部重复构建。
2. `scripts/release-preflight.ts`
   - 新增 `signed-release-publication-workflow` 步骤。
   - 以 `--skip-build --skip-stage-candidate` 方式接入，保证单次 gate 时长可控。
   - 外部阻塞文案改为“真实外部 signed artifact / signing service 尚未接入”，避免把“已有本地 signed 回灌模拟”误写成未接入。
3. `docs/analysis/neko-code-roadmap.md`
   - 已同步“recently verified”与“本地候选发布物 gate 覆盖范围”描述，明确 signed publication workflow 已并入 preflight。

## 验证结果

- `bun run typecheck`：通过。
- `bun run smoke:release-preflight`：通过。
  - 日志已出现并通过 `signed-release-publication-workflow` 步骤。
  - 仍保留外部 blocker：
    - NSIS toolchain 与签名流程尚未接入
    - 真实外部 signed artifact / signing service 尚未接入

## 收尾结论

- 本轮属于“Phase 4 gate 加固 + 文档对齐”收口，不改变主路线图优先级。
- 后续仍按 roadmap 的 P0 继续推进真实 signing 与正式发布源闭环。
