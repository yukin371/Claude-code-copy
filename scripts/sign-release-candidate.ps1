[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$CandidateRoot,

  [Parameter()]
  [string]$PfxPath = '',

  [Parameter()]
  [string]$PfxBase64 = '',

  [Parameter(Mandatory = $true)]
  [string]$PfxPassword,

  [Parameter()]
  [string]$TimestampUrl = 'http://timestamp.digicert.com',

  [Parameter()]
  [string]$FileDescription = 'Neko Code',

  [Parameter()]
  [string]$DigestAlgorithm = 'SHA256',

  [Parameter()]
  [switch]$AllowPowerShellSigningFallback
)

$ErrorActionPreference = 'Stop'

function Resolve-SignToolPath {
  $command = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $searchRoots = @()
  if ($env:ProgramFiles) {
    $searchRoots += (Join-Path $env:ProgramFiles 'Windows Kits')
  }
  if (${env:ProgramFiles(x86)}) {
    $searchRoots += (Join-Path ${env:ProgramFiles(x86)} 'Windows Kits')
  }

  foreach ($root in $searchRoots | Select-Object -Unique) {
    if (-not (Test-Path -LiteralPath $root)) {
      continue
    }

    $matches = Get-ChildItem -Path $root -Recurse -Filter signtool.exe -File -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending
    if ($matches) {
      return $matches[0].FullName
    }
  }

  throw 'signtool.exe not found. Install Windows SDK signing tools or run this workflow on a Windows runner that already has signtool.'
}

function Get-RequiredFileHash {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Import-PfxCertificateObject {
  param(
    [Parameter(Mandatory = $true)]
    [string]$CertificatePath,

    [Parameter(Mandatory = $true)]
    [string]$CertificatePassword
  )

  $flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable `
    -bor [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::PersistKeySet

  return [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
    $CertificatePath,
    $CertificatePassword,
    $flags
  )
}

$candidateRootPath = Resolve-Path -LiteralPath $CandidateRoot
$manifestPath = Join-Path $candidateRootPath 'signing-manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "Signing manifest not found: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$unsignedRelative = [string]$manifest.unsignedInput.path
$expectedUnsignedSha = [string]$manifest.unsignedInput.sha256
$signedRelative = [string]$manifest.expectedSignedOutput.path
$signedBinaryName = [string]$manifest.expectedSignedOutput.binaryName

if ([string]::IsNullOrWhiteSpace($unsignedRelative) -or [string]::IsNullOrWhiteSpace($signedRelative)) {
  throw "signing-manifest.json is missing expected input/output paths: $manifestPath"
}

$unsignedPath = Join-Path $candidateRootPath $unsignedRelative
$signedPath = Join-Path $candidateRootPath $signedRelative

if (-not (Test-Path -LiteralPath $unsignedPath)) {
  throw "Unsigned input not found: $unsignedPath"
}

$unsignedSha = Get-RequiredFileHash -Path $unsignedPath
if ($expectedUnsignedSha -and $unsignedSha -ne $expectedUnsignedSha.ToLowerInvariant()) {
  throw "Unsigned input SHA256 mismatch. Expected $expectedUnsignedSha but got $unsignedSha"
}

$resolvedPfxPath = $PfxPath
$tempPfxPath = $null

if ([string]::IsNullOrWhiteSpace($resolvedPfxPath)) {
  if ([string]::IsNullOrWhiteSpace($PfxBase64)) {
    throw 'Either -PfxPath or -PfxBase64 must be provided.'
  }

  $tempPfxPath = Join-Path ([System.IO.Path]::GetTempPath()) ("neko-signing-{0}.pfx" -f ([System.Guid]::NewGuid().ToString('N')))
  [System.IO.File]::WriteAllBytes($tempPfxPath, [Convert]::FromBase64String($PfxBase64))
  $resolvedPfxPath = $tempPfxPath
}

if (-not (Test-Path -LiteralPath $resolvedPfxPath)) {
  throw "Signing certificate not found: $resolvedPfxPath"
}

$signedDir = Split-Path -Parent $signedPath
New-Item -ItemType Directory -Path $signedDir -Force | Out-Null
Copy-Item -LiteralPath $unsignedPath -Destination $signedPath -Force

try {
  $signToolPath = $null

  try {
    $signToolPath = Resolve-SignToolPath
  } catch {
    if (-not $AllowPowerShellSigningFallback) {
      throw
    }
  }

  if ($signToolPath) {
    Write-Host "[RUN] signtool"
    Write-Host "  manifest=$manifestPath"
    Write-Host "  unsigned=$unsignedPath"
    Write-Host "  signed=$signedPath"
    Write-Host "  signtool=$signToolPath"

    & $signToolPath sign `
      /fd $DigestAlgorithm `
      /td $DigestAlgorithm `
      /tr $TimestampUrl `
      /f $resolvedPfxPath `
      /p $PfxPassword `
      /d $FileDescription `
      $signedPath

    if ($LASTEXITCODE -ne 0) {
      throw "signtool sign exited with code $LASTEXITCODE"
    }
  } else {
    Write-Host "[RUN] Set-AuthenticodeSignature fallback"
    Write-Host "  manifest=$manifestPath"
    Write-Host "  unsigned=$unsignedPath"
    Write-Host "  signed=$signedPath"
    Write-Host "  fallback=powershell"

    $certificate = Import-PfxCertificateObject -CertificatePath $resolvedPfxPath -CertificatePassword $PfxPassword
    $fallbackResult = Set-AuthenticodeSignature `
      -FilePath $signedPath `
      -Certificate $certificate `
      -HashAlgorithm $DigestAlgorithm

    if (-not $fallbackResult) {
      throw "Set-AuthenticodeSignature returned no result for $signedPath"
    }
    if ($fallbackResult.Status -ne 'Valid') {
      throw "PowerShell signing fallback failed for $signedPath with status $($fallbackResult.Status)"
    }
  }

  $signature = Get-AuthenticodeSignature -FilePath $signedPath
  if ($signature.Status -ne 'Valid') {
    throw "Authenticode verification failed for $signedPath with status $($signature.Status)"
  }

  $signedSha = Get-RequiredFileHash -Path $signedPath
  $signingToolLabel = if ($signToolPath) { $signToolPath } else { 'powershell:Set-AuthenticodeSignature' }

  Write-Host '[PASS] sign-release-candidate'
  Write-Host "  signedBinaryName=$signedBinaryName"
  Write-Host "  signedSha256=$signedSha"

  if ($env:GITHUB_OUTPUT) {
    Add-Content -LiteralPath $env:GITHUB_OUTPUT -Value "signed_binary=$signedPath"
    Add-Content -LiteralPath $env:GITHUB_OUTPUT -Value "signed_sha256=$signedSha"
    Add-Content -LiteralPath $env:GITHUB_OUTPUT -Value "signtool_path=$signingToolLabel"
  }
} finally {
  if ($tempPfxPath -and (Test-Path -LiteralPath $tempPfxPath)) {
    Remove-Item -LiteralPath $tempPfxPath -Force
  }
}
