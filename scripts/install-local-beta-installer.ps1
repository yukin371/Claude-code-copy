[CmdletBinding()]
param(
  [string]$RepoRoot = '',
  [switch]$SkipStage,
  [switch]$BuildOnly,
  [switch]$SkipUninstall,
  [switch]$SkipVerification
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
  Write-Host "[neko-beta] $Message"
}

function Append-DisabledMcpServer([string]$Existing, [string]$ServerName) {
  if ([string]::IsNullOrWhiteSpace($Existing)) {
    return $ServerName
  }

  $parts = $Existing.Split(',', [System.StringSplitOptions]::RemoveEmptyEntries)
  foreach ($part in $parts) {
    if ($part.Trim() -ieq $ServerName) {
      return $Existing
    }
  }

  return "$Existing,$ServerName"
}

function Wait-FileUnlocked([string]$Path, [int]$Retries = 20) {
  for ($attempt = 0; $attempt -lt $Retries; $attempt += 1) {
    try {
      $stream = [System.IO.File]::Open($Path, 'Open', 'Read', 'ReadWrite')
      $stream.Close()
      return
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  throw "File remained locked: $Path"
}

function Invoke-WithRetry(
  [scriptblock]$Action,
  [string]$Description,
  [int]$Retries = 20
) {
  for ($attempt = 0; $attempt -lt $Retries; $attempt += 1) {
    try {
      return & $Action
    } catch {
      if ($attempt -eq ($Retries - 1)) {
        throw "$Description failed after retries: $($_.Exception.Message)"
      }

      Start-Sleep -Seconds 1
    }
  }
}

function Update-PathShim(
  [string]$BunPath,
  [string]$LauncherSource,
  [string]$ShimBinary,
  [int]$Retries = 5
) {
  for ($attempt = 0; $attempt -lt $Retries; $attempt += 1) {
    & $BunPath build --compile $LauncherSource --outfile $ShimBinary
    if ($LASTEXITCODE -eq 0) {
      return $true
    }

    Start-Sleep -Seconds 1
  }

  return $false
}

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

$repoRootResolved = [System.IO.Path]::GetFullPath($RepoRoot)
$packageJsonPath = Join-Path $repoRootResolved 'package.json'
if (-not (Test-Path $packageJsonPath)) {
  throw "package.json not found under repo root: $packageJsonPath"
}

$bun = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bun) {
  throw 'bun was not found in PATH. Install Bun before building the local beta installer.'
}

$packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
$version = [string]$packageJson.version
if ([string]::IsNullOrWhiteSpace($version)) {
  throw 'Failed to resolve package version from package.json'
}

$publicationMetadata = Join-Path $repoRootResolved "dist\release-publication\$version\release-publication.json"
if (-not $SkipStage) {
  if (Test-Path $publicationMetadata) {
    Write-Step "Staging native installer for version $version (reuse existing publication)"
    & $bun.Source run scripts/stage-native-installer.ts --skip-stage-publication
  } else {
    Write-Step "Staging native installer for version $version"
    & $bun.Source run scripts/stage-native-installer.ts
  }

  if ($LASTEXITCODE -ne 0) {
    throw "stage-native-installer failed with exit code $LASTEXITCODE"
  }
}

$buildScriptPath = Join-Path $repoRootResolved "dist\native-installer\$version\nsis\build-installer.ps1"
$setupExePath = Join-Path $repoRootResolved "dist\native-installer\$version\nsis\output\neko-code-$version-setup.exe"

if (-not (Test-Path $buildScriptPath)) {
  throw "NSIS build script missing: $buildScriptPath"
}

Write-Step "Building NSIS setup.exe for version $version"
& powershell -ExecutionPolicy Bypass -File $buildScriptPath
if ($LASTEXITCODE -ne 0) {
  throw "NSIS build failed with exit code $LASTEXITCODE"
}

if (-not (Test-Path $setupExePath)) {
  throw "Expected setup.exe not found: $setupExePath"
}

Write-Step "Built setup.exe at $setupExePath"

if ($BuildOnly) {
  Write-Host ''
  Write-Host 'Next steps:'
  Write-Host "  powershell -ExecutionPolicy Bypass -Command ""& '$setupExePath' /S"""
  Write-Host "  $env:LOCALAPPDATA\NekoCode\bin\neko.exe --version"
  exit 0
}

$env:NEKO_CODE_DISABLED_MCP_SERVERS = Append-DisabledMcpServer $env:NEKO_CODE_DISABLED_MCP_SERVERS 'serena'
$installDir = Join-Path $env:LOCALAPPDATA 'NekoCode\bin'
$installedBinary = Join-Path $installDir 'neko.exe'
$uninstaller = Join-Path $installDir 'Uninstall Neko Code.exe'
$shimDir = Join-Path $HOME '.local\bin'
$shimLauncherSource = Join-Path $repoRootResolved 'scripts\local-compiled-launcher.ts'
$shimBinary = Join-Path $shimDir 'neko.exe'

if ((Test-Path $uninstaller) -and (-not $SkipUninstall)) {
  Write-Step "Removing previous local beta install from $installDir"
  & $uninstaller /S
  Start-Sleep -Seconds 2
}

Write-Step "Installing local beta to $installDir"
& $setupExePath /S
Start-Sleep -Seconds 2

if (-not (Test-Path $installedBinary)) {
  throw "Installed binary missing: $installedBinary"
}

Wait-FileUnlocked -Path $installedBinary

if (-not (Test-Path $shimLauncherSource)) {
  throw "Launcher source not found: $shimLauncherSource"
}

New-Item -ItemType Directory -Force -Path $shimDir | Out-Null
Write-Step "Refreshing PATH shim at $shimBinary"
if (-not (Update-PathShim -BunPath $bun.Source -LauncherSource $shimLauncherSource -ShimBinary $shimBinary)) {
  Write-Warning "Failed to refresh PATH shim at $shimBinary; direct install remains usable via $installedBinary"
}

if ($SkipVerification) {
  Write-Step 'Verification skipped by request.'
  Write-Host ''
  Write-Host 'Next steps:'
  Write-Host "  $installedBinary --version"
  Write-Host "  $installedBinary --help"
  exit 0
}

$versionOutput = (Invoke-WithRetry -Description 'neko --version' -Action {
  & $installedBinary --version | Out-String
}).Trim()
$helpHeader = ((Invoke-WithRetry -Description 'neko --help' -Action {
  & $installedBinary --help | Select-Object -First 1
}) | Out-String).Trim()
$updateHelpHeader = ((Invoke-WithRetry -Description 'neko update --help' -Action {
  & $installedBinary update --help | Select-Object -First 1
}) | Out-String).Trim()
$shimVersionOutput = if (Test-Path $shimBinary) {
  (Invoke-WithRetry -Description 'PATH neko --version' -Action {
    & $shimBinary --version | Out-String
  }).Trim()
} else {
  'PATH shim unavailable'
}

Write-Step 'Local beta install verified'
Write-Host "  installDir=$installDir"
Write-Host "  setupExe=$setupExePath"
Write-Host "  pathShim=$shimBinary"
  Write-Host "  version=$versionOutput"
Write-Host "  pathVersion=$shimVersionOutput"
  Write-Host "  help=$helpHeader"
  Write-Host "  updateHelp=$updateHelpHeader"
