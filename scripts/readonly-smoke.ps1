[CmdletBinding()]
param(
  [string[]]$Workflow = @('all'),

  [switch]$ListOnly,

  [int]$MaxPreviewLines = 3,

  [int]$MaxWidth = 120,

  [string]$DisableMcpServers,

  [switch]$DisableSerena
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot

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
    [string[]]$Args
  )

  $parts = @($Command)
  foreach ($arg in $Args) {
    if ($arg -match '\s') {
      $parts += '"' + $arg + '"'
    } else {
      $parts += $arg
    }
  }

  return ($parts -join ' ')
}

function Get-SmokeCases {
  param([string]$BunPath)

  return @(
    [pscustomobject]@{
      Name = 'version'
      Workflow = 'cli'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Command = $BunPath
      Args = @('src/entrypoints/cli.tsx', '--version')
      Notes = 'Basic CLI startup banner'
    }
    [pscustomobject]@{
      Name = 'help'
      Workflow = 'cli'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Command = $BunPath
      Args = @('src/entrypoints/cli.tsx', '--help')
      Notes = 'Top-level command tree'
    }
    [pscustomobject]@{
      Name = 'bare-help'
      Workflow = 'cli'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Command = $BunPath
      Args = @('src/entrypoints/cli.tsx', '--bare', '--help')
      Notes = 'Flag parsing without loading the full session stack'
    }
    [pscustomobject]@{
      Name = 'print-help'
      Workflow = 'cli'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Command = $BunPath
      Args = @('src/entrypoints/cli.tsx', '--print', '--help')
      Notes = 'Non-interactive flag parsing only'
    }
    [pscustomobject]@{
      Name = 'doctor-help'
      Workflow = 'cli'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Command = $BunPath
      Args = @('src/entrypoints/cli.tsx', 'doctor', '--help')
      Notes = 'Help-only because doctor itself is interactive'
    }
    [pscustomobject]@{
      Name = 'install-help'
      Workflow = 'cli'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Command = $BunPath
      Args = @('src/entrypoints/cli.tsx', 'install', '--help')
      Notes = 'Help-only for native installer command surface'
    }
    [pscustomobject]@{
      Name = 'update-help'
      Workflow = 'cli'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Command = $BunPath
      Args = @('src/entrypoints/cli.tsx', 'update', '--help')
      Notes = 'Help-only for updater command surface'
    }
    [pscustomobject]@{
      Name = 'resume-help'
      Workflow = 'cli'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Command = $BunPath
      Args = @('src/entrypoints/cli.tsx', 'resume', '--help')
      Notes = 'Session resume help path'
    }
    [pscustomobject]@{
      Name = 'plugin-help'
      Workflow = 'plugin'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Command = $BunPath
      Args = @('src/entrypoints/cli.tsx', 'plugin', '--help')
      Notes = 'Plugin command tree'
    }
    [pscustomobject]@{
      Name = 'plugin-list'
      Workflow = 'plugin'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Command = $BunPath
      Args = @('src/entrypoints/cli.tsx', 'plugin', 'list')
      Notes = 'Installed plugin inventory'
    }
    [pscustomobject]@{
      Name = 'plugin-marketplace-list'
      Workflow = 'plugin'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Command = $BunPath
      Args = @('src/entrypoints/cli.tsx', 'plugin', 'marketplace', 'list')
      Notes = 'Configured marketplace inventory'
    }
    [pscustomobject]@{
      Name = 'plugin-validate-package-json'
      Workflow = 'plugin'
      ReadOnly = $true
      ExpectedExitCodes = @(1)
      Command = $BunPath
      Args = @('src/entrypoints/cli.tsx', 'plugin', 'validate', 'package.json')
      Notes = 'Intentional invalid manifest to exercise validator error output'
    }
    [pscustomobject]@{
      Name = 'mcp-help'
      Workflow = 'mcp'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Command = $BunPath
      Args = @('src/entrypoints/cli.tsx', 'mcp', '--help')
      Notes = 'MCP command tree'
    }
    [pscustomobject]@{
      Name = 'mcp-serve-help'
      Workflow = 'mcp'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Command = $BunPath
      Args = @('src/entrypoints/cli.tsx', 'mcp', 'serve', '--help')
      Notes = 'Help-only for long-running MCP serve path'
    }
    [pscustomobject]@{
      Name = 'mcp-list'
      Workflow = 'mcp'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Command = $BunPath
      Args = @('src/entrypoints/cli.tsx', 'mcp', 'list')
      Notes = 'Configured MCP inventory'
    }
    [pscustomobject]@{
      Name = 'mcp-get-missing'
      Workflow = 'mcp'
      ReadOnly = $true
      ExpectedExitCodes = @(1)
      Command = $BunPath
      Args = @('src/entrypoints/cli.tsx', 'mcp', 'get', 'definitely-missing-server')
      Notes = 'Intentional missing-name error path'
    }
    [pscustomobject]@{
      Name = 'auth-status'
      Workflow = 'cli'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Command = $BunPath
      Args = @('src/entrypoints/cli.tsx', 'auth', 'status')
      Notes = 'Authentication status only; output varies by machine'
    }
    [pscustomobject]@{
      Name = 'agents'
      Workflow = 'cli'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Command = $BunPath
      Args = @('src/entrypoints/cli.tsx', 'agents')
      Notes = 'Configured agent inventory'
    }
    [pscustomobject]@{
      Name = 'routes'
      Workflow = 'routing'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Env = @{}
      ExpectedOutputContains = @()
      Command = $BunPath
      Args = @('run', 'scripts/bun-tools.ts', 'routes')
      Notes = 'Routing debug snapshot for the built-in query sources'
    }
    [pscustomobject]@{
      Name = 'route-compact'
      Workflow = 'routing'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Env = @{}
      ExpectedOutputContains = @()
      Command = $BunPath
      Args = @('run', 'scripts/bun-tools.ts', 'route', 'compact')
      Notes = 'Task route debug snapshot seeded from the compact query source'
    }
    [pscustomobject]@{
      Name = 'route-session-search'
      Workflow = 'routing'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Env = @{}
      ExpectedOutputContains = @(
        '"querySource": "session_search"',
        '"route": "main"'
      )
      Command = $BunPath
      Args = @('run', 'scripts/bun-tools.ts', 'route', 'session_search')
      Notes = 'Helper sideQuery session_search should resolve through the main task route'
    }
    [pscustomobject]@{
      Name = 'route-agent-plan'
      Workflow = 'routing'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Env = @{}
      ExpectedOutputContains = @()
      Command = $BunPath
      Args = @('run', 'scripts/bun-tools.ts', 'route', 'agent:builtin:plan')
      Notes = 'Task route debug snapshot for the builtin plan agent query source'
    }
    [pscustomobject]@{
      Name = 'route-compact-direct-provider'
      Workflow = 'routing'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Env = @{
        NEKO_CODE_OPENAI_COMPATIBLE_API_KEY = 'shared-openai-key'
        ANTHROPIC_BASE_URL = $null
      }
      ExpectedOutputContains = @(
        '"provider": "glm"',
        '"transportMode": "direct-provider"',
        '"baseUrl": null',
        '"apiKey": null'
      )
      Command = $BunPath
      Args = @('run', 'scripts/bun-tools.ts', 'route', 'compact')
      Notes = 'Global compatible apiKey alone must not pin the main route away from direct-provider mode'
    }
    [pscustomobject]@{
      Name = 'route-compact-gateway'
      Workflow = 'routing'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Env = @{
        ANTHROPIC_BASE_URL = 'https://gateway.example.com/v1/messages'
        NEKO_CODE_OPENAI_COMPATIBLE_API_KEY = $null
      }
      ExpectedOutputContains = @(
        '"provider": "anthropic"',
        '"apiStyle": "anthropic"',
        '"transportMode": "single-upstream"',
        '"baseUrl": "https://gateway.example.com/v1/messages"'
      )
      Command = $BunPath
      Args = @('run', 'scripts/bun-tools.ts', 'route', 'compact')
      Notes = 'Global Anthropic gateway should pin the default main route to a single-upstream transport'
    }
    [pscustomobject]@{
      Name = 'route-permission-explainer-gateway'
      Workflow = 'routing'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Env = @{
        ANTHROPIC_BASE_URL = 'https://gateway.example.com/v1/messages'
        NEKO_CODE_OPENAI_COMPATIBLE_API_KEY = $null
      }
      ExpectedOutputContains = @(
        '"querySource": "permission_explainer"',
        '"provider": "anthropic"',
        '"transportMode": "single-upstream"',
        '"baseUrl": "https://gateway.example.com/v1/messages"'
      )
      Command = $BunPath
      Args = @('run', 'scripts/bun-tools.ts', 'route', 'permission_explainer')
      Notes = 'Helper sideQuery permission_explainer should inherit the main-route gateway transport'
    }
    [pscustomobject]@{
      Name = 'route-mcp-datetime-parse-gateway'
      Workflow = 'routing'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Env = @{
        ANTHROPIC_BASE_URL = 'https://gateway.example.com/v1/messages'
        NEKO_CODE_OPENAI_COMPATIBLE_API_KEY = $null
      }
      ExpectedOutputContains = @(
        '"querySource": "mcp_datetime_parse"',
        '"provider": "anthropic"',
        '"transportMode": "single-upstream"',
        '"baseUrl": "https://gateway.example.com/v1/messages"'
      )
      Command = $BunPath
      Args = @('run', 'scripts/bun-tools.ts', 'route', 'mcp_datetime_parse')
      Notes = 'queryHaiku helper mcp_datetime_parse should inherit the main-route gateway transport'
    }
    [pscustomobject]@{
      Name = 'providers'
      Workflow = 'diagnostics'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Env = @{}
      ExpectedOutputContains = @()
      Command = $BunPath
      Args = @('run', 'scripts/bun-tools.ts', 'providers')
      Notes = 'Provider metadata and weight configuration inventory'
    }
    [pscustomobject]@{
      Name = 'provider-health'
      Workflow = 'diagnostics'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Env = @{}
      ExpectedOutputContains = @()
      Command = $BunPath
      Args = @('run', 'scripts/bun-tools.ts', 'health')
      Notes = 'Provider endpoint health summary for every configured provider'
    }
    [pscustomobject]@{
      Name = 'provider-health-glm'
      Workflow = 'diagnostics'
      ReadOnly = $true
      ExpectedExitCodes = @(0)
      Env = @{}
      ExpectedOutputContains = @()
      Command = $BunPath
      Args = @('run', 'scripts/bun-tools.ts', 'health', 'glm')
      Notes = 'Provider endpoint health summary scoped to glm'
    }
  )
}

function Select-SmokeCases {
  param(
    [object[]]$Cases,
    [string[]]$WorkflowFilter
  )

  if ($WorkflowFilter -contains 'all') {
    return $Cases
  }

  $allowed = @{}
  foreach ($item in $WorkflowFilter) {
    $allowed[$item] = $true
  }

  return @($Cases | Where-Object { $allowed.ContainsKey($_.Workflow) })
}

function Normalize-WorkflowFilter {
  param([string[]]$WorkflowInput)

  $validValues = @('all', 'cli', 'plugin', 'mcp', 'routing', 'diagnostics')
  $normalized = New-Object System.Collections.Generic.List[string]

  foreach ($value in $WorkflowInput) {
    foreach ($piece in ($value -split ',')) {
      $trimmed = $piece.Trim().ToLowerInvariant()
      if ([string]::IsNullOrWhiteSpace($trimmed)) {
        continue
      }
      if ($validValues -notcontains $trimmed) {
        throw "Unsupported workflow '$trimmed'. Valid values: $($validValues -join ', ')"
      }
      $normalized.Add($trimmed)
    }
  }

  if ($normalized.Count -eq 0) {
    $normalized.Add('all')
  }

  return @($normalized)
}

function Invoke-SmokeCase {
  param(
    [pscustomobject]$Case,
    [string]$WorkingDirectory,
    [int]$PreviewLineLimit,
    [int]$PreviewWidth,
    [string]$DisabledMcpServers
  )

  $previousLocation = Get-Location
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    Set-Location -LiteralPath $WorkingDirectory
    $script:ErrorActionPreference = 'Continue'

    $caseEnv = if ($Case.PSObject.Properties['Env']) { $Case.Env } else { @{} }
    $expectedOutputContains = if ($Case.PSObject.Properties['ExpectedOutputContains']) { $Case.ExpectedOutputContains } else { @() }

    if (-not ($caseEnv -is [hashtable])) {
      $normalizedCaseEnv = @{}
      foreach ($entry in $caseEnv.GetEnumerator()) {
        $normalizedCaseEnv[$entry.Key] = $entry.Value
      }
      $caseEnv = $normalizedCaseEnv
    }

    $envBackup = @{}
    if (-not [string]::IsNullOrWhiteSpace($DisabledMcpServers) -and -not $caseEnv.ContainsKey('NEKO_CODE_DISABLED_MCP_SERVERS')) {
      $caseEnv['NEKO_CODE_DISABLED_MCP_SERVERS'] = $DisabledMcpServers
    }
    foreach ($envEntry in $caseEnv.GetEnumerator()) {
      $envBackup[$envEntry.Key] = [Environment]::GetEnvironmentVariable($envEntry.Key)
      [Environment]::SetEnvironmentVariable($envEntry.Key, $envEntry.Value)
    }

    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $commandArgs = @($Case.Args)
    $rawOutput = & $Case.Command @commandArgs 2>&1
    $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
    $stopwatch.Stop()

    $outputLines = New-Object System.Collections.Generic.List[string]
    foreach ($line in @($rawOutput)) {
      $outputLines.Add([string]$line)
    }
    $fullOutput = ($outputLines -join "`n")

    $passed = $Case.ExpectedExitCodes -contains $exitCode
    $failureReason = $null
    if ($passed -and @($expectedOutputContains).Count -gt 0) {
      foreach ($expectedSnippet in @($expectedOutputContains)) {
        if (-not $fullOutput.Contains($expectedSnippet)) {
          $passed = $false
          $failureReason = "missing output snippet: $expectedSnippet"
          break
        }
      }
    }

    $preview = @()
    foreach ($line in ($outputLines | Select-Object -First $PreviewLineLimit)) {
      $preview += (Format-PreviewText -Text $line -Width $PreviewWidth)
    }
    if (@($preview).Count -eq 0) {
      $preview = @('[no output]')
    }

    return [pscustomobject]@{
      Name = $Case.Name
      Workflow = $Case.Workflow
      Passed = $passed
      TimedOut = $false
      ExitCode = $exitCode
      ExpectedExitCodes = $Case.ExpectedExitCodes
      ReadOnly = $Case.ReadOnly
      Notes = $Case.Notes
      FailureReason = $failureReason
      DurationMs = [int]$stopwatch.ElapsedMilliseconds
      CommandPreview = Join-CommandPreview -Command $Case.Command -Args $Case.Args
      Preview = $preview
    }
  } finally {
    foreach ($envKey in $caseEnv.Keys) {
      [Environment]::SetEnvironmentVariable($envKey, $envBackup[$envKey])
    }
    Set-Location -LiteralPath $previousLocation
    $script:ErrorActionPreference = $previousErrorActionPreference
  }
}

function Write-CaseSummary {
  param([pscustomobject]$Result)

  $status = if ($Result.Passed) { 'PASS' } elseif ($Result.TimedOut) { 'TIMEOUT' } else { 'FAIL' }
  Write-Output ('[{0}] {1}/{2} exit={3} expected={4} readonly={5} durationMs={6}' -f `
      $status, `
      $Result.Workflow, `
      $Result.Name, `
      $Result.ExitCode, `
      ($Result.ExpectedExitCodes -join ','), `
      $Result.ReadOnly.ToString().ToLowerInvariant(), `
      $Result.DurationMs)
  Write-Output ('  notes: {0}' -f $Result.Notes)
  if (-not $Result.Passed -and $Result.FailureReason) {
    Write-Output ('  failure: {0}' -f $Result.FailureReason)
  }
  foreach ($line in $Result.Preview) {
    Write-Output ('  preview: {0}' -f $line)
  }
  Write-Output ''
}

$bunCommand = Get-Command bun.cmd -ErrorAction SilentlyContinue
if ($null -eq $bunCommand) {
  $bunCommand = Get-Command bun -ErrorAction Stop
}
$cases = Get-SmokeCases -BunPath $bunCommand.Source
$workflowFilter = Normalize-WorkflowFilter -WorkflowInput $Workflow
$selectedCases = Select-SmokeCases -Cases $cases -WorkflowFilter $workflowFilter
$disabledMcpServersValue = if ($DisableSerena) { 'serena' } else { $DisableMcpServers }

if (@($selectedCases).Count -eq 0) {
  throw 'No smoke cases matched the requested workflow filter.'
}

if ($ListOnly) {
  foreach ($case in $selectedCases) {
    Write-Output ('{0}/{1} expected={2} readonly={3}' -f `
        $case.Workflow, `
        $case.Name, `
        ($case.ExpectedExitCodes -join ','), `
        $case.ReadOnly.ToString().ToLowerInvariant())
    Write-Output ('  command: {0}' -f (Join-CommandPreview -Command $case.Command -Args $case.Args))
    Write-Output ('  notes: {0}' -f $case.Notes)
    Write-Output ''
  }
  return
}

$results = @()
foreach ($case in $selectedCases) {
  $result = Invoke-SmokeCase `
    -Case $case `
    -WorkingDirectory $RepoRoot `
    -PreviewLineLimit $MaxPreviewLines `
    -PreviewWidth $MaxWidth `
    -DisabledMcpServers $disabledMcpServersValue
  $results += $result
  Write-CaseSummary -Result $result
}

$passCount = @($results | Where-Object { $_.Passed }).Count
$failCount = @($results | Where-Object { -not $_.Passed }).Count

Write-Output ('Summary: {0} passed, {1} failed, total {2}' -f $passCount, $failCount, $results.Count)

if ($failCount -gt 0) {
  exit 1
}
