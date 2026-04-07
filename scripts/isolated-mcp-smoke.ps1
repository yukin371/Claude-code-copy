[CmdletBinding()]
param(
  [switch]$ListOnly,

  [switch]$KeepTemp,

  [int]$MaxPreviewLines = 4,

  [int]$MaxWidth = 120
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$CliEntrypoint = Join-Path $RepoRoot 'src/entrypoints/cli.tsx'

function Format-PreviewText {
  param(
    [AllowNull()]
    [string]$Text,
    [int]$Width
  )

  if ($null -eq $Text) {
    return ''
  }

  $normalized = $Text.TrimEnd("`r", "`n").Replace("`r", '').Replace("`n", '\n')
  $safeWidth = [Math]::Max($Width, 40)
  if ($normalized.Length -le $safeWidth) {
    return $normalized
  }

  $headLength = [Math]::Max($safeWidth - 24, 16)
  $remaining = $normalized.Length - $headLength
  return '{0} ... [{1} more chars]' -f $normalized.Substring(0, $headLength), $remaining
}

function Join-CommandPreview {
  param(
    [string]$Command,
    [string[]]$CommandArgs
  )

  $parts = @($Command)
  foreach ($arg in $CommandArgs) {
    if ($arg -match '\s') {
      $parts += '"' + $arg + '"'
    } else {
      $parts += $arg
    }
  }

  return ($parts -join ' ')
}

function New-IsolatedEnvironment {
  $tempRoot = Join-Path $env:TEMP ("neko-isolated-mcp-smoke-" + [guid]::NewGuid().ToString('N'))
  $workspaceDir = Join-Path $tempRoot 'workspace'
  $configDir = Join-Path $tempRoot 'config'
  $pluginCacheDir = Join-Path $tempRoot 'plugin-cache'

  foreach ($dir in @($tempRoot, $workspaceDir, $configDir, $pluginCacheDir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }

  return [pscustomobject]@{
    TempRoot = $tempRoot
    WorkspaceDir = $workspaceDir
    ConfigDir = $configDir
    PluginCacheDir = $pluginCacheDir
  }
}

function Get-IsolatedGlobalConfigFiles {
  param([string]$ConfigDir)

  return @(Get-ChildItem -LiteralPath $ConfigDir -Force -File -Filter '*.json' -ErrorAction SilentlyContinue)
}

function Get-IsolatedGlobalConfigText {
  param([string]$ConfigDir)

  $files = @(Get-IsolatedGlobalConfigFiles -ConfigDir $ConfigDir)
  if ($files.Count -eq 0) {
    return $null
  }

  return [string](Get-Content -LiteralPath $files[0].FullName -Raw)
}

function Invoke-IsolatedCli {
  param(
    [string]$BunPath,
    [pscustomobject]$Environment,
    [string[]]$CommandArgs,
    [int]$PreviewLineLimit,
    [int]$PreviewWidth
  )

  $previousLocation = Get-Location
  $previousErrorActionPreference = $ErrorActionPreference
  $trackedEnvVars = @(
    'NEKO_CODE_CONFIG_DIR',
    'CLAUDE_CODE_PLUGIN_CACHE_DIR',
    'CLAUDE_CODE_SIMPLE'
  )
  $oldEnv = @{}

  try {
    foreach ($name in $trackedEnvVars) {
      $oldEnv[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    }

    [Environment]::SetEnvironmentVariable('NEKO_CODE_CONFIG_DIR', $Environment.ConfigDir, 'Process')
    [Environment]::SetEnvironmentVariable('CLAUDE_CODE_PLUGIN_CACHE_DIR', $Environment.PluginCacheDir, 'Process')
    [Environment]::SetEnvironmentVariable('CLAUDE_CODE_SIMPLE', '1', 'Process')

    Set-Location -LiteralPath $Environment.WorkspaceDir
    $script:ErrorActionPreference = 'Continue'

    $invocationArgs = @($CliEntrypoint) + $CommandArgs
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $rawOutput = & $BunPath @invocationArgs 2>&1
    $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
    $stopwatch.Stop()

    $outputLines = New-Object System.Collections.Generic.List[string]
    foreach ($line in @($rawOutput)) {
      $outputLines.Add([string]$line)
    }

    $preview = @()
    foreach ($line in ($outputLines | Select-Object -First $PreviewLineLimit)) {
      $preview += (Format-PreviewText -Text $line -Width $PreviewWidth)
    }
    if ($preview.Count -eq 0) {
      $preview = @('[no output]')
    }

    return [pscustomobject]@{
      ExitCode = $exitCode
      DurationMs = [int]$stopwatch.ElapsedMilliseconds
      Preview = $preview
      OutputLines = @($outputLines)
      CommandPreview = Join-CommandPreview -Command $BunPath -CommandArgs $invocationArgs
    }
  } finally {
    Set-Location -LiteralPath $previousLocation
    $script:ErrorActionPreference = $previousErrorActionPreference

    foreach ($name in $trackedEnvVars) {
      [Environment]::SetEnvironmentVariable($name, $oldEnv[$name], 'Process')
    }
  }
}

function Get-IsolatedCases {
  return @(
    [pscustomobject]@{
      Name = 'local-add'
      ExpectedExit = 0
      Args = @('mcp', 'add', '-s', 'local', 'isolated-local', 'cmd', '/c', 'exit', '0')
      Notes = 'Write a local-scope MCP server into the isolated config dir'
      Validate = {
        param($environment)

        $globalText = Get-IsolatedGlobalConfigText -ConfigDir $environment.ConfigDir
        if ($null -eq $globalText) {
          throw 'Expected a global config file in the isolated config dir after local add.'
        }
        if ($globalText -notmatch 'isolated-local') {
          throw 'isolated-local was not found in the isolated global config file after local add.'
        }
        $projectFile = Join-Path $environment.WorkspaceDir '.mcp.json'
        if (Test-Path -LiteralPath $projectFile) {
          throw 'local add should not create .mcp.json in the isolated workspace.'
        }
      }
    }
    [pscustomobject]@{
      Name = 'local-remove'
      ExpectedExit = 0
      Args = @('mcp', 'remove', 'isolated-local', '-s', 'local')
      Notes = 'Remove the isolated local-scope MCP server from the config dir'
      Validate = {
        param($environment)

        $globalText = Get-IsolatedGlobalConfigText -ConfigDir $environment.ConfigDir
        if ($null -eq $globalText) {
          throw 'Expected the isolated global config file to remain after local remove.'
        }
        if ($globalText -match 'isolated-local') {
          throw 'isolated-local still appears in the isolated global config after local remove.'
        }
      }
    }
    [pscustomobject]@{
      Name = 'project-add'
      ExpectedExit = 0
      Args = @('mcp', 'add', '-s', 'project', 'isolated-project', 'cmd', '/c', 'exit', '0')
      Notes = 'Write a project-scope MCP server into isolated .mcp.json'
      Validate = {
        param($environment)

        $projectFile = Join-Path $environment.WorkspaceDir '.mcp.json'
        if (-not (Test-Path -LiteralPath $projectFile)) {
          throw 'Expected .mcp.json to exist in the isolated workspace after project add.'
        }
        $projectText = [string](Get-Content -LiteralPath $projectFile -Raw)
        if ($projectText -notmatch 'isolated-project') {
          throw 'isolated-project was not found in .mcp.json after project add.'
        }
      }
    }
    [pscustomobject]@{
      Name = 'project-remove'
      ExpectedExit = 0
      Args = @('mcp', 'remove', 'isolated-project', '-s', 'project')
      Notes = 'Remove the isolated project-scope MCP server from .mcp.json'
      Validate = {
        param($environment)

        $projectFile = Join-Path $environment.WorkspaceDir '.mcp.json'
        if (-not (Test-Path -LiteralPath $projectFile)) {
          throw 'Expected .mcp.json to remain present after project remove.'
        }
        $projectText = [string](Get-Content -LiteralPath $projectFile -Raw)
        if ($projectText -match 'isolated-project') {
          throw 'isolated-project still appears in .mcp.json after project remove.'
        }
      }
    }
  )
}

function Write-CaseSummary {
  param(
    [string]$Status,
    [pscustomobject]$Case,
    [pscustomobject]$Result
  )

  Write-Output ('[{0}] {1} exit={2} expected={3} durationMs={4}' -f `
      $Status, `
      $Case.Name, `
      $Result.ExitCode, `
      $Case.ExpectedExit, `
      $Result.DurationMs)
  Write-Output ('  notes: {0}' -f $Case.Notes)
  foreach ($line in $Result.Preview) {
    Write-Output ('  preview: {0}' -f $line)
  }
  Write-Output ''
}

$bunCommand = Get-Command bun.cmd -ErrorAction SilentlyContinue
if ($null -eq $bunCommand) {
  $bunCommand = Get-Command bun -ErrorAction Stop
}

$cases = Get-IsolatedCases

if ($ListOnly) {
  foreach ($case in $cases) {
    Write-Output ('{0} expected={1}' -f $case.Name, $case.ExpectedExit)
    Write-Output ('  notes: {0}' -f $case.Notes)
    Write-Output ('  command: {0}' -f (Join-CommandPreview -Command $bunCommand.Source -CommandArgs (@($CliEntrypoint) + $case.Args)))
    Write-Output ''
  }
  return
}

$environment = New-IsolatedEnvironment
Write-Output ('Temp root: {0}' -f $environment.TempRoot)
Write-Output ('Workspace: {0}' -f $environment.WorkspaceDir)
Write-Output ('Config dir: {0}' -f $environment.ConfigDir)
Write-Output ('Plugin cache dir: {0}' -f $environment.PluginCacheDir)
Write-Output ''

$results = @()
$failureCount = 0

try {
  foreach ($case in $cases) {
      $result = Invoke-IsolatedCli `
        -BunPath $bunCommand.Source `
        -Environment $environment `
        -CommandArgs $case.Args `
        -PreviewLineLimit $MaxPreviewLines `
        -PreviewWidth $MaxWidth

    $status = 'PASS'
    try {
      if ($result.ExitCode -ne $case.ExpectedExit) {
        throw "Unexpected exit code $($result.ExitCode)."
      }
      & $case.Validate $environment
    } catch {
      $status = 'FAIL'
      $failureCount++
      $result.Preview += ('validation: ' + (Format-PreviewText -Text $_.Exception.Message -Width $MaxWidth))
    }

    $results += [pscustomobject]@{
      Name = $case.Name
      Status = $status
      ExitCode = $result.ExitCode
    }
    Write-CaseSummary -Status $status -Case $case -Result $result
  }

  $passCount = @($results | Where-Object { $_.Status -eq 'PASS' }).Count
  Write-Output ('Summary: {0} passed, {1} failed, total {2}' -f $passCount, $failureCount, $results.Count)

  if ($failureCount -gt 0) {
    exit 1
  }
} finally {
  if (-not $KeepTemp -and (Test-Path -LiteralPath $environment.TempRoot)) {
    Remove-Item -LiteralPath $environment.TempRoot -Force -Recurse
  }
}
