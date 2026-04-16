# 2026-04-15 unsigned GitHub Release 流程

## 目标

- 在不接入 Windows 证书和签名服务的前提下，直接发布 GitHub draft/prerelease。
- 复用现有 unsigned release candidate，不改 signed publication 主链。

## 入口

- 新 workflow：
  - [github-release-publish-unsigned.yml](../../.github/workflows/github-release-publish-unsigned.yml)

## 触发顺序

1. 运行 `release-candidate.yml`
   - 获取 `release_candidate_run_id`
2. 运行 `github-release-publish-unsigned.yml`
   - 输入：
     - `version`
     - `release_candidate_run_id`
     - 可选 `release_candidate_artifact_name`

## workflow 做的事

1. 下载 unsigned candidate artifact
2. 执行：
   - `stage-release-publication.ts --skip-stage-candidate`
   - `stage-release-deploy.ts --skip-stage-publication`
   - `stage-native-installer.ts --skip-stage-publication`
3. 以 `--allow-unsigned` 方式执行：
   - `stage-github-release.ts`
   - `stage-github-release-smoke.ts`
4. 调用 `publish-github-release.ts`
   - 直接发布 GitHub draft/prerelease

## 当前限制

- 发布物是 unsigned Windows binary / installer package。
- Windows 上会有 SmartScreen / 信任提示。
- 这个流程适合：
  - 内部试用
  - 技术预览
  - beta / prerelease
- 不适合：
  - 面向普通最终用户的大规模正式发布
  - 需要企业签名信任链的分发

## 与 signed 流程的关系

- unsigned GitHub 发布不会替代：
  - [windows-sign-artifact.yml](../../.github/workflows/windows-sign-artifact.yml)
  - [release-signed-publication.yml](../../.github/workflows/release-signed-publication.yml)
- 后续如果接入证书，仍建议切回 signed 流程作为正式发布主线。
