[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$BackupDirectory,
  [string]$ComposeFile = "deploy/docker-compose.test.yml",
  [string]$EnvFile = "deploy/.env",
  [string]$SafetyBackupDirectory = "backups/pre-restore",
  [switch]$ConfirmRestore,
  [switch]$SkipUploads,
  [switch]$SkipSafetyBackup,
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

function Invoke-DockerWithInputFile {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$InputPath
  )

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = "docker"
  $startInfo.Arguments = (($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join " ")
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  $input = $null

  try {
    if (-not $process.Start()) {
      throw "Unable to start Docker."
    }

    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $input = [System.IO.File]::OpenRead($InputPath)
    $input.CopyTo($process.StandardInput.BaseStream)
    $process.StandardInput.Close()
    $input.Dispose()
    $input = $null
    $process.WaitForExit()
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()

    if ($process.ExitCode -ne 0) {
      throw "Docker command failed with exit code $($process.ExitCode): $stderr"
    }

    return $stdout
  } finally {
    if ($null -ne $input) {
      $input.Dispose()
    }
    $process.Dispose()
  }
}

function Assert-Artifact {
  param(
    [Parameter(Mandatory = $true)][string]$Directory,
    [Parameter(Mandatory = $true)]$Metadata,
    [Parameter(Mandatory = $true)][string]$Label
  )

  $path = Join-Path $Directory ([string]$Metadata.file)
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "$Label file does not exist: $path"
  }

  $actualBytes = (Get-Item -LiteralPath $path).Length
  if ($actualBytes -ne [long]$Metadata.bytes) {
    throw "$Label file size does not match: $path"
  }

  $actualHash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne ([string]$Metadata.sha256).ToLowerInvariant()) {
    throw "$Label SHA-256 validation failed: $path"
  }

  return $path
}

$composePath = Resolve-RepoPath $ComposeFile
$envPath = Resolve-RepoPath $EnvFile
$backupPath = Resolve-RepoPath $BackupDirectory
$manifestPath = Join-Path $backupPath "backup.json"

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "Backup manifest does not exist: $manifestPath"
}

& docker compose --env-file $envPath -f $composePath config --quiet
if ($LASTEXITCODE -ne 0) {
  throw "Docker Compose configuration validation failed."
}

$manifest = Get-Content -LiteralPath $manifestPath -Encoding UTF8 -Raw | ConvertFrom-Json
if ([int]$manifest.schemaVersion -ne 1) {
  throw "Unsupported backup manifest version: $($manifest.schemaVersion)"
}

$databasePath = Assert-Artifact -Directory $backupPath -Metadata $manifest.artifacts.database -Label "Database backup"
$uploadsPath = $null
if ($null -ne $manifest.artifacts.uploads) {
  $uploadsPath = Assert-Artifact -Directory $backupPath -Metadata $manifest.artifacts.uploads -Label "Uploads backup"
}

Write-Host "Backup validation passed: $backupPath"
Write-Host "Created at: $($manifest.createdAt)"
Write-Host "Storage driver: $($manifest.storageDriver)"

if ($ValidateOnly) {
  exit 0
}

if (-not $ConfirmRestore) {
  throw "Restore overwrites the current database. Add -ConfirmRestore after checking the target."
}

$runningServices = @(& docker compose --env-file $envPath -f $composePath ps --status running --services)
if ($LASTEXITCODE -ne 0) {
  throw "Unable to read Docker Compose service status."
}
if ($runningServices -notcontains "db") {
  throw "Database service 'db' is not running. Start the deployment before restoring."
}

if (-not $SkipSafetyBackup) {
  $safetyPath = Resolve-RepoPath $SafetyBackupDirectory -AllowMissing
  Write-Host "Creating a safety backup before restore..."
  & (Join-Path $PSScriptRoot "backup-test-deployment.ps1") `
    -ComposeFile $composePath `
    -EnvFile $envPath `
    -OutputDirectory $safetyPath
}

$postgresUser = Get-DotEnvValue -Path $envPath -Name "POSTGRES_USER" -DefaultValue "ruizhibo"
$postgresDatabase = Get-DotEnvValue -Path $envPath -Name "POSTGRES_DB" -DefaultValue "ruizhibo"
$composePrefix = @("compose", "--env-file", $envPath, "-f", $composePath)

$databaseValidationArguments = $composePrefix + @(
  "exec", "-T", "db", "pg_restore", "--list"
)
[void](Invoke-DockerWithInputFile -Arguments $databaseValidationArguments -InputPath $databasePath)

if (($null -ne $uploadsPath) -and (-not $SkipUploads)) {
  $uploadsValidationArguments = $composePrefix + @(
    "run", "--rm", "--no-deps", "-T", "api", "tar", "-tzf", "-"
  )
  [void](Invoke-DockerWithInputFile -Arguments $uploadsValidationArguments -InputPath $uploadsPath)
}

$apiWasRunning = $runningServices -contains "api"
try {
  if ($apiWasRunning) {
    & docker compose --env-file $envPath -f $composePath stop api
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to stop the API service. Restore cancelled."
    }
  }

  $restoreArguments = $composePrefix + @(
    "exec", "-T", "db", "pg_restore",
    "-U", $postgresUser,
    "-d", $postgresDatabase,
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--exit-on-error"
  )
  [void](Invoke-DockerWithInputFile -Arguments $restoreArguments -InputPath $databasePath)

  if (($null -ne $uploadsPath) -and (-not $SkipUploads)) {
    & docker compose --env-file $envPath -f $composePath run --rm --no-deps -T api `
      sh -c 'find /data/uploads -mindepth 1 -maxdepth 1 -exec rm -rf -- "{}" +'
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to clear the existing uploads directory."
    }

    $uploadsRestoreArguments = $composePrefix + @(
      "run", "--rm", "--no-deps", "-T", "api", "tar", "-C", "/data/uploads", "-xzf", "-"
    )
    [void](Invoke-DockerWithInputFile -Arguments $uploadsRestoreArguments -InputPath $uploadsPath)
  }

  Write-Host "Restore completed: $backupPath"
} finally {
  if ($apiWasRunning) {
    & docker compose --env-file $envPath -f $composePath start api
  }
}
