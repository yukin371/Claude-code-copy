[CmdletBinding()]
param(
  [Parameter()]
  [switch]$KeepTemp
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$packageJson = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
$version = [string]$packageJson.version
$candidateRoot = Join-Path $repoRoot "dist/release-candidate/$version"

function New-TempPassword {
  $chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*()-_=+'
  $random = 1..24 | ForEach-Object { $chars[(Get-Random -Minimum 0 -Maximum $chars.Length)] }
  return -join $random
}

Write-Host '[RUN] stage-release-candidate'
& bun run scripts/stage-release-candidate.ts --skip-build
if ($LASTEXITCODE -ne 0) {
  throw "stage-release-candidate.ts exited with code $LASTEXITCODE"
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("neko-sign-release-smoke-{0}" -f [System.Guid]::NewGuid().ToString('N'))
$certSubject = "CN=Neko Code Smoke Signing $([System.Guid]::NewGuid().ToString('N'))"
$passwordPlainText = New-TempPassword
$securePassword = ConvertTo-SecureString -String $passwordPlainText -AsPlainText -Force
$pfxPath = Join-Path $tempRoot 'codesign.pfx'
$cerPath = Join-Path $tempRoot 'codesign.cer'
$rootImport = $null
$publisherImport = $null
$certificate = $null

New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

try {
  Write-Host '[RUN] create self-signed code signing certificate'
  $certificate = New-SelfSignedCertificate `
    -Subject $certSubject `
    -Type CodeSigningCert `
    -CertStoreLocation 'Cert:\CurrentUser\My' `
    -KeyExportPolicy Exportable `
    -NotAfter (Get-Date).AddDays(7)

  if (-not $certificate) {
    throw 'Failed to create self-signed certificate for signing smoke'
  }

  Export-Certificate -Cert $certificate -FilePath $cerPath | Out-Null
  Export-PfxCertificate -Cert $certificate -FilePath $pfxPath -Password $securePassword | Out-Null

  $rootImport = Import-Certificate -FilePath $cerPath -CertStoreLocation 'Cert:\CurrentUser\Root'
  $publisherImport = Import-Certificate -FilePath $cerPath -CertStoreLocation 'Cert:\CurrentUser\TrustedPublisher'

  Write-Host '[RUN] sign-release-candidate'
  & (Join-Path $repoRoot 'scripts/sign-release-candidate.ps1') `
    -CandidateRoot $candidateRoot `
    -PfxPath $pfxPath `
    -PfxPassword $passwordPlainText `
    -AllowPowerShellSigningFallback `
    -FileDescription 'Neko Code Smoke'

  if ($LASTEXITCODE -ne 0) {
    throw "sign-release-candidate.ps1 exited with code $LASTEXITCODE"
  }

  $signingManifest = Get-Content -LiteralPath (Join-Path $candidateRoot 'signing-manifest.json') -Raw | ConvertFrom-Json
  $signedBinaryPath = Join-Path $candidateRoot ([string]$signingManifest.expectedSignedOutput.path)
  if (-not (Test-Path -LiteralPath $signedBinaryPath)) {
    throw "Signed binary not found after smoke: $signedBinaryPath"
  }

  $signature = Get-AuthenticodeSignature -FilePath $signedBinaryPath
  if ($signature.Status -ne 'Valid') {
    throw "Signed binary verification failed with status $($signature.Status)"
  }

  Write-Host '[PASS] sign-release-candidate-smoke'
  Write-Host "  version=$version"
  Write-Host "  signed=$signedBinaryPath"
  Write-Host "  thumbprint=$($certificate.Thumbprint)"
} finally {
  if ($publisherImport -and $publisherImport.Thumbprint) {
    Remove-Item -LiteralPath ("Cert:\CurrentUser\TrustedPublisher\{0}" -f $publisherImport.Thumbprint) -Force -ErrorAction SilentlyContinue
  }
  if ($rootImport -and $rootImport.Thumbprint) {
    Remove-Item -LiteralPath ("Cert:\CurrentUser\Root\{0}" -f $rootImport.Thumbprint) -Force -ErrorAction SilentlyContinue
  }
  if ($certificate -and $certificate.Thumbprint) {
    Remove-Item -LiteralPath ("Cert:\CurrentUser\My\{0}" -f $certificate.Thumbprint) -Force -ErrorAction SilentlyContinue
  }
  if (-not $KeepTemp) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  } else {
    Write-Host "  tempRoot=$tempRoot"
  }
}
