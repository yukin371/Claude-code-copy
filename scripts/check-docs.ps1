[CmdletBinding()]
param(
  [switch]$RequireBootstrap,

  [switch]$SkipCommands,

  [switch]$SkipGuardrails,

  [switch]$SkipModules,

  [int]$CommandTimeoutSec = 45
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $RepoRoot

$Results = New-Object System.Collections.Generic.List[object]

function Add-Result {
  param(
    [ValidateSet('PASS', 'WARN', 'FAIL', 'SKIP')]
    [string]$Status,
    [string]$Area,
    [string]$Message
  )

  $Results.Add([pscustomobject]@{
      Status = $Status
      Area = $Area
      Message = $Message
    })
}

function Get-DocumentPath {
  param([string]$RelativePath)

  return Join-Path $RepoRoot $RelativePath
}

function Test-DocumentExists {
  param([string]$RelativePath)

  return Test-Path -LiteralPath (Get-DocumentPath -RelativePath $RelativePath) -PathType Leaf
}

function Get-SectionLines {
  param(
    [string]$Path,
    [string]$Heading
  )

  $lines = @(Get-Content -LiteralPath $Path)
  $start = -1

  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].Trim() -eq "## $Heading") {
      $start = $i
      break
    }
  }

  if ($start -lt 0) {
    return @()
  }

  $section = New-Object System.Collections.Generic.List[string]
  for ($i = $start + 1; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^##\s+') {
      break
    }
    $section.Add($lines[$i])
  }

  return @($section.ToArray())
}

function Get-CodeBulletsFromSection {
  param(
    [string]$Path,
    [string]$Heading
  )

  $commands = New-Object System.Collections.Generic.List[string]
  foreach ($line in (Get-SectionLines -Path $Path -Heading $Heading)) {
    $trimmed = $line.Trim()
    if ($trimmed -match '^- `(.+?)`$') {
      $commands.Add($Matches[1])
    }
  }

  return @($commands.ToArray())
}

function Get-JsonArrayFromSection {
  param(
    [string]$Path,
    [string]$Heading
  )

  $sectionLines = @(Get-SectionLines -Path $Path -Heading $Heading)
  if ($sectionLines.Count -eq 0) {
    return @()
  }

  $sectionText = [string]::Join("`n", $sectionLines)
  $match = [regex]::Match($sectionText, '```json\s*(?<json>[\s\S]*?)```')
  if (-not $match.Success) {
    return @()
  }

  $rawJson = $match.Groups['json'].Value.Trim()
  if ([string]::IsNullOrWhiteSpace($rawJson)) {
    return @()
  }

  $parsed = $rawJson | ConvertFrom-Json -Depth 20
  if ($null -eq $parsed) {
    return @()
  }

  if ($parsed -is [System.Collections.IEnumerable] -and -not ($parsed -is [string])) {
    return @($parsed)
  }

  return @($parsed)
}

function Get-RepositoryMode {
  param([string]$ProjectProfilePath)

  foreach ($line in (Get-SectionLines -Path $ProjectProfilePath -Heading 'Repository Mode')) {
    if ($line -match '完整模式') {
      return 'full'
    }
    if ($line -match '轻量模式') {
      return 'light'
    }
  }

  if (Test-DocumentExists -RelativePath 'docs/ARCHITECTURE_GUARDRAILS.md') {
    return 'full'
  }

  return 'light'
}

function Invoke-DocumentCommand {
  param(
    [string]$Command,
    [int]$TimeoutSec
  )

  $job = Start-Job -ScriptBlock {
    param($JobCommand, $JobRepoRoot)

    Set-StrictMode -Version Latest
    $ErrorActionPreference = 'Continue'
    Set-Location -LiteralPath $JobRepoRoot

    $rawOutput = Invoke-Expression $JobCommand 2>&1
    $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }

    [pscustomobject]@{
      ExitCode = $exitCode
      Output = @($rawOutput | ForEach-Object { [string]$_ })
    }
  } -ArgumentList $Command, $RepoRoot

  try {
    if (-not (Wait-Job -Job $job -Timeout $TimeoutSec)) {
      Stop-Job -Job $job | Out-Null
      return [pscustomobject]@{
        TimedOut = $true
        ExitCode = $null
        Output = @("Timed out after ${TimeoutSec}s")
      }
    }

    $result = Receive-Job -Job $job
    return [pscustomobject]@{
      TimedOut = $false
      ExitCode = $result.ExitCode
      Output = @($result.Output)
    }
  } finally {
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue | Out-Null
  }
}

function Format-Preview {
  param([string[]]$Lines)

  $previewLines = @($Lines | Select-Object -First 3)
  if ($previewLines.Count -eq 0) {
    return '[no output]'
  }

  return ($previewLines -join ' | ')
}

function Invoke-RgCheck {
  param(
    [string]$Area,
    [string]$Name,
    [string[]]$Paths,
    [string]$Regex
  )

  $rg = Get-Command rg -ErrorAction SilentlyContinue
  if ($null -eq $rg) {
    Add-Result -Status 'WARN' -Area $Area -Message "rg unavailable, skipped $Name"
    return
  }

  $args = @('-n', '--pcre2')
  foreach ($path in @($Paths)) {
    if (-not [string]::IsNullOrWhiteSpace($path)) {
      $args += '--glob'
      $args += $path
    }
  }
  $args += '--'
  $args += $Regex
  $args += '.'

  $rawOutput = & $rg.Source @args 2>&1
  $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
  $outputLines = @($rawOutput | ForEach-Object { [string]$_ })

  if ($exitCode -eq 1) {
    Add-Result -Status 'PASS' -Area $Area -Message "$Name"
    return
  }

  if ($exitCode -eq 0) {
    Add-Result -Status 'FAIL' -Area $Area -Message "$Name matched: $(Format-Preview -Lines $outputLines)"
    return
  }

  Add-Result -Status 'FAIL' -Area $Area -Message "$Name failed to execute rg check: $(Format-Preview -Lines $outputLines)"
}

$projectProfileRelativePath = 'docs/PROJECT_PROFILE.md'
$agentsRelativePath = 'AGENTS.md'
$roadmapRelativePath = 'docs/roadmap.md'
$guardrailsRelativePath = 'docs/ARCHITECTURE_GUARDRAILS.md'

$bootstrapSignals = @(
  (Test-DocumentExists -RelativePath $projectProfileRelativePath),
  (Test-DocumentExists -RelativePath $agentsRelativePath),
  (Test-DocumentExists -RelativePath $roadmapRelativePath),
  (Test-DocumentExists -RelativePath $guardrailsRelativePath)
)

if (-not ($bootstrapSignals -contains $true)) {
  $message = 'Bootstrap docs not found yet; nothing to validate.'
  if ($RequireBootstrap) {
    Add-Result -Status 'FAIL' -Area 'bootstrap' -Message $message
  } else {
    Add-Result -Status 'SKIP' -Area 'bootstrap' -Message $message
  }
} else {
  foreach ($requiredDoc in @($projectProfileRelativePath, $agentsRelativePath, $roadmapRelativePath)) {
    if (Test-DocumentExists -RelativePath $requiredDoc) {
      Add-Result -Status 'PASS' -Area 'required-docs' -Message "$requiredDoc exists"
    } else {
      Add-Result -Status 'FAIL' -Area 'required-docs' -Message "$requiredDoc is missing"
    }
  }

  $projectProfilePath = Get-DocumentPath -RelativePath $projectProfileRelativePath
  $repositoryMode = if (Test-DocumentExists -RelativePath $projectProfileRelativePath) {
    Get-RepositoryMode -ProjectProfilePath $projectProfilePath
  } else {
    'light'
  }

  Add-Result -Status 'PASS' -Area 'repository-mode' -Message "detected $repositoryMode mode"

  if ($repositoryMode -eq 'full') {
    if (Test-DocumentExists -RelativePath $guardrailsRelativePath) {
      Add-Result -Status 'PASS' -Area 'required-docs' -Message "$guardrailsRelativePath exists"
    } else {
      Add-Result -Status 'FAIL' -Area 'required-docs' -Message "$guardrailsRelativePath is missing for full mode"
    }

    $moduleFiles = @(Get-ChildItem -Path $RepoRoot -Recurse -Filter MODULE.md -File -ErrorAction SilentlyContinue)
    if ($moduleFiles.Count -gt 0) {
      Add-Result -Status 'PASS' -Area 'required-docs' -Message "found $($moduleFiles.Count) MODULE.md file(s)"
    } else {
      Add-Result -Status 'FAIL' -Area 'required-docs' -Message 'full mode requires at least one MODULE.md'
    }
  }

  if (-not $SkipCommands -and (Test-DocumentExists -RelativePath $projectProfileRelativePath)) {
    $commands = @(Get-CodeBulletsFromSection -Path $projectProfilePath -Heading 'Verification Commands')
    if ($commands.Count -eq 0) {
      Add-Result -Status 'WARN' -Area 'verification-commands' -Message 'no commands found under ## Verification Commands'
    } else {
      foreach ($command in $commands) {
        $result = Invoke-DocumentCommand -Command $command -TimeoutSec $CommandTimeoutSec
        if ($result.TimedOut) {
          Add-Result -Status 'FAIL' -Area 'verification-commands' -Message "`"$command`" timed out"
        } elseif ($result.ExitCode -eq 0) {
          Add-Result -Status 'PASS' -Area 'verification-commands' -Message $command
        } else {
          Add-Result -Status 'FAIL' -Area 'verification-commands' -Message "`"$command`" failed: $(Format-Preview -Lines $result.Output)"
        }
      }
    }
  } else {
    Add-Result -Status 'SKIP' -Area 'verification-commands' -Message 'command validation skipped'
  }

  if (-not $SkipGuardrails -and (Test-DocumentExists -RelativePath $guardrailsRelativePath)) {
    $guardrailsPath = Get-DocumentPath -RelativePath $guardrailsRelativePath
    $guardrailChecks = @(Get-JsonArrayFromSection -Path $guardrailsPath -Heading 'Forbidden Import Checks')
    if ($guardrailChecks.Count -eq 0) {
      Add-Result -Status 'WARN' -Area 'guardrails' -Message 'no machine-readable checks found under ## Forbidden Import Checks'
    } else {
      foreach ($check in $guardrailChecks) {
        Invoke-RgCheck -Area 'guardrails' -Name ([string]$check.name) -Paths @($check.paths) -Regex ([string]$check.regex)
      }
    }
  } else {
    Add-Result -Status 'SKIP' -Area 'guardrails' -Message 'guardrail validation skipped'
  }

  if (-not $SkipModules) {
    $moduleFiles = @(Get-ChildItem -Path $RepoRoot -Recurse -Filter MODULE.md -File -ErrorAction SilentlyContinue)
    if ($moduleFiles.Count -eq 0) {
      Add-Result -Status 'SKIP' -Area 'module-checks' -Message 'no MODULE.md files found'
    } else {
      foreach ($moduleFile in $moduleFiles) {
        $checks = @(Get-JsonArrayFromSection -Path $moduleFile.FullName -Heading 'Must Not Own Checks')
        if ($checks.Count -eq 0) {
          Add-Result -Status 'WARN' -Area 'module-checks' -Message "$($moduleFile.FullName.Substring($RepoRoot.Length + 1)) has no machine-readable checks"
          continue
        }

        foreach ($check in $checks) {
          $checkName = "$($moduleFile.FullName.Substring($RepoRoot.Length + 1)) :: $([string]$check.name)"
          Invoke-RgCheck -Area 'module-checks' -Name $checkName -Paths @($check.paths) -Regex ([string]$check.regex)
        }
      }
    }
  } else {
    Add-Result -Status 'SKIP' -Area 'module-checks' -Message 'module validation skipped'
  }
}

$statusOrder = @{ FAIL = 0; WARN = 1; PASS = 2; SKIP = 3 }
$sortedResults = @($Results | Sort-Object { $statusOrder[$_.Status] }, Area, Message)

foreach ($result in $sortedResults) {
  Write-Host ("[{0}] {1} - {2}" -f $result.Status, $result.Area, $result.Message)
}

$failCount = @($Results | Where-Object Status -eq 'FAIL').Count
$warnCount = @($Results | Where-Object Status -eq 'WARN').Count
$passCount = @($Results | Where-Object Status -eq 'PASS').Count
$skipCount = @($Results | Where-Object Status -eq 'SKIP').Count

Write-Host ''
Write-Host ("Summary: pass={0} warn={1} fail={2} skip={3}" -f $passCount, $warnCount, $failCount, $skipCount)

if ($failCount -gt 0) {
  exit 1
}

exit 0
