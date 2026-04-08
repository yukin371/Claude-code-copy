#!/usr/bin/env bun

import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'
import sharp from 'sharp'

type StageOptions = {
  skipStagePublication: boolean
}

type PublicationMetadata = {
  version: string
  platform: string
  signed: boolean
  signingStatus: string
  publishedBinary: string
  publishedBinarySha256: string
  manifest: string
}

type NativeInstallerMetadata = {
  version: string
  platform: string
  generatedAt: string
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
  icon: string
  iconSha256: string
  nsisScript: string
  nsisBuildScript: string
  nsisMetadata: string
  sourcePublicationRoot: string
  sourcePublicationBinary: string
  nextBlockers: string[]
}

function parseArgs(argv: string[]): StageOptions {
  let skipStagePublication = false

  for (const arg of argv) {
    if (arg === '--skip-stage-publication') {
      skipStagePublication = true
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  return { skipStagePublication }
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

function createSingleImageIco(pngBuffer: Buffer, size: number): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)

  const entry = Buffer.alloc(16)
  entry[0] = size >= 256 ? 0 : size
  entry[1] = size >= 256 ? 0 : size
  entry[2] = 0
  entry[3] = 0
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(pngBuffer.length, 8)
  entry.writeUInt32LE(header.length + entry.length, 12)

  return Buffer.concat([header, entry, pngBuffer])
}

async function buildInstallerIcon(
  sourceSvgPath: string,
  targetIconPath: string,
): Promise<void> {
  const pngBuffer = await sharp(sourceSvgPath)
    .resize(256, 256)
    .png()
    .toBuffer()

  await writeFile(targetIconPath, createSingleImageIco(pngBuffer, 256))
}

function toPowerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

async function createZipFromDirectory(
  sourceDirectory: string,
  archivePath: string,
): Promise<void> {
  const sourcePattern = `${sourceDirectory}\\*`
  const child = Bun.spawn(
    [
      'powershell',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `
$ErrorActionPreference = 'Stop'
$source = ${toPowerShellLiteral(sourcePattern)}
$archive = ${toPowerShellLiteral(archivePath)}
if (Test-Path $archive) {
  Remove-Item -LiteralPath $archive -Force
}
Compress-Archive -Path $source -DestinationPath $archive -CompressionLevel Optimal
      `,
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdout: 'inherit',
      stderr: 'inherit',
    },
  )

  const exitCode = await child.exited
  if (exitCode !== 0) {
    throw new Error(`Compress-Archive exited with ${exitCode}`)
  }
}

function buildInstallScript(binaryName: string): string {
  return `[CmdletBinding()]
param(
  [string]$InstallDir = (Join-Path $env:USERPROFILE '.local\\bin'),
  [string]$CommandName = 'neko',
  [switch]$SkipPathUpdate
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
  Write-Host "[neko-installer] $Message"
}

function Add-UserPathEntry([string]$Directory) {
  $normalized = [System.IO.Path]::GetFullPath($Directory)
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $parts = @()

  if (-not [string]::IsNullOrWhiteSpace($userPath)) {
    $parts = $userPath.Split(';', [System.StringSplitOptions]::RemoveEmptyEntries)
  }

  foreach ($part in $parts) {
    try {
      if ([System.IO.Path]::GetFullPath($part) -ieq $normalized) {
        return $false
      }
    } catch {
      if ($part -ieq $normalized) {
        return $false
      }
    }
  }

  $updated = if ([string]::IsNullOrWhiteSpace($userPath)) {
    $normalized
  } else {
    "$userPath;$normalized"
  }

  [Environment]::SetEnvironmentVariable('Path', $updated, 'User')
  return $true
}

$packageRootResolved = (Resolve-Path $PSScriptRoot).Path
$binarySource = Join-Path $packageRootResolved '${binaryName}'
$manifestPath = Join-Path $packageRootResolved 'installer-manifest.json'

if (-not (Test-Path $binarySource)) {
  throw "Packaged binary not found: $binarySource"
}

if (-not (Test-Path $manifestPath)) {
  throw "Installer manifest not found: $manifestPath"
}

$manifest = Get-Content $manifestPath | ConvertFrom-Json
$installDirResolved = [System.IO.Path]::GetFullPath($InstallDir)
New-Item -ItemType Directory -Force -Path $installDirResolved | Out-Null

$targetBinary = Join-Path $installDirResolved ("{0}.exe" -f $CommandName)
Copy-Item -Force $binarySource $targetBinary
Write-Step "Installed Neko Code $($manifest.version) to $targetBinary"

$pathChanged = $false
if (-not $SkipPathUpdate) {
  $pathChanged = Add-UserPathEntry -Directory $installDirResolved
}

if ($SkipPathUpdate) {
  Write-Step 'PATH update skipped by request.'
} elseif ($pathChanged) {
  Write-Step "Added $installDirResolved to user PATH. Open a new terminal before using '$CommandName'."
} else {
  Write-Step "$installDirResolved is already present in user PATH."
}

Write-Host ''
Write-Host 'Next steps:'
Write-Host "  $CommandName --version"
Write-Host "  $CommandName --help"
`
}

function buildInstallCmd(): string {
  return `@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
`
}

function buildNsisScript(version: string, binaryName: string): string {
  return `Unicode true
ManifestDPIAware true

!define PRODUCT_NAME "Neko Code"
!define PRODUCT_VERSION "${version}"
!define PRODUCT_PUBLISHER "Neko Code"
!define PRODUCT_EXE "${binaryName}"
!define PRODUCT_CMD "neko.exe"
!define INSTALL_DIR "$LOCALAPPDATA\\NekoCode\\bin"
!define PRODUCT_ICON "..\\assets\\neko-installer.ico"

!ifdef OUTPUT_EXE
  OutFile "\${OUTPUT_EXE}"
!else
  OutFile "neko-code-${version}-setup.exe"
!endif
InstallDir "\${INSTALL_DIR}"
RequestExecutionLevel user
Name "\${PRODUCT_NAME} \${PRODUCT_VERSION}"
SetCompressor /SOLID lzma
Icon "\${PRODUCT_ICON}"
UninstallIcon "\${PRODUCT_ICON}"

Page directory
Page instfiles

Section "Install"
  SetOutPath "$INSTDIR"
  File /oname=neko.exe "..\\package\\${binaryName}"
  File /oname=neko-installer.ico "..\\assets\\neko-installer.ico"
  WriteUninstaller "$INSTDIR\\Uninstall Neko Code.exe"
  CreateDirectory "$SMPROGRAMS\\Neko Code"
  CreateShortcut "$SMPROGRAMS\\Neko Code\\Neko Code.lnk" "$INSTDIR\\neko.exe" "" "$INSTDIR\\neko-installer.ico" 0
  CreateShortcut "$SMPROGRAMS\\Neko Code\\Uninstall Neko Code.lnk" "$INSTDIR\\Uninstall Neko Code.exe"
  CreateShortcut "$DESKTOP\\Neko Code.lnk" "$INSTDIR\\neko.exe" "" "$INSTDIR\\neko-installer.ico" 0
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\\Neko Code.lnk"
  Delete "$SMPROGRAMS\\Neko Code\\Neko Code.lnk"
  Delete "$SMPROGRAMS\\Neko Code\\Uninstall Neko Code.lnk"
  RMDir "$SMPROGRAMS\\Neko Code"
  Delete "$INSTDIR\\neko-installer.ico"
  Delete "$INSTDIR\\neko.exe"
  Delete "$INSTDIR\\Uninstall Neko Code.exe"
  RMDir "$INSTDIR"
SectionEnd
`
}

function buildNsisBuildScript(version: string): string {
  return `[CmdletBinding()]
param(
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Resolve-MakeNsis {
  $fromPath = Get-Command makensis -ErrorAction SilentlyContinue
  if ($fromPath) {
    return $fromPath.Source
  }

  $candidates = @(
    'C:\\Program Files (x86)\\NSIS\\makensis.exe',
    'C:\\Program Files (x86)\\NSIS\\Bin\\makensis.exe',
    'C:\\Program Files\\NSIS\\makensis.exe',
    'C:\\Program Files\\NSIS\\Bin\\makensis.exe'
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  return $null
}

$scriptRoot = (Resolve-Path $PSScriptRoot).Path
$nsisScript = Join-Path $scriptRoot 'neko-code-installer.nsi'
$output = Join-Path $scriptRoot 'output\\neko-code-${version}-setup.exe'
$makensis = Resolve-MakeNsis

if ($DryRun) {
  Write-Host "[PLAN] nsis-build"
  Write-Host "makensis=$makensis"
  Write-Host "script=$nsisScript"
  Write-Host "output=$output"
  Write-Host "command=$makensis /DOUTPUT_EXE=$output $nsisScript"
  exit 0
}

if (-not $makensis) {
  throw 'makensis was not found in PATH. Install NSIS before building the installer.'
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $output) | Out-Null
& $makensis /DOUTPUT_EXE=$output $nsisScript
if ($LASTEXITCODE -ne 0) {
  throw "makensis failed with exit code $LASTEXITCODE"
}

Write-Host "[PASS] nsis-build"
Write-Host "output=$output"
`
}

async function main(): Promise<void> {
  const repoRoot = process.cwd()
  const options = parseArgs(process.argv.slice(2))

  if (!options.skipStagePublication) {
    console.log('[RUN] stage-release-publication')
    await runCommand(['bun', 'run', 'scripts/stage-release-publication.ts'], repoRoot)
  }

  const packageJson = JSON.parse(
    await readFile(join(repoRoot, 'package.json'), 'utf8'),
  ) as { version: string }
  const version = packageJson.version
  const publicationRoot = join(repoRoot, 'dist', 'release-publication', version)
  const installerRoot = join(repoRoot, 'dist', 'native-installer', version)
  const packageRoot = join(installerRoot, 'package')
  const nsisRoot = join(installerRoot, 'nsis')
  const assetsRoot = join(installerRoot, 'assets')
  const metadataTarget = join(installerRoot, 'native-installer.json')
  const checksumsTarget = join(installerRoot, 'SHA256SUMS.txt')
  const installerScriptTarget = join(packageRoot, 'install.ps1')
  const installerCmdTarget = join(packageRoot, 'install.cmd')
  const packageManifestTarget = join(packageRoot, 'installer-manifest.json')
  const nsisScriptTarget = join(nsisRoot, 'neko-code-installer.nsi')
  const nsisBuildScriptTarget = join(nsisRoot, 'build-installer.ps1')
  const nsisMetadataTarget = join(nsisRoot, 'nsis-metadata.json')
  const installerIconTarget = join(assetsRoot, 'neko-installer.ico')
  const installerIconSource = join(
    repoRoot,
    'src',
    'assets',
    'neko-installer-icon.svg',
  )

  const publication = JSON.parse(
    await readFile(join(publicationRoot, 'release-publication.json'), 'utf8'),
  ) as PublicationMetadata
  const packageArchiveTarget = join(
    installerRoot,
    `neko-code-${version}-${publication.platform}-portable-installer.zip`,
  )
  const sourceBinary = join(publicationRoot, publication.publishedBinary)
  const sourceBinaryName = basename(publication.publishedBinary)
  const packageBinaryTarget = join(packageRoot, sourceBinaryName)

  await rm(installerRoot, { recursive: true, force: true })
  await mkdir(packageRoot, { recursive: true })
  await mkdir(nsisRoot, { recursive: true })
  await mkdir(assetsRoot, { recursive: true })
  await copyFile(sourceBinary, packageBinaryTarget)
  await buildInstallerIcon(installerIconSource, installerIconTarget)
  await writeFile(installerScriptTarget, buildInstallScript(sourceBinaryName), 'utf8')
  await writeFile(installerCmdTarget, buildInstallCmd(), 'utf8')
  await writeFile(nsisScriptTarget, buildNsisScript(version, sourceBinaryName), 'utf8')
  await writeFile(nsisBuildScriptTarget, buildNsisBuildScript(version), 'utf8')

  const generatedAt = new Date().toISOString()
  const binaryStats = await stat(packageBinaryTarget)
  const packageBinarySha256 = await sha256(packageBinaryTarget)
  const packageBinary = relative(installerRoot, packageBinaryTarget).replace(/\\/g, '/')
  const installScript = relative(installerRoot, installerScriptTarget).replace(/\\/g, '/')
  const installCmd = relative(installerRoot, installerCmdTarget).replace(/\\/g, '/')
  const packageManifest = relative(installerRoot, packageManifestTarget).replace(/\\/g, '/')
  const installerIcon = relative(installerRoot, installerIconTarget).replace(/\\/g, '/')
  const installerIconSha256 = await sha256(installerIconTarget)

  const installerManifest = {
    version,
    platform: publication.platform,
    generatedAt,
    signed: publication.signed,
    signingStatus: publication.signingStatus,
    binary: sourceBinaryName,
    binarySize: binaryStats.size,
    binarySha256: packageBinarySha256,
    installScript: 'install.ps1',
    installCmd: 'install.cmd',
    defaultInstallDir: '%USERPROFILE%\\.local\\bin',
    commandName: 'neko',
    sourcePublicationBinary: publication.publishedBinary,
    sourceManifest: publication.manifest,
    installCommands: {
      powershell: 'powershell -ExecutionPolicy Bypass -File .\\install.ps1',
      cmd: 'install.cmd',
    },
  }

  await writeFile(
    packageManifestTarget,
    `${JSON.stringify(installerManifest, null, 2)}\n`,
    'utf8',
  )
  const nsisMetadata = {
    version,
    platform: publication.platform,
    generatedAt,
    builder: 'nsis',
    script: 'neko-code-installer.nsi',
    buildScript: 'build-installer.ps1',
    expectedOutput: `output/neko-code-${version}-setup.exe`,
    requires: ['makensis'],
    sourcePackageRoot: '../package',
    sourceBinary: sourceBinaryName,
    dryRunCommand:
      'powershell -ExecutionPolicy Bypass -File .\\build-installer.ps1 -DryRun',
  }
  await writeFile(nsisMetadataTarget, `${JSON.stringify(nsisMetadata, null, 2)}\n`, 'utf8')
  await createZipFromDirectory(packageRoot, packageArchiveTarget)

  const packageArchive = relative(installerRoot, packageArchiveTarget).replace(/\\/g, '/')
  const packageArchiveSha256 = await sha256(packageArchiveTarget)
  const nsisScript = relative(installerRoot, nsisScriptTarget).replace(/\\/g, '/')
  const nsisBuildScript = relative(installerRoot, nsisBuildScriptTarget).replace(/\\/g, '/')
  const nsisMetadataPath = relative(installerRoot, nsisMetadataTarget).replace(/\\/g, '/')
  const metadata: NativeInstallerMetadata = {
    version,
    platform: publication.platform,
    generatedAt,
    signed: publication.signed,
    signingStatus: publication.signingStatus,
    packageRoot: 'package',
    packageBinary,
    packageBinarySha256,
    installScript,
    installCmd,
    packageManifest,
    packageArchive,
    packageArchiveSha256,
    icon: installerIcon,
    iconSha256: installerIconSha256,
    nsisScript,
    nsisBuildScript,
    nsisMetadata: nsisMetadataPath,
    sourcePublicationRoot: `dist/release-publication/${version}`,
    sourcePublicationBinary: publication.publishedBinary,
    nextBlockers: publication.signed
      ? ['NSIS toolchain 与签名流程尚未接入']
      : ['Windows 签名产物尚未接入', 'NSIS toolchain 与签名流程尚未接入'],
  }

  await writeFile(metadataTarget, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')

  const checksumEntries = [
    {
      file: packageBinary,
      hash: packageBinarySha256,
    },
    {
      file: installScript,
      hash: await sha256(installerScriptTarget),
    },
    {
      file: installCmd,
      hash: await sha256(installerCmdTarget),
    },
    {
      file: packageManifest,
      hash: await sha256(packageManifestTarget),
    },
    {
      file: packageArchive,
      hash: packageArchiveSha256,
    },
    {
      file: installerIcon,
      hash: installerIconSha256,
    },
    {
      file: nsisScript,
      hash: await sha256(nsisScriptTarget),
    },
    {
      file: nsisBuildScript,
      hash: await sha256(nsisBuildScriptTarget),
    },
    {
      file: nsisMetadataPath,
      hash: await sha256(nsisMetadataTarget),
    },
    {
      file: relative(installerRoot, metadataTarget).replace(/\\/g, '/'),
      hash: await sha256(metadataTarget),
    },
  ]

  await writeFile(
    checksumsTarget,
    `${checksumEntries.map(entry => `${entry.hash}  ${entry.file}`).join('\n')}\n`,
    'utf8',
  )

  console.log('[PASS] stage-native-installer')
  console.log(`  installerRoot=${installerRoot}`)
  console.log(`  version=${version}`)
  console.log(`  platform=${publication.platform}`)
  console.log(`  signed=${publication.signed}`)
  console.log(`  packageBinary=${packageBinaryTarget}`)
  console.log(`  installScript=${installerScriptTarget}`)
  console.log(`  installCmd=${installerCmdTarget}`)
  console.log(`  manifest=${packageManifestTarget}`)
  console.log(`  packageArchive=${packageArchiveTarget}`)
  console.log(`  nsisScript=${nsisScriptTarget}`)
  console.log(`  nsisBuildScript=${nsisBuildScriptTarget}`)
  console.log(`  metadata=${metadataTarget}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
