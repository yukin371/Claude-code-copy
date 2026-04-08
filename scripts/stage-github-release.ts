#!/usr/bin/env bun

import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

type StageOptions = {
  skipStageDeploy: boolean
  allowUnsigned: boolean
  skipStageNativeInstaller: boolean
}

type ReleaseCandidateMetadata = {
  version: string
  platform: string
}

type SigningManifest = {
  expectedSignedOutput: {
    path: string
    binaryName: string
  }
}

type ReleasePublicationMetadata = {
  version: string
  platform: string
  signed: boolean
  signingStatus: string
  publishedBinary: string
  publishedBinarySha256: string
  manifest: string
}

type ReleaseDeployMetadata = {
  version: string
  platform: string
  signed: boolean
  signingStatus: string
  payloadRoot: string
  uploadManifest: string
  publishedBinary: string
  publishedBinarySha256: string
}

type NativeInstallerMetadata = {
  installScript: string
  installCmd: string
  packageManifest: string
  packageArchive: string
  nsisScript: string
  nsisBuildScript: string
  nsisMetadata: string
}

function parseArgs(argv: string[]): StageOptions {
  let skipStageDeploy = false
  let allowUnsigned = false
  let skipStageNativeInstaller = false

  for (const arg of argv) {
    if (arg === '--skip-stage-deploy') {
      skipStageDeploy = true
      continue
    }

    if (arg === '--allow-unsigned') {
      allowUnsigned = true
      continue
    }

    if (arg === '--skip-stage-native-installer') {
      skipStageNativeInstaller = true
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  return { skipStageDeploy, allowUnsigned, skipStageNativeInstaller }
}

async function runCommand(args: string[], cwd: string): Promise<void> {
  const child = Bun.spawn(args, {
    cwd,
    env: process.env,
    stdout: 'inherit',
    stderr: 'inherit',
  })

  const exitCode = await child.exited
  if (exitCode !== 0) {
    throw new Error(`${args.join(' ')} exited with ${exitCode}`)
  }
}

async function sha256(filePath: string): Promise<string> {
  const content = await readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  const repoRoot = process.cwd()
  const options = parseArgs(process.argv.slice(2))

  if (!options.skipStageDeploy) {
    console.log('[RUN] stage-release-deploy')
    await runCommand(['bun', 'run', 'scripts/stage-release-deploy.ts'], repoRoot)
  }
  if (!options.skipStageNativeInstaller) {
    console.log('[RUN] stage-native-installer')
    await runCommand(
      ['bun', 'run', 'scripts/stage-native-installer.ts', '--skip-stage-publication'],
      repoRoot,
    )
  }

  const packageJson = JSON.parse(
    await readFile(join(repoRoot, 'package.json'), 'utf8'),
  ) as { version: string }
  const version = packageJson.version
  const candidateRoot = join(repoRoot, 'dist', 'release-candidate', version)
  const publicationRoot = join(repoRoot, 'dist', 'release-publication', version)
  const deployRoot = join(repoRoot, 'dist', 'release-deploy', version)
  const nativeInstallerRoot = join(repoRoot, 'dist', 'native-installer', version)
  const githubReleaseRoot = join(repoRoot, 'dist', 'github-release', version)
  const assetsRoot = join(githubReleaseRoot, 'assets')
  const notesTarget = join(githubReleaseRoot, 'release-notes.md')
  const metadataTarget = join(githubReleaseRoot, 'release-github.json')
  const checksumsTarget = join(assetsRoot, `neko-code-${version}-github-release-checksums.txt`)

  const candidate = JSON.parse(
    await readFile(join(candidateRoot, 'release-candidate.json'), 'utf8'),
  ) as ReleaseCandidateMetadata
  const signingManifest = JSON.parse(
    await readFile(join(candidateRoot, 'signing-manifest.json'), 'utf8'),
  ) as SigningManifest
  const publication = JSON.parse(
    await readFile(join(publicationRoot, 'release-publication.json'), 'utf8'),
  ) as ReleasePublicationMetadata
  const deploy = JSON.parse(
    await readFile(join(deployRoot, 'release-deploy.json'), 'utf8'),
  ) as ReleaseDeployMetadata
  const nativeInstaller = JSON.parse(
    await readFile(join(nativeInstallerRoot, 'native-installer.json'), 'utf8'),
  ) as NativeInstallerMetadata

  if (!publication.signed && !options.allowUnsigned) {
    throw new Error(
      'GitHub release staging requires a signed publication. Re-run after apply-signed-release-artifact or pass --allow-unsigned.',
    )
  }

  const canonicalBinarySource = publication.signed
    ? join(candidateRoot, signingManifest.expectedSignedOutput.path)
    : join(publicationRoot, publication.publishedBinary)
  const canonicalBinaryName = publication.signed
    ? signingManifest.expectedSignedOutput.binaryName
    : `neko-code-${version}-${candidate.platform}-unsigned.exe`

  if (!(await fileExists(canonicalBinarySource))) {
    throw new Error(`Canonical binary missing: ${canonicalBinarySource}`)
  }

  await rm(githubReleaseRoot, { recursive: true, force: true })
  await mkdir(assetsRoot, { recursive: true })

  const assetCopies = [
    {
      source: canonicalBinarySource,
      name: canonicalBinaryName,
      label: 'Primary signed Windows binary',
      kind: 'binary',
    },
    {
      source: join(publicationRoot, publication.manifest),
      name: `neko-code-${version}-${candidate.platform}-manifest.json`,
      label: 'Published version manifest',
      kind: 'manifest',
    },
    {
      source: join(deployRoot, deploy.uploadManifest),
      name: `neko-code-${version}-${candidate.platform}-upload-manifest.json`,
      label: 'Deploy upload manifest',
      kind: 'upload-manifest',
    },
    {
      source: join(publicationRoot, 'release-publication.json'),
      name: `neko-code-${version}-${candidate.platform}-release-publication.json`,
      label: 'Publication metadata',
      kind: 'publication-metadata',
    },
    {
      source: join(deployRoot, 'release-deploy.json'),
      name: `neko-code-${version}-${candidate.platform}-release-deploy.json`,
      label: 'Deploy metadata',
      kind: 'deploy-metadata',
    },
    {
      source: join(publicationRoot, 'latest'),
      name: `neko-code-${version}-${candidate.platform}-channel-latest.txt`,
      label: 'Latest channel pointer',
      kind: 'channel-pointer',
    },
    {
      source: join(publicationRoot, 'stable'),
      name: `neko-code-${version}-${candidate.platform}-channel-stable.txt`,
      label: 'Stable channel pointer',
      kind: 'channel-pointer',
    },
    {
      source: join(publicationRoot, 'publish-ready', 'channels', 'latest.json'),
      name: `neko-code-${version}-${candidate.platform}-channel-latest.json`,
      label: 'Latest channel metadata',
      kind: 'channel-metadata',
    },
    {
      source: join(publicationRoot, 'publish-ready', 'channels', 'stable.json'),
      name: `neko-code-${version}-${candidate.platform}-channel-stable.json`,
      label: 'Stable channel metadata',
      kind: 'channel-metadata',
    },
    {
      source: join(nativeInstallerRoot, nativeInstaller.installScript),
      name: `neko-code-${version}-${candidate.platform}-install.ps1`,
      label: 'Portable installer PowerShell entrypoint',
      kind: 'installer-script',
    },
    {
      source: join(nativeInstallerRoot, nativeInstaller.installCmd),
      name: `neko-code-${version}-${candidate.platform}-install.cmd`,
      label: 'Portable installer CMD entrypoint',
      kind: 'installer-script',
    },
    {
      source: join(nativeInstallerRoot, nativeInstaller.packageManifest),
      name: `neko-code-${version}-${candidate.platform}-installer-manifest.json`,
      label: 'Portable installer manifest',
      kind: 'installer-manifest',
    },
    {
      source: join(nativeInstallerRoot, 'native-installer.json'),
      name: `neko-code-${version}-${candidate.platform}-native-installer.json`,
      label: 'Portable installer staging metadata',
      kind: 'installer-metadata',
    },
    {
      source: join(nativeInstallerRoot, nativeInstaller.packageArchive),
      name: `neko-code-${version}-${candidate.platform}-portable-installer.zip`,
      label: 'Portable installer package archive',
      kind: 'installer-package',
    },
    {
      source: join(nativeInstallerRoot, nativeInstaller.nsisScript),
      name: `neko-code-${version}-${candidate.platform}-nsis-installer.nsi`,
      label: 'NSIS installer source script',
      kind: 'installer-backend',
    },
    {
      source: join(nativeInstallerRoot, nativeInstaller.nsisBuildScript),
      name: `neko-code-${version}-${candidate.platform}-nsis-build.ps1`,
      label: 'NSIS build entrypoint',
      kind: 'installer-backend',
    },
    {
      source: join(nativeInstallerRoot, nativeInstaller.nsisMetadata),
      name: `neko-code-${version}-${candidate.platform}-nsis-metadata.json`,
      label: 'NSIS backend metadata',
      kind: 'installer-backend',
    },
  ]

  const stagedAssets: Array<{
    name: string
    label: string
    kind: string
    size: number
    sha256: string
  }> = []

  for (const asset of assetCopies) {
    const target = join(assetsRoot, asset.name)
    await copyFile(asset.source, target)
    const metadata = await stat(target)
    stagedAssets.push({
      name: asset.name,
      label: asset.label,
      kind: asset.kind,
      size: metadata.size,
      sha256: await sha256(target),
    })
  }

  await writeFile(
    checksumsTarget,
    `${stagedAssets.map(asset => `${asset.sha256}  ${asset.name}`).join('\n')}\n`,
    'utf8',
  )
  const checksumsHash = await sha256(checksumsTarget)
  const checksumsStat = await stat(checksumsTarget)
  stagedAssets.push({
    name: checksumsTarget.split(/[/\\]/).at(-1)!,
    label: 'Checksums for GitHub release assets',
    kind: 'checksums',
    size: checksumsStat.size,
    sha256: checksumsHash,
  })

  const notes = [
    `# Neko Code ${version}`,
    '',
    publication.signed
      ? `- 签名状态：signed`
      : `- 签名状态：unsigned`,
    `- 平台：${candidate.platform}`,
    `- 主下载文件：${canonicalBinaryName}`,
    `- 推荐安装包：neko-code-${version}-${candidate.platform}-portable-installer.zip`,
    `- 发布来源：GitHub Releases`,
    '',
    '## Recommended Downloads',
    `- Windows installer: neko-code-${version}-${candidate.platform}-portable-installer.zip`,
    `- Direct binary: ${canonicalBinaryName}`,
    '',
    '## Included Assets',
    ...stagedAssets.map(asset => `- ${asset.name}: ${asset.label}`),
    '',
    '## Notes',
    '- `release-publication.json` / `release-deploy.json` / `upload-manifest.json` 用于回放和镜像发布。',
    '- `portable-installer.zip` 提供 Windows portable installer 基线；解压后运行 `install.ps1` 或 `install.cmd` 即可安装。',
    '- 已随发布包附带 NSIS installer source/build 基线，后续只需接入 `makensis` 与签名流程即可产出 setup.exe。',
    '- 已支持通过 `NEKO_CODE_NATIVE_INSTALLER_GITHUB_REPO=<owner>/<repo>` 让 native installer / `neko update` 直接从 GitHub Release 资产取版本与二进制。',
  ].join('\n')
  await writeFile(notesTarget, `${notes}\n`, 'utf8')

  const metadata = {
    version,
    generatedAt: new Date().toISOString(),
    tagName: `v${version}`,
    releaseName: `Neko Code v${version}`,
    draft: true,
    prerelease: true,
    signed: publication.signed,
    signingStatus: publication.signingStatus,
    notesFile: 'release-notes.md',
    assetsDir: 'assets',
    primaryAsset: canonicalBinaryName,
    installerAsset: `neko-code-${version}-${candidate.platform}-portable-installer.zip`,
    recommendedAssets: {
      installer: `neko-code-${version}-${candidate.platform}-portable-installer.zip`,
      directBinary: canonicalBinaryName,
    },
    publishPolicy: {
      publishDefaults: {
        draft: true,
        prerelease: true,
      },
      promoteTargets: {
        draft: {
          draft: true,
          prerelease: true,
          latest: false,
        },
        prerelease: {
          draft: false,
          prerelease: true,
          latest: false,
        },
        stable: {
          draft: false,
          prerelease: false,
          latest: true,
        },
      },
    },
    sourceRoots: {
      releaseCandidate: `dist/release-candidate/${version}`,
      releasePublication: `dist/release-publication/${version}`,
      releaseDeploy: `dist/release-deploy/${version}`,
      nativeInstaller: `dist/native-installer/${version}`,
    },
    assets: stagedAssets,
  }

  await writeFile(metadataTarget, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')

  console.log('[PASS] stage-github-release')
  console.log(`  githubReleaseRoot=${githubReleaseRoot}`)
  console.log(`  notes=${notesTarget}`)
  console.log(`  metadata=${metadataTarget}`)
  console.log(`  primaryAsset=${join(assetsRoot, canonicalBinaryName)}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
