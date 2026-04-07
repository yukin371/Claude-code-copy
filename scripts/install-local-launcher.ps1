[CmdletBinding()]
param(
  [string]$RepoRoot = '',
  [string]$InstallDir = (Join-Path $HOME '.local\bin'),
  [string]$CommandName = 'neko',
  [switch]$SkipPathUpdate,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
  Write-Host "[neko-launcher] $Message"
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

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

$repoRootResolved = [System.IO.Path]::GetFullPath($RepoRoot)
$launcherSource = Join-Path $repoRootResolved 'scripts\local-compiled-launcher.ts'
$packageJson = Join-Path $repoRootResolved 'package.json'
$entrypoint = Join-Path $repoRootResolved 'src\entrypoints\cli.tsx'

if (-not (Test-Path $launcherSource)) {
  throw "Launcher source not found: $launcherSource"
}

if (-not (Test-Path $packageJson)) {
  throw "package.json not found under repo root: $packageJson"
}

if (-not (Test-Path $entrypoint)) {
  throw "CLI entrypoint not found under repo root: $entrypoint"
}

$bun = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bun) {
  throw 'bun was not found in PATH. Install Bun before installing the local launcher.'
}

$installDirResolved = [System.IO.Path]::GetFullPath($InstallDir)
New-Item -ItemType Directory -Force -Path $installDirResolved | Out-Null

$outFile = Join-Path $installDirResolved ("{0}.exe" -f $CommandName)

if ((Test-Path $outFile) -and (-not $Force)) {
  Write-Step "Existing launcher found at $outFile; rebuilding in place."
}

Write-Step "Compiling local launcher to $outFile"
& $bun.Source build --compile $launcherSource --outfile $outFile
if ($LASTEXITCODE -ne 0) {
  throw "bun build failed with exit code $LASTEXITCODE"
}

$pathChanged = $false
if (-not $SkipPathUpdate) {
  $pathChanged = Add-UserPathEntry -Directory $installDirResolved
}

Write-Step "Launcher ready: $outFile"
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
