# 2026-04-15 Windows 签名接入流程

## 目标

- 把 `release-candidate.yml` 产出的 unsigned candidate 接到真实 Windows 签名步骤。
- 保持现有 `release-signed-publication.yml` / `github-release-publish.yml` 不改主流程，只增加签名前置 workflow。

## 已落地入口

- 新 workflow：
  - [windows-sign-artifact.yml](../../.github/workflows/windows-sign-artifact.yml)
- 新脚本：
  - [sign-release-candidate.ps1](../../scripts/sign-release-candidate.ps1)

## 前置条件

1. 仓库 Secrets 已配置：
   - `WINDOWS_SIGN_CERT_B64`
     - PFX 文件的 base64
   - `WINDOWS_SIGN_CERT_PASSWORD`
     - PFX 密码
2. Windows runner 上可用 `signtool.exe`
   - 当前 workflow 默认跑在 `windows-latest`
   - 如果托管 runner 没有满足你证书策略的签名环境，改成 self-hosted Windows runner
3. 时间戳服务可用
   - 当前 workflow 默认 `http://timestamp.digicert.com`

## 触发顺序

1. 运行 `release-candidate.yml`
   - 产出 `neko-code-release-candidate-<version>-unsigned-win32-x64`
2. 运行 `windows-sign-artifact.yml`
   - 输入：
     - `version`
     - `release_candidate_run_id`
     - 可选 `release_candidate_artifact_name`
     - 可选 `timestamp_url`
   - 输出 artifact：
     - `neko-code-signed-<version>-win32-x64`
3. 运行 `release-signed-publication.yml`
   - 输入：
     - `version`
     - `release_candidate_run_id`
     - `signed_artifact_run_id`
       - 传 `windows-sign-artifact.yml` 的 run id
     - `signed_artifact_name`
       - 传 `neko-code-signed-<version>-win32-x64`
     - 可选 `publish_github_release`
     - 可选 `promote_target`

## 脚本行为

`sign-release-candidate.ps1` 会：

1. 读取 `dist/release-candidate/<version>/signing-manifest.json`
2. 校验 unsigned exe 的 SHA256 是否等于 manifest 中的 `unsignedInput.sha256`
3. 把 unsigned exe 复制到 `expectedSignedOutput.path`
4. 用 `signtool sign` 进行签名和时间戳
5. 用 `Get-AuthenticodeSignature` 做签后校验
6. 输出：
   - `signed_binary`
   - `signed_sha256`
   - `signtool_path`

## 当前边界

- 当前只接 Windows `.exe` 的签名接缝。
- NSIS 安装器本身的签名还没有并入这个 workflow。
- workflow 已接入真实签名步骤；仓库内现已有本地 smoke 用于预验证脚本链路，但真实发布验证仍依赖配置好的 Secrets 和 runner。

## 本地预验证

- 现已新增：
  - `bun run smoke:sign-release-candidate`
- 这条 smoke 会：
  1. 生成临时代码签名证书
  2. 导出临时 PFX
  3. 调用 `scripts/sign-release-candidate.ps1`
  4. 校验 `dist/release-candidate/<version>/signed/` 下产物的 Authenticode 签名有效
- 用途边界：
  - 只验证脚本 / manifest / 输出链路
  - 不替代真实证书、真实 secrets、真实 runner 与真实时间戳服务验证
