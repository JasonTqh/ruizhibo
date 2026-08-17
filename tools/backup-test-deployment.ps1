[CmdletBinding()]
param(
  [string]$ComposeFile = "deploy/docker-compose.test.yml",
  [string]$EnvFile = "deploy/.env",
  [string]$OutputDirectory = "backups",
  [switch]$SkipUploads,
  [switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot

function Resolve-RepoPath {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [switch]$AllowMissing
  )

  $candidate = if ([System.IO.Path]::IsPathRooted($Path)) {
    $Path
  } else {
    Join-Path $repoRoot $Path
  }

  if ($AllowMissing) {
    return [System.IO.Path]::GetFullPath($candidate)
  }

  return (Resolve-Path -LiteralPath $candidate).Path
}

function Get-FileSha256 {
  param([Parameter(Mandatory = $true)][string]$Path)

  $stream = [System.IO.File]::OpenRead($Path)
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
  } finally {
    $algorithm.Dispose()
    $stream.Dispose()
  }
}

function Get-DotEnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$DefaultValue = ""
  )

  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.*)\s*$") {
      $value = $Matches[1].Trim()
      if (
        $value.Length -ge 2 -and
        (($value.StartsWith('"') -and $value.EndsWith('"')) -or
          ($value.StartsWith("'") -and $value.EndsWith("'")))
      ) {
        return $value.Substring(1, $value.Length - 2)
      }

      return $value
    }
  }

  return $DefaultValue
}

function ConvertTo-NativeArgument {
  param([AllowEmptyString()][string]$Value)

  if ($Value -notmatch '[\s"]') {
    return $Value
  }

  $builder = [System.Text.StringBuilder]::new()
  [void]$builder.Append('"')
  $backslashes = 0

  foreach ($character in $Value.ToCharArray()) {
    if ($character -eq '\') {
      $backslashes += 1
      continue
    }

    if ($character -eq '"') {
      [void]$builder.Append(('\' * (($backslashes * 2) + 1)))
      [void]$builder.Append('"')
      $backslashes = 0
      continue
    }

    if ($backslashes -gt 0) {
      [void]$builder.Append(('\' * $backslashes))
      $backslashes = 0
    }
    [void]$builder.Append($character)
  }

  if ($backslashes -gt 0) {
    [void]$builder.Append(('\' * ($backslashes * 2)))
  }
  [void]$builder.Append('"')
  return $builder.ToString()
}

function Invoke-DockerBinaryCapture {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$OutputPath
  )

  $stderrPath = "$OutputPath.stderr"
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = "docker"
  $startInfo.Arguments = (($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join " ")
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  $output = $null

  try {
    if (-not $process.Start()) {
      throw "Unable to start Docker."
    }

    $stderrTask = $process.StandardError.ReadToEndAsync()
    $output = [System.IO.File]::Create($OutputPath)
    $process.StandardOutput.BaseStream.CopyTo($output)
    $output.Dispose()
    $output = $null
    $process.WaitForExit()
    $stderr = $stderrTask.GetAwaiter().GetResult()

    if ($process.ExitCode -ne 0) {
      if ($stderr) {
        [System.IO.File]::WriteAllText($stderrPath, $stderr, [System.Text.UTF8Encoding]::new($false))
      }
      throw "Docker command failed with exit code $($process.ExitCode): $stderr"
    }
  } finally {
    if ($null -ne $output) {
      $output.Dispose()
    }
    $process.Dispose()
    if (Test-Path -LiteralPath $stderrPath) {
      Remove-Item -LiteralPath $stderrPath -Force
    }
  }
}

function New-ArtifactMetadata {
  param([Parameter(Mandatory = $true)][string]$Path)

  return [ordered]@{
    file = Split-Path -Leaf $Path
    bytes = (Get-Item -LiteralPath $Path).Length
    sha256 = Get-FileSha256 -Path $Path
  }
}

$composePath = Resolve-RepoPath $ComposeFile
$envPath = Resolve-RepoPath $EnvFile
$outputRoot = Resolve-RepoPath $OutputDirectory -AllowMissing

& docker compose --env-file $envPath -f $composePath config --quiet
if ($LASTEXITCODE -ne 0) {
  throw "Docker Compose configuration validation failed."
}

if ($ValidateOnly) {
  Write-Host "Backup configuration validation passed."
  exit 0
}

$runningServices = @(& docker compose --env-file $envPath -f $composePath ps --status running --services)
if ($LASTEXITCODE -ne 0) {
  throw "Unable to read Docker Compose service status."
}
if ($runningServices -notcontains "db") {
  throw "Database service 'db' is not running. Start the deployment before creating a backup."
}

$postgresUser = Get-DotEnvValue -Path $envPath -Name "POSTGRES_USER" -DefaultValue "ruizhibo"
$postgresDatabase = Get-DotEnvValue -Path $envPath -Name "POSTGRES_DB" -DefaultValue "ruizhibo"
$storageDriver = (Get-DotEnvValue -Path $envPath -Name "FILE_STORAGE_DRIVER" -DefaultValue "local").ToLowerInvariant()
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupName = "ruizhibo-$timestamp"
$partialDirectory = Join-Path $outputRoot "$backupName.partial"
$finalDirectory = Join-Path $outputRoot $backupName

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
if ((Test-Path -LiteralPath $partialDirectory) -or (Test-Path -LiteralPath $finalDirectory)) {
  throw "Backup directory already exists: $finalDirectory"
}
New-Item -ItemType Directory -Path $partialDirectory | Out-Null

try {
  $databasePath = Join-Path $partialDirectory "database.dump"
  $databaseArguments = @(
    "compose", "--env-file", $envPath, "-f", $composePath,
    "exec", "-T", "db", "pg_dump",
    "-U", $postgresUser,
    "-d", $postgresDatabase,
    "--format=custom",
    "--no-owner",
    "--no-privileges"
  )
  Invoke-DockerBinaryCapture -Arguments $databaseArguments -OutputPath $databasePath

  $artifacts = [ordered]@{
    database = New-ArtifactMetadata -Path $databasePath
    uploads = $null
  }
  $notes = [System.Collections.Generic.List[string]]::new()

  if ($SkipUploads) {
    $notes.Add("Upload backup was skipped by option.")
  } elseif ($storageDriver -eq "local") {
    $uploadsPath = Join-Path $partialDirectory "uploads.tar.gz"
    $uploadsArguments = @(
      "compose", "--env-file", $envPath, "-f", $composePath,
      "run", "--rm", "--no-deps", "-T", "api",
      "tar", "-C", "/data/uploads", "-czf", "-", "."
    )
    Invoke-DockerBinaryCapture -Arguments $uploadsArguments -OutputPath $uploadsPath
    $artifacts.uploads = New-ArtifactMetadata -Path $uploadsPath
  } else {
    $notes.Add("Storage driver is $storageDriver. Remote objects are not included; use bucket versioning or provider snapshots.")
  }

  $gitRevision = (& git -C $repoRoot rev-parse HEAD 2>$null)
  if ($LASTEXITCODE -ne 0) {
    $gitRevision = $null
  }

  $manifest = [ordered]@{
    schemaVersion = 1
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    gitRevision = $gitRevision
    storageDriver = $storageDriver
    database = [ordered]@{
      name = $postgresDatabase
      user = $postgresUser
    }
    artifacts = $artifacts
    notes = $notes
  }

  $manifestPath = Join-Path $partialDirectory "backup.json"
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
  Move-Item -LiteralPath $partialDirectory -Destination $finalDirectory

  Write-Host "Backup completed: $finalDirectory"
  Write-Host "Database: $($artifacts.database.bytes) bytes"
  if ($null -ne $artifacts.uploads) {
    Write-Host "Uploads: $($artifacts.uploads.bytes) bytes"
  }
} catch {
  if (Test-Path -LiteralPath $partialDirectory) {
    Remove-Item -LiteralPath $partialDirectory -Recurse -Force
  }
  throw
}
