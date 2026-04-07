[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('read', 'search', 'files', 'typecheck', 'typecheck-filter')]
  [string]$Command,

  [string]$Path = '.',
  [string]$Pattern,
  [int]$Start = 1,
  [int]$End = 40,
  [int]$MaxWidth = 120,
  [int]$MaxMatches = 20,
  [int]$TopFiles = 10,
  [string]$OutFile = '.tmp-typecheck.txt'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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

function Invoke-SafeRead {
  param(
    [string]$LiteralPath,
    [int]$LineStart,
    [int]$LineEnd,
    [int]$Width
  )

  if (-not (Test-Path -LiteralPath $LiteralPath)) {
    throw "Path not found: $LiteralPath"
  }

  $lines = Get-Content -LiteralPath $LiteralPath
  if ($lines.Count -eq 0) {
    Write-Output '[empty file]'
    return
  }

  $startLine = [Math]::Max($LineStart, 1)
  $endLine = [Math]::Min($LineEnd, $lines.Count)
  if ($startLine -gt $endLine) {
    Write-Output "[no lines in requested range: $startLine-$endLine]"
    return
  }

  for ($lineNumber = $startLine; $lineNumber -le $endLine; $lineNumber++) {
    $line = $lines[$lineNumber - 1]
    Write-Output ('{0,5}: {1}' -f $lineNumber, (Format-PreviewText -Text $line -Width $Width))
  }
}

function Invoke-SafeSearch {
  param(
    [string]$SearchRoot,
    [string]$SearchPattern,
    [int]$Width,
    [int]$Limit
  )

  if ([string]::IsNullOrWhiteSpace($SearchPattern)) {
    throw 'Pattern is required for the search command.'
  }

  $rg = Get-Command rg -ErrorAction SilentlyContinue
  if ($null -eq $rg) {
    throw 'rg was not found in PATH.'
  }

  $matchCount = 0
  $jsonLines = & $rg.Source --json --color never -- $SearchPattern $SearchRoot
  foreach ($jsonLine in $jsonLines) {
    if ([string]::IsNullOrWhiteSpace($jsonLine)) {
      continue
    }

    $event = $jsonLine | ConvertFrom-Json
    if ($event.type -ne 'match') {
      continue
    }

    $matchCount++
    $file = $event.data.path.text
    $lineNumber = [int]$event.data.line_number
    $text = [string]$event.data.lines.text
    Write-Output ('{0}:{1}: {2}' -f $file, $lineNumber, (Format-PreviewText -Text $text -Width $Width))

    if ($matchCount -ge $Limit) {
      break
    }
  }

  if ($matchCount -eq 0) {
    Write-Output '[no matches]'
  }
}

function Invoke-SafeFiles {
  param(
    [string]$SearchRoot,
    [string]$FilterPattern,
    [int]$Limit,
    [int]$Width
  )

  $rg = Get-Command rg -ErrorAction SilentlyContinue
  if ($null -eq $rg) {
    throw 'rg was not found in PATH.'
  }

  $fileArgs = @('--files', $SearchRoot)
  if (-not [string]::IsNullOrWhiteSpace($FilterPattern)) {
    $fileArgs += @('-g', $FilterPattern)
  }

  $count = 0
  foreach ($file in (& $rg.Source @fileArgs)) {
    if ([string]::IsNullOrWhiteSpace($file)) {
      continue
    }

    $count++
    Write-Output (Format-PreviewText -Text $file -Width $Width)
    if ($count -ge $Limit) {
      break
    }
  }

  if ($count -eq 0) {
    Write-Output '[no files]'
  }
}

function Invoke-SafeTypecheck {
  param(
    [string]$OutputFile,
    [int]$Limit,
    [int]$TopFileCount
  )

  if (Test-Path -LiteralPath $OutputFile) {
    Remove-Item -LiteralPath $OutputFile -Force
  }

  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $script:ErrorActionPreference = 'Continue'
    & bun run typecheck *> $OutputFile
    $exitCode = $LASTEXITCODE
  } finally {
    $script:ErrorActionPreference = $previousErrorActionPreference
  }

  $labels = New-Object System.Collections.Generic.List[string]
  $fileCounts = @{}

  foreach ($line in (Get-Content -LiteralPath $OutputFile)) {
    if ($line -match '^(.*?\.(?:ts|tsx))\((\d+),(\d+)\): error (TS\d+):') {
      $fileName = Split-Path $matches[1] -Leaf
      $label = '{0}:{1}:{2}' -f $fileName, $matches[2], $matches[4]

      if ($labels.Count -lt $Limit) {
        $labels.Add($label)
      }

      if ($fileCounts.ContainsKey($fileName)) {
        $fileCounts[$fileName]++
      } else {
        $fileCounts[$fileName] = 1
      }
    }
  }

  if ($exitCode -eq 0) {
    Write-Output 'typecheck: clean'
    return
  }

  if ($labels.Count -eq 0) {
    Write-Output "typecheck: failed (exit $exitCode), but no TypeScript error labels were parsed"
    return
  }

  Write-Output 'typecheck: first errors'
  foreach ($label in $labels) {
    Write-Output $label
  }

  Write-Output ''
  Write-Output 'typecheck: top files'
  foreach ($entry in ($fileCounts.GetEnumerator() | Sort-Object -Property @(
        @{ Expression = 'Value'; Descending = $true },
        @{ Expression = 'Name'; Descending = $false }
      ) | Select-Object -First $TopFileCount)) {
    Write-Output ('{0} x{1}' -f $entry.Key, $entry.Value)
  }
}

function Invoke-SafeTypecheckFilter {
  param(
    [string]$OutputFile,
    [string]$FilterPattern,
    [int]$Limit,
    [int]$Width
  )

  if ([string]::IsNullOrWhiteSpace($FilterPattern)) {
    throw 'Pattern is required for the typecheck-filter command.'
  }

  if (Test-Path -LiteralPath $OutputFile) {
    Remove-Item -LiteralPath $OutputFile -Force
  }

  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $script:ErrorActionPreference = 'Continue'
    & bun run typecheck *> $OutputFile
    $exitCode = $LASTEXITCODE
  } finally {
    $script:ErrorActionPreference = $previousErrorActionPreference
  }

  $regex = [regex]::new($FilterPattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $matchesFound = 0

  foreach ($line in (Get-Content -LiteralPath $OutputFile)) {
    if (
      $line -match '^(.*?\.(?:ts|tsx))\((\d+),(\d+)\): error (TS\d+): (.*)$' -and
      $regex.IsMatch($matches[1])
    ) {
      $matchesFound++
      $fileName = Split-Path $matches[1] -Leaf
      $message = Format-PreviewText -Text $matches[5] -Width $Width
      Write-Output ('{0}:{1}:{2}: {3}' -f $fileName, $matches[2], $matches[4], $message)

      if ($matchesFound -ge $Limit) {
        break
      }
    }
  }

  if ($matchesFound -eq 0) {
    if ($exitCode -eq 0) {
      Write-Output 'typecheck-filter: clean'
      return
    }

    Write-Output 'typecheck-filter: no matching errors'
  }
}

switch ($Command) {
  'read' {
    Invoke-SafeRead -LiteralPath $Path -LineStart $Start -LineEnd $End -Width $MaxWidth
  }
  'search' {
    Invoke-SafeSearch -SearchRoot $Path -SearchPattern $Pattern -Width $MaxWidth -Limit $MaxMatches
  }
  'typecheck' {
    Invoke-SafeTypecheck -OutputFile $OutFile -Limit $MaxMatches -TopFileCount $TopFiles
  }
  'typecheck-filter' {
    Invoke-SafeTypecheckFilter -OutputFile $OutFile -FilterPattern $Pattern -Limit $MaxMatches -Width $MaxWidth
  }
  'files' {
    Invoke-SafeFiles -SearchRoot $Path -FilterPattern $Pattern -Limit $MaxMatches -Width $MaxWidth
  }
  default {
    throw "Unsupported command: $Command"
  }
}
