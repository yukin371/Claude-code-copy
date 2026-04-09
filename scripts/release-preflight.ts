#!/usr/bin/env bun

import { createHash } from 'node:crypto'
import { open, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'bun'

type Step = {
  label: string
  args: string[]
}

const commandSteps: Step[] = [
  {
    label: 'build-native',
    args: ['bun', 'run', 'build:native'],
  },
  {
    label: 'distribution-readiness',
    args: ['bun', 'run', 'smoke:distribution-readiness'],
  },
  {
    label: 'native-installer-local-bundle',
    args: [
      'bun',
      'run',
      'scripts/native-installer-local-bundle-smoke.ts',
      '--skip-build',
    ],
  },
  {
    label: 'stage-release-candidate',
    args: ['bun', 'run', 'scripts/stage-release-candidate.ts', '--skip-build'],
  },
  {
    label: 'stage-release-publication',
    args: ['bun', 'run', 'scripts/stage-release-publication.ts', '--skip-stage-candidate'],
  },
  {
    label: 'native-installer-release-publication',
    args: ['bun', 'run', 'scripts/native-installer-release-publication-smoke.ts', '--skip-stage-publication'],
  },
  {
    label: 'stage-native-installer',
    args: ['bun', 'run', 'scripts/stage-native-installer.ts', '--skip-stage-publication'],
  },
  {
    label: 'stage-native-installer-smoke',
    args: ['bun', 'run', 'scripts/stage-native-installer-smoke.ts', '--skip-stage-native-installer'],
  },
  {
    label: 'apply-signed-release-artifact',
    args: ['bun', 'run', 'scripts/apply-signed-release-artifact-smoke.ts'],
  },
  {
    label: 'stage-release-deploy',
    args: ['bun', 'run', 'scripts/stage-release-deploy-smoke.ts'],
  },
  {
    label: 'release-deploy-publish',
    args: ['bun', 'run', 'scripts/release-deploy-publish-smoke.ts', '--skip-stage-deploy'],
  },
  {
    label: 'native-update-cli-release-deploy',
    args: ['bun', 'run', 'scripts/native-update-cli-release-deploy-smoke.ts', '--skip-stage-deploy'],
  },
  {
    label: 'stage-github-release',
    args: ['bun', 'run', 'scripts/stage-github-release-smoke.ts', '--skip-signed-workflow'],
  },
  {
    label: 'publish-github-release',
    args: ['bun', 'run', 'scripts/publish-github-release-smoke.ts', '--skip-stage-github-release'],
  },
  {
    label: 'promote-github-release',
    args: ['bun', 'run', 'scripts/promote-github-release-smoke.ts'],
  },
  {
    label: 'native-update-cli-github-release',
    args: ['bun', 'run', 'scripts/native-update-cli-github-release-smoke.ts', '--skip-stage-github-release'],
  },
] as const

const readmeChecks = {
  required: [
    'bun run install:local-launcher',
    'bun run stage:native-installer',
    'bun run smoke:stage-native-installer',
    'bun run smoke:distribution-readiness',
    'bun run smoke:release-preflight',
    'bun run smoke:promote-github-release',
    'dist/neko-code.exe',
    'neko.exe',
  ],
  forbidden: [
    'claude doctor',
    'claude install',
    '~/.local/bin/claude',
  ],
} as const

const staticArtifactChecks = [
  {
    file: 'dist/neko-code.exe',
    minBytes: 1024,
    magic: 'MZ',
  },
  {
    file: 'dist/release-local/release.json',
    minBytes: 32,
    magic: '{',
  },
] as const

const installerScriptChecks = {
  file: 'scripts/install-local-launcher.ps1',
  required: [
    "[string]$CommandName = 'neko'",
    '$launcherName = "${CommandName}-launcher.exe"',
    "Join-Path $repoRootResolved 'dist\\neko-code.exe'",
    '("{0}.exe" -f $CommandName)',
  ],
  forbidden: [
    '.claude\\local',
    'claude.exe',
  ],
} as const

const releaseFacingChecks = [
  {
    file: 'src/components/AutoUpdater.tsx',
    required: ['CLI_COMMAND_NAME} doctor', 'cd ~/.neko-code/local && npm update'],
    forbidden: ['claude doctor', 'cd ~/.claude/local && npm update'],
  },
  {
    file: 'src/hooks/notifs/useNpmDeprecationNotification.tsx',
    required: ['CLI_COMMAND_NAME} install', 'PRODUCT_NAME'],
    forbidden: ['claude install', 'Claude Code has switched from npm'],
  },
  {
    file: 'src/utils/doctorDiagnostic.ts',
    required: [
      'const localInstallPath = getLocalClaudePath()',
      'alias ${CLI_COMMAND_NAME}="${localInstallPath}"',
    ],
    forbidden: ['alias claude="~/.claude/local/claude"'],
  },
] as const

const outstandingBlockers = [
  'NSIS toolchain 与签名流程尚未接入',
  '签名 artifact 尚未接入',
] as const

async function sha256(filePath: string): Promise<string> {
  const content = await readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

async function runStep(step: Step): Promise<void> {
  console.log(`\n[RUN] ${step.label}`)
  const child = spawn(step.args, {
    env: process.env,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const exitCode = await child.exited

  if (exitCode !== 0) {
    throw new Error(`${step.label} exited with ${exitCode}`)
  }
}

function assertIncludes(
  content: string,
  expected: string,
  description: string,
): void {
  if (!content.includes(expected)) {
    throw new Error(
      `${description} expected ${JSON.stringify(expected)}`,
    )
  }
}

function assertExcludes(
  content: string,
  unexpected: string,
  description: string,
): void {
  if (content.includes(unexpected)) {
    throw new Error(
      `${description} unexpectedly contained ${JSON.stringify(unexpected)}`,
    )
  }
}

async function runReadmeChecks(repoRoot: string): Promise<void> {
  console.log('\n[RUN] readme-checks')
  const readme = await readFile(join(repoRoot, 'README.md'), 'utf8')

  for (const expected of readmeChecks.required) {
    assertIncludes(readme, expected, 'README')
  }

  for (const unexpected of readmeChecks.forbidden) {
    assertExcludes(readme, unexpected, 'README')
  }

  console.log('[PASS] readme-checks')
}

async function runArtifactChecks(repoRoot: string): Promise<void> {
  console.log('\n[RUN] artifact-checks')

  const packageJson = JSON.parse(
    await readFile(join(repoRoot, 'package.json'), 'utf8'),
  ) as { version: string }
  const artifactChecks = [
    ...staticArtifactChecks,
    {
      file: `dist/release-candidate/${packageJson.version}/release-candidate.json`,
      minBytes: 32,
      magic: '{',
    },
    {
      file: `dist/release-candidate/${packageJson.version}/signing-manifest.json`,
      minBytes: 32,
      magic: '{',
    },
    {
      file: `dist/release-candidate/${packageJson.version}/publish-ready/channels/latest.json`,
      minBytes: 32,
      magic: '{',
    },
    {
      file: `dist/release-candidate/${packageJson.version}/publish-ready/channels/stable.json`,
      minBytes: 32,
      magic: '{',
    },
    {
      file: `dist/release-publication/${packageJson.version}/release-publication.json`,
      minBytes: 32,
      magic: '{',
    },
    {
      file: `dist/release-publication/${packageJson.version}/publish-ready/channels/latest.json`,
      minBytes: 32,
      magic: '{',
    },
    {
      file: `dist/release-publication/${packageJson.version}/publish-ready/channels/stable.json`,
      minBytes: 32,
      magic: '{',
    },
    {
      file: `dist/release-deploy/${packageJson.version}/release-deploy.json`,
      minBytes: 32,
      magic: '{',
    },
    {
      file: `dist/release-deploy/${packageJson.version}/upload-manifest.json`,
      minBytes: 32,
      magic: '{',
    },
    {
      file: `dist/native-installer/${packageJson.version}/native-installer.json`,
      minBytes: 32,
      magic: '{',
    },
    {
      file: `dist/native-installer/${packageJson.version}/package/installer-manifest.json`,
      minBytes: 32,
      magic: '{',
    },
    {
      file: `dist/native-installer/${packageJson.version}/package/install.ps1`,
      minBytes: 32,
      magic: '[',
    },
    {
      file: `dist/native-installer/${packageJson.version}/nsis/neko-code-installer.nsi`,
      minBytes: 32,
      magic: 'U',
    },
    {
      file: `dist/native-installer/${packageJson.version}/nsis/nsis-metadata.json`,
      minBytes: 32,
      magic: '{',
    },
    {
      file: `dist/native-installer/${packageJson.version}/neko-code-${packageJson.version}-win32-x64-portable-installer.zip`,
      minBytes: 1024,
      magic: 'PK',
    },
  ] as const

  for (const check of artifactChecks) {
    const artifactPath = join(repoRoot, check.file)
    const metadata = await stat(artifactPath)

    if (metadata.size < check.minBytes) {
      throw new Error(
        `${check.file} size ${metadata.size} < ${check.minBytes}`,
      )
    }

    const handle = await open(artifactPath, 'r')
    const headerBuffer = Buffer.alloc(check.magic.length)
    await handle.read(headerBuffer, 0, headerBuffer.length, 0)
    await handle.close()
    const header = headerBuffer.toString('utf8')
    assertIncludes(header, check.magic, check.file)
  }

  console.log('[PASS] artifact-checks')
}

async function runPublishReadyChecks(repoRoot: string): Promise<void> {
  console.log('\n[RUN] publish-ready-checks')
  const packageJson = JSON.parse(
    await readFile(join(repoRoot, 'package.json'), 'utf8'),
  ) as { version: string }
  const candidateRoot = join(
    repoRoot,
    'dist',
    'release-candidate',
    packageJson.version,
  )
  const releaseMetadata = JSON.parse(
    await readFile(join(candidateRoot, 'release-candidate.json'), 'utf8'),
  ) as {
    platform: string
    releaseArtifact: string
    signingStatus: string
    publishChannels?: string[]
    signingManifest?: string
  }
  const expectedPublishChannels = [
    'publish-ready/channels/latest.json',
    'publish-ready/channels/stable.json',
  ]

  if (releaseMetadata.signingStatus !== 'unsigned') {
    throw new Error('release candidate signing status is not unsigned')
  }
  if (releaseMetadata.signingManifest !== 'signing-manifest.json') {
    throw new Error('release candidate signing manifest path mismatch')
  }
  if (
    !Array.isArray(releaseMetadata.publishChannels)
    || releaseMetadata.publishChannels.length !== expectedPublishChannels.length
    || releaseMetadata.publishChannels.some(
      (value, index) => value !== expectedPublishChannels[index],
    )
  ) {
    throw new Error('release candidate publish channel paths mismatch')
  }

  const channels = ['latest', 'stable'] as const
  let expectedSha: string | undefined

  for (const channel of channels) {
    const channelPath = join(candidateRoot, 'publish-ready', 'channels', `${channel}.json`)
    const channelContent = JSON.parse(
      await readFile(channelPath, 'utf8'),
    ) as {
      channel: string
      version: string
      platform: string
      generatedAt: string
      artifact: string
      sha256: string
      signed: boolean
      signingStatus: string
      bundleMetadata: string
      installerInputBinary: string
      releaseCandidateMetadata: string
    }

    if (channelContent.channel !== channel) {
      throw new Error(`channel mismatch: ${channelPath}`)
    }
    if (channelContent.version !== packageJson.version) {
      throw new Error(`channel ${channel} version mismatch`)
    }
    if (channelContent.platform !== releaseMetadata.platform) {
      throw new Error(`channel ${channel} platform mismatch`)
    }
    if (channelContent.artifact !== releaseMetadata.releaseArtifact) {
      throw new Error(`channel ${channel} artifact mismatch`)
    }
    if (channelContent.signed !== false) {
      throw new Error(`channel ${channel} signed flag is not false`)
    }
    if (channelContent.signingStatus !== 'unsigned') {
      throw new Error(`channel ${channel} signing status is not unsigned`)
    }
    if (channelContent.bundleMetadata !== 'bundle/release.json') {
      throw new Error(`channel ${channel} bundle metadata path mismatch`)
    }
    if (channelContent.releaseCandidateMetadata !== 'release-candidate.json') {
      throw new Error(`channel ${channel} release metadata path mismatch`)
    }
    if (
      typeof channelContent.installerInputBinary !== 'string'
      || !channelContent.installerInputBinary.startsWith('bundle/')
    ) {
      throw new Error(`channel ${channel} installer input path missing`)
    }
    if (typeof channelContent.generatedAt !== 'string' || channelContent.generatedAt.length === 0) {
      throw new Error(`channel ${channel} generatedAt missing`)
    }
    if (typeof channelContent.sha256 !== 'string' || channelContent.sha256.length !== 64) {
      throw new Error(`channel ${channel} sha256 missing`)
    }
    if (!expectedSha) {
      expectedSha = channelContent.sha256
    } else if (expectedSha !== channelContent.sha256) {
      throw new Error('channel sha mismatch between latest and stable')
    }
  }

  if (!expectedSha) {
    throw new Error('publish-ready channels missing sha metadata')
  }

  const signingManifestPath = join(candidateRoot, 'signing-manifest.json')
  const manifest = JSON.parse(
    await readFile(signingManifestPath, 'utf8'),
  ) as {
    version: string
    platform: string
    generatedAt: string
    signingStatus: string
    unsignedInput: {
      path: string
      sha256: string
    }
    expectedSignedOutput: {
      path: string
      binaryName: string
    }
    publishChannels: string[]
  }

  if (manifest.signingStatus !== 'unsigned') {
    throw new Error('signing manifest status is not unsigned')
  }
  if (manifest.version !== packageJson.version) {
    throw new Error('signing manifest version mismatch')
  }
  if (manifest.platform !== releaseMetadata.platform) {
    throw new Error('signing manifest platform mismatch')
  }
  if (typeof manifest.generatedAt !== 'string' || manifest.generatedAt.length === 0) {
    throw new Error('signing manifest generatedAt missing')
  }
  if (
    !Array.isArray(manifest.publishChannels)
    || manifest.publishChannels.length !== expectedPublishChannels.length
    || manifest.publishChannels.some((value, index) => value !== expectedPublishChannels[index])
  ) {
    throw new Error('signing manifest publish channels mismatch')
  }
  if (manifest.unsignedInput.path !== releaseMetadata.releaseArtifact) {
    throw new Error('signing manifest unsigned path mismatch')
  }
  if (manifest.unsignedInput.sha256 !== expectedSha) {
    throw new Error('signing manifest sha mismatch')
  }
  if (
    !manifest.expectedSignedOutput.path.startsWith('signed/')
    || manifest.expectedSignedOutput.path.includes('-unsigned')
  ) {
    throw new Error('signing manifest signed output path mismatch')
  }
  if (
    !manifest.expectedSignedOutput.binaryName.endsWith('.exe')
    || manifest.expectedSignedOutput.binaryName.includes('-unsigned')
  ) {
    throw new Error('signing manifest signed binary name mismatch')
  }

  console.log('[PASS] publish-ready-checks')
}

async function runPublicationChecks(repoRoot: string): Promise<void> {
  console.log('\n[RUN] publication-checks')

  const packageJson = JSON.parse(
    await readFile(join(repoRoot, 'package.json'), 'utf8'),
  ) as { version: string }
  const publicationRoot = join(
    repoRoot,
    'dist',
    'release-publication',
    packageJson.version,
  )
  const publication = JSON.parse(
    await readFile(join(publicationRoot, 'release-publication.json'), 'utf8'),
  ) as {
    version: string
    platform: string
    signed: boolean
    signingStatus: string
    sourceArtifact: string
    publishedBinary: string
    publishedBinarySha256: string
    manifest: string
    channelPointers: string[]
    publishChannels: string[]
  }

  if (publication.version !== packageJson.version) {
    throw new Error('publication version mismatch')
  }
  if (!Array.isArray(publication.channelPointers) || publication.channelPointers.join(',') !== 'latest,stable') {
    throw new Error('publication channel pointers mismatch')
  }
  if (
    !Array.isArray(publication.publishChannels)
    || publication.publishChannels.join(',') !== 'publish-ready/channels/latest.json,publish-ready/channels/stable.json'
  ) {
    throw new Error('publication channel files mismatch')
  }
  if (publication.signingStatus !== (publication.signed ? 'signed' : 'unsigned')) {
    throw new Error('publication signing status mismatch')
  }
  if (typeof publication.sourceArtifact !== 'string' || publication.sourceArtifact.length === 0) {
    throw new Error('publication source artifact missing')
  }

  const latestPointer = (
    await readFile(join(publicationRoot, 'latest'), 'utf8')
  ).trim()
  const stablePointer = (
    await readFile(join(publicationRoot, 'stable'), 'utf8')
  ).trim()
  if (latestPointer !== packageJson.version || stablePointer !== packageJson.version) {
    throw new Error('publication channel pointer version mismatch')
  }

  const publishedBinaryPath = join(publicationRoot, publication.publishedBinary)
  const publishedBinarySha = await sha256(publishedBinaryPath)
  if (publishedBinarySha !== publication.publishedBinarySha256) {
    throw new Error('publication binary sha mismatch')
  }

  const manifest = JSON.parse(
    await readFile(join(publicationRoot, publication.manifest), 'utf8'),
  ) as {
    version: string
    platforms: Record<string, { checksum: string }>
  }
  if (manifest.version !== packageJson.version) {
    throw new Error('publication manifest version mismatch')
  }
  if (manifest.platforms[publication.platform]?.checksum !== publication.publishedBinarySha256) {
    throw new Error('publication manifest checksum mismatch')
  }

  for (const channel of ['latest', 'stable'] as const) {
    const channelMetadata = JSON.parse(
      await readFile(
        join(publicationRoot, 'publish-ready', 'channels', `${channel}.json`),
        'utf8',
      ),
    ) as {
      channel: string
      version: string
      platform: string
      artifact: string
      sha256: string
      signed: boolean
      signingStatus: string
      manifest: string
      sourceArtifact: string
    }

    if (channelMetadata.channel !== channel) {
      throw new Error(`publication ${channel} channel mismatch`)
    }
    if (channelMetadata.version !== packageJson.version) {
      throw new Error(`publication ${channel} version mismatch`)
    }
    if (channelMetadata.platform !== publication.platform) {
      throw new Error(`publication ${channel} platform mismatch`)
    }
    if (channelMetadata.artifact !== publication.publishedBinary) {
      throw new Error(`publication ${channel} artifact mismatch`)
    }
    if (channelMetadata.sha256 !== publication.publishedBinarySha256) {
      throw new Error(`publication ${channel} sha mismatch`)
    }
    if (channelMetadata.signed !== publication.signed) {
      throw new Error(`publication ${channel} signed mismatch`)
    }
    if (channelMetadata.signingStatus !== publication.signingStatus) {
      throw new Error(`publication ${channel} signing status mismatch`)
    }
    if (channelMetadata.manifest !== publication.manifest) {
      throw new Error(`publication ${channel} manifest mismatch`)
    }
    if (channelMetadata.sourceArtifact !== publication.sourceArtifact) {
      throw new Error(`publication ${channel} source artifact mismatch`)
    }
  }

  console.log('[PASS] publication-checks')
}

async function runDeployChecks(repoRoot: string): Promise<void> {
  console.log('\n[RUN] deploy-checks')

  const packageJson = JSON.parse(
    await readFile(join(repoRoot, 'package.json'), 'utf8'),
  ) as { version: string }
  const deployRoot = join(repoRoot, 'dist', 'release-deploy', packageJson.version)
  const deploy = JSON.parse(
    await readFile(join(deployRoot, 'release-deploy.json'), 'utf8'),
  ) as {
    version: string
    platform: string
    signed: boolean
    signingStatus: string
    payloadRoot: string
    uploadManifest: string
    payloadPointers: string[]
    publishedBinary: string
    publishedBinarySha256: string
    payloadPublishChannels: string[]
  }
  const uploadManifest = JSON.parse(
    await readFile(join(deployRoot, 'upload-manifest.json'), 'utf8'),
  ) as {
    version: string
    platform: string
    signed: boolean
    entries: Array<{ source: string; destination: string }>
  }

  if (deploy.version !== packageJson.version) {
    throw new Error('deploy version mismatch')
  }
  if (deploy.payloadRoot !== 'payload') {
    throw new Error('deploy payload root mismatch')
  }
  if (deploy.uploadManifest !== 'upload-manifest.json') {
    throw new Error('deploy upload manifest mismatch')
  }
  if (
    !Array.isArray(deploy.payloadPointers)
    || deploy.payloadPointers.join(',') !== 'latest,stable'
  ) {
    throw new Error('deploy payload pointers mismatch')
  }
  if (
    !Array.isArray(deploy.payloadPublishChannels)
    || deploy.payloadPublishChannels.join(',') !== 'publish-ready/channels/latest.json,publish-ready/channels/stable.json'
  ) {
    throw new Error('deploy publish channel list mismatch')
  }
  if (typeof deploy.publishedBinary !== 'string' || deploy.publishedBinary.length === 0) {
    throw new Error('deploy published binary missing')
  }
  if (typeof deploy.publishedBinarySha256 !== 'string' || deploy.publishedBinarySha256.length !== 64) {
    throw new Error('deploy published binary sha missing')
  }
  if (uploadManifest.version !== packageJson.version) {
    throw new Error('upload manifest version mismatch')
  }
  if (uploadManifest.platform !== deploy.platform) {
    throw new Error('upload manifest platform mismatch')
  }
  if (uploadManifest.signed !== deploy.signed) {
    throw new Error('upload manifest signed mismatch')
  }
  if (!Array.isArray(uploadManifest.entries) || uploadManifest.entries.length < 6) {
    throw new Error('upload manifest entries missing')
  }
  if (uploadManifest.entries.some(entry => !entry.source.startsWith('payload/'))) {
    throw new Error('upload manifest source path mismatch')
  }
  if (
    !uploadManifest.entries.some(entry => entry.destination === deploy.publishedBinary)
    || !uploadManifest.entries.some(entry => entry.destination === 'latest')
    || !uploadManifest.entries.some(entry => entry.destination === 'stable')
  ) {
    throw new Error('upload manifest required destinations missing')
  }

  console.log('[PASS] deploy-checks')
}

async function runNativeInstallerChecks(repoRoot: string): Promise<void> {
  console.log('\n[RUN] native-installer-checks')

  const packageJson = JSON.parse(
    await readFile(join(repoRoot, 'package.json'), 'utf8'),
  ) as { version: string }
  const installerRoot = join(repoRoot, 'dist', 'native-installer', packageJson.version)
  const metadata = JSON.parse(
    await readFile(join(installerRoot, 'native-installer.json'), 'utf8'),
  ) as {
    version: string
    platform: string
    signed: boolean
    signingStatus: string
    packageRoot: string
    packageBinary: string
    packageBinarySha256: string
    installScript: string
    installCmd: string
    packageManifest: string
    packageArchive: string
    packageArchiveSha256: string
    nsisScript: string
    nsisBuildScript: string
    nsisMetadata: string
  }
  const manifest = JSON.parse(
    await readFile(join(installerRoot, metadata.packageManifest), 'utf8'),
  ) as {
    version: string
    platform: string
    signed: boolean
    signingStatus: string
    binary: string
    binarySha256: string
    installScript: string
    installCmd: string
    sourcePublicationBinary: string
  }
  const nsisMetadata = JSON.parse(
    await readFile(join(installerRoot, metadata.nsisMetadata), 'utf8'),
  ) as {
    builder: string
    script: string
    buildScript: string
    expectedOutput: string
    requires: string[]
    sourcePackageRoot: string
  }
  const publication = JSON.parse(
    await readFile(
      join(repoRoot, 'dist', 'release-publication', packageJson.version, 'release-publication.json'),
      'utf8',
    ),
  ) as {
    platform: string
    signed: boolean
    signingStatus: string
    publishedBinary: string
    publishedBinarySha256: string
  }

  if (metadata.version !== packageJson.version) {
    throw new Error('native installer metadata version mismatch')
  }
  if (metadata.packageRoot !== 'package') {
    throw new Error('native installer package root mismatch')
  }
  if (metadata.platform !== publication.platform) {
    throw new Error('native installer platform mismatch')
  }
  if (metadata.signed !== publication.signed) {
    throw new Error('native installer signed mismatch')
  }
  if (metadata.signingStatus !== publication.signingStatus) {
    throw new Error('native installer signing status mismatch')
  }
  if (!metadata.packageBinary.startsWith('package/')) {
    throw new Error('native installer package binary path mismatch')
  }
  if (metadata.installScript !== 'package/install.ps1') {
    throw new Error('native installer install script path mismatch')
  }
  if (metadata.installCmd !== 'package/install.cmd') {
    throw new Error('native installer install cmd path mismatch')
  }
  if (!metadata.packageArchive.endsWith('-portable-installer.zip')) {
    throw new Error('native installer package archive path mismatch')
  }
  if (metadata.nsisScript !== 'nsis/neko-code-installer.nsi') {
    throw new Error('native installer nsis script path mismatch')
  }
  if (metadata.nsisBuildScript !== 'nsis/build-installer.ps1') {
    throw new Error('native installer nsis build script path mismatch')
  }
  if (metadata.nsisMetadata !== 'nsis/nsis-metadata.json') {
    throw new Error('native installer nsis metadata path mismatch')
  }

  const packagedBinarySha = await sha256(join(installerRoot, metadata.packageBinary))
  if (packagedBinarySha !== publication.publishedBinarySha256) {
    throw new Error('native installer packaged binary sha mismatch')
  }
  if (metadata.packageBinarySha256 !== publication.publishedBinarySha256) {
    throw new Error('native installer metadata sha mismatch')
  }
  if (metadata.packageArchiveSha256 !== await sha256(join(installerRoot, metadata.packageArchive))) {
    throw new Error('native installer archive sha mismatch')
  }

  if (manifest.version !== packageJson.version) {
    throw new Error('native installer manifest version mismatch')
  }
  if (manifest.platform !== publication.platform) {
    throw new Error('native installer manifest platform mismatch')
  }
  if (manifest.signed !== publication.signed) {
    throw new Error('native installer manifest signed mismatch')
  }
  if (manifest.signingStatus !== publication.signingStatus) {
    throw new Error('native installer manifest signing status mismatch')
  }
  if (manifest.binary !== metadata.packageBinary.split('/').at(-1)) {
    throw new Error('native installer manifest binary name mismatch')
  }
  if (manifest.binarySha256 !== publication.publishedBinarySha256) {
    throw new Error('native installer manifest sha mismatch')
  }
  if (manifest.installScript !== 'install.ps1' || manifest.installCmd !== 'install.cmd') {
    throw new Error('native installer manifest install entry mismatch')
  }
  if (manifest.sourcePublicationBinary !== publication.publishedBinary) {
    throw new Error('native installer manifest source publication mismatch')
  }
  if (nsisMetadata.builder !== 'nsis') {
    throw new Error('native installer nsis builder mismatch')
  }
  if (nsisMetadata.script !== 'neko-code-installer.nsi') {
    throw new Error('native installer nsis metadata script mismatch')
  }
  if (nsisMetadata.buildScript !== 'build-installer.ps1') {
    throw new Error('native installer nsis metadata build script mismatch')
  }
  if (!nsisMetadata.expectedOutput.endsWith('-setup.exe')) {
    throw new Error('native installer nsis expected output mismatch')
  }
  if (!Array.isArray(nsisMetadata.requires) || !nsisMetadata.requires.includes('makensis')) {
    throw new Error('native installer nsis requirements mismatch')
  }
  if (nsisMetadata.sourcePackageRoot !== '../package') {
    throw new Error('native installer nsis source package root mismatch')
  }

  console.log('[PASS] native-installer-checks')
}

async function runInstallerScriptChecks(repoRoot: string): Promise<void> {
  console.log('\n[RUN] installer-script-checks')
  const content = await readFile(join(repoRoot, installerScriptChecks.file), 'utf8')

  for (const expected of installerScriptChecks.required) {
    assertIncludes(content, expected, installerScriptChecks.file)
  }

  for (const unexpected of installerScriptChecks.forbidden) {
    assertExcludes(content, unexpected, installerScriptChecks.file)
  }

  console.log('[PASS] installer-script-checks')
}

async function runReleaseFacingChecks(repoRoot: string): Promise<void> {
  console.log('\n[RUN] release-facing-text-checks')

  for (const check of releaseFacingChecks) {
    const content = await readFile(join(repoRoot, check.file), 'utf8')

    for (const expected of check.required) {
      assertIncludes(content, expected, check.file)
    }

    for (const unexpected of check.forbidden) {
      assertExcludes(content, unexpected, check.file)
    }
  }

  console.log('[PASS] release-facing-text-checks')
}

async function main(): Promise<void> {
  const repoRoot = process.cwd()

  for (const step of commandSteps) {
    await runStep(step)
  }

  await runArtifactChecks(repoRoot)
  await runPublishReadyChecks(repoRoot)
  await runPublicationChecks(repoRoot)
  await runDeployChecks(repoRoot)
  await runNativeInstallerChecks(repoRoot)
  await runInstallerScriptChecks(repoRoot)
  await runReadmeChecks(repoRoot)
  await runReleaseFacingChecks(repoRoot)

  console.log('\n[PASS] release-preflight')
  console.log('  local candidate gate is green')
  console.log('  outstanding external blockers:')
  for (const blocker of outstandingBlockers) {
    console.log(`  - ${blocker}`)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
