[CmdletBinding()]
param(
  [string]$EnvPath = "deploy/.env",
  [switch]$RequireHttps
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$resolvedEnvPath = if ([System.IO.Path]::IsPathRooted($EnvPath)) {
  $EnvPath
} else {
  Join-Path $repoRoot $EnvPath
}

if (-not (Test-Path -LiteralPath $resolvedEnvPath -PathType Leaf)) {
  throw "Production configuration file not found: $resolvedEnvPath"
}

function Read-DotEnv {
  param([string]$Path)

  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $separator = $trimmed.IndexOf("=")
    if ($separator -lt 1) { continue }
    $name = $trimmed.Substring(0, $separator).Trim()
    $value = $trimmed.Substring($separator + 1).Trim()
    if (
      $value.Length -ge 2 -and
      (($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'")))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$name] = $value
  }
  return $values
}

function Get-ConfigValue {
  param(
    [hashtable]$Values,
    [string]$Name
  )

  if (-not $Values.ContainsKey($Name)) { return "" }
  return [string]$Values[$Name]
}

function Assert-Configured {
  param(
    [hashtable]$Values,
    [string]$Name
  )

  $value = (Get-ConfigValue -Values $Values -Name $Name).Trim()
  if (-not $value) {
    throw "$Name must be configured for production"
  }
  return $value
}

function Assert-StrongSecret {
  param(
    [string]$Name,
    [string]$Value,
    [int]$MinimumLength
  )

  if ($Value.Length -lt $MinimumLength) {
    throw "$Name must contain at least $MinimumLength characters"
  }
  if ($Value -match "(?i)(replace[-_ ]?with|change[-_ ]?me|example|your[-_ ]|placeholder)") {
    throw "$Name still contains a placeholder value"
  }
}

function Assert-AbsoluteHttpUrl {
  param(
    [string]$Name,
    [string]$Value,
    [bool]$HttpsRequired
  )

  $uri = $null
  if (-not [Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$uri)) {
    throw "$Name must be an absolute URL"
  }
  if ($uri.Scheme -notin @("http", "https")) {
    throw "$Name must use HTTP or HTTPS"
  }
  if ($HttpsRequired -and $uri.Scheme -ne "https") {
    throw "$Name must use HTTPS for the production acceptance gate"
  }
}

function Get-NormalizedOrigin {
  param([string]$Value)

  $uri = [Uri]$Value
  return $uri.GetLeftPart([UriPartial]::Authority).TrimEnd("/").ToLowerInvariant()
}

$config = Read-DotEnv -Path $resolvedEnvPath

$devLogin = Assert-Configured -Values $config -Name "ENABLE_DEV_LOGIN"
if ($devLogin -ne "false") {
  throw "ENABLE_DEV_LOGIN must be exactly false for production"
}
Write-Host "[production-config] Development login: disabled"

$jwtSecret = Assert-Configured -Values $config -Name "JWT_SECRET"
Assert-StrongSecret -Name "JWT_SECRET" -Value $jwtSecret -MinimumLength 32
Write-Host "[production-config] JWT secret: configured and non-placeholder"

$trainingMediaSecret = Assert-Configured -Values $config -Name "TRAINING_MEDIA_SIGNING_SECRET"
Assert-StrongSecret -Name "TRAINING_MEDIA_SIGNING_SECRET" -Value $trainingMediaSecret -MinimumLength 32
if ($trainingMediaSecret -eq $jwtSecret) {
  throw "TRAINING_MEDIA_SIGNING_SECRET must be independent from JWT_SECRET"
}
$trainingMediaUrlSeconds = [int](Assert-Configured -Values $config -Name "TRAINING_MEDIA_URL_SECONDS")
if ($trainingMediaUrlSeconds -lt 60 -or $trainingMediaUrlSeconds -gt 1800) {
  throw "TRAINING_MEDIA_URL_SECONDS must be between 60 and 1800"
}
$backupRetentionDays = [int](Assert-Configured -Values $config -Name "BACKUP_RETENTION_DAYS")
if ($backupRetentionDays -lt 30) {
  throw "BACKUP_RETENTION_DAYS must be at least 30"
}
Write-Host "[production-config] Training media signing and 30-day backup retention: configured"

$postgresPassword = Assert-Configured -Values $config -Name "POSTGRES_PASSWORD"
Assert-StrongSecret -Name "POSTGRES_PASSWORD" -Value $postgresPassword -MinimumLength 12
$databaseUrl = Assert-Configured -Values $config -Name "DATABASE_URL"
if ($databaseUrl -notmatch "^postgres(ql)?://" -or $databaseUrl -match "(?i)replace[-_ ]?with") {
  throw "DATABASE_URL must point to PostgreSQL and must not contain placeholders"
}
Write-Host "[production-config] PostgreSQL: configured"

$corsOrigins = Assert-Configured -Values $config -Name "CORS_ORIGINS"
if ($corsOrigins -match "(^|,)\s*\*\s*(,|$)") {
  throw "CORS_ORIGINS must not contain a wildcard"
}
foreach ($origin in $corsOrigins.Split(",")) {
  Assert-AbsoluteHttpUrl -Name "CORS_ORIGINS entry" -Value $origin.Trim() -HttpsRequired ([bool]$RequireHttps)
}
Write-Host "[production-config] CORS origins: explicit"

$siteAddress = Assert-Configured -Values $config -Name "DEPLOY_SITE_ADDRESS"
Assert-AbsoluteHttpUrl -Name "DEPLOY_SITE_ADDRESS" -Value $siteAddress -HttpsRequired ([bool]$RequireHttps)
$teacherWebSiteAddress = Assert-Configured -Values $config -Name "TEACHER_WEB_SITE_ADDRESS"
Assert-AbsoluteHttpUrl -Name "TEACHER_WEB_SITE_ADDRESS" -Value $teacherWebSiteAddress -HttpsRequired ([bool]$RequireHttps)
if ((Get-NormalizedOrigin -Value $siteAddress) -eq (Get-NormalizedOrigin -Value $teacherWebSiteAddress)) {
  throw "DEPLOY_SITE_ADDRESS and TEACHER_WEB_SITE_ADDRESS must use different origins"
}
$configuredCorsOrigins = @(
  $corsOrigins.Split(",") |
    ForEach-Object { Get-NormalizedOrigin -Value $_.Trim() }
)
foreach ($requiredOrigin in @($siteAddress, $teacherWebSiteAddress)) {
  $normalizedOrigin = Get-NormalizedOrigin -Value $requiredOrigin
  if ($normalizedOrigin -notin $configuredCorsOrigins) {
    throw "CORS_ORIGINS must include $normalizedOrigin"
  }
}
$appVersion = Assert-Configured -Values $config -Name "APP_VERSION"
if ($appVersion -match "^(?i:local|unknown|development)$") {
  throw "APP_VERSION must be the deployed Git revision"
}
Write-Host "[production-config] Admin/API and teacher web site addresses: distinct and allowed by CORS"
Write-Host "[production-config] Application version: configured"

$wechatAppIds = @{}
$wechatAppSecrets = @{}
foreach ($role in @("TEACHER", "PARENT")) {
  $appIdName = "WECHAT_$($role)_APP_ID"
  $appSecretName = "WECHAT_$($role)_APP_SECRET"
  $appId = Assert-Configured -Values $config -Name $appIdName
  $appSecret = Assert-Configured -Values $config -Name $appSecretName
  if ($appId -notmatch "^wx[a-zA-Z0-9]{16}$") {
    throw "$appIdName must be a valid mini-program AppID"
  }
  Assert-StrongSecret -Name $appSecretName -Value $appSecret -MinimumLength 16
  $wechatAppIds[$role] = $appId
  $wechatAppSecrets[$role] = $appSecret
}
if ($wechatAppIds["TEACHER"] -ceq $wechatAppIds["PARENT"]) {
  throw "WECHAT_TEACHER_APP_ID and WECHAT_PARENT_APP_ID must be different mini-program AppIDs"
}
if ($wechatAppSecrets["TEACHER"] -ceq $wechatAppSecrets["PARENT"]) {
  throw "WECHAT_TEACHER_APP_SECRET and WECHAT_PARENT_APP_SECRET must be different"
}
foreach ($role in @("TEACHER", "PARENT")) {
  $projectConfigPath = Join-Path $repoRoot "apps/$($role.ToLowerInvariant())-miniapp/project.config.json"
  if (-not (Test-Path -LiteralPath $projectConfigPath -PathType Leaf)) {
    throw "$role mini-program project config is missing"
  }
  $projectConfig = Get-Content -LiteralPath $projectConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ([string]$projectConfig.appid -cne $wechatAppIds[$role]) {
    throw "WECHAT_$($role)_APP_ID must match $projectConfigPath"
  }
  if ($projectConfig.setting.urlCheck -ne $true) {
    throw "$role mini-program must enable setting.urlCheck for production"
  }
}
Write-Host "[production-config] WeChat teacher and parent credentials: configured and distinct"

$storageDriver = (Assert-Configured -Values $config -Name "FILE_STORAGE_DRIVER").ToLowerInvariant()
if ($storageDriver -notin @("local", "s3")) {
  throw "FILE_STORAGE_DRIVER must be local or s3"
}
if ($storageDriver -eq "s3") {
  foreach ($name in @(
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_PUBLIC_BASE_URL"
  )) {
    $value = Assert-Configured -Values $config -Name $name
    if ($name -eq "S3_SECRET_ACCESS_KEY") {
      Assert-StrongSecret -Name $name -Value $value -MinimumLength 16
    }
  }
  Assert-AbsoluteHttpUrl `
    -Name "S3_PUBLIC_BASE_URL" `
    -Value (Get-ConfigValue -Values $config -Name "S3_PUBLIC_BASE_URL") `
    -HttpsRequired ([bool]$RequireHttps)
  $trainingBucket = Assert-Configured -Values $config -Name "S3_TRAINING_PRIVATE_BUCKET"
  if ($trainingBucket -eq (Get-ConfigValue -Values $config -Name "S3_BUCKET")) {
    throw "S3_TRAINING_PRIVATE_BUCKET must be a separate non-public bucket"
  }
}
Write-Host "[production-config] File storage: configured ($storageDriver)"

$requiredFiles = @(
  "deploy/docker-compose.test.yml",
  "deploy/Caddyfile",
  "deploy/Dockerfile.teacher-web",
  "deploy/Caddyfile.teacher-web",
  "tools/backup-test-deployment.ps1",
  "tools/restore-test-deployment.ps1"
)
foreach ($path in $requiredFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $repoRoot $path) -PathType Leaf)) {
    throw "Required production asset is missing: $path"
  }
}

$compose = Get-Content -LiteralPath (Join-Path $repoRoot "deploy/docker-compose.test.yml") -Raw -Encoding UTF8
if (
  $compose -notmatch "postgres_data:/var/lib/postgresql/data" -or
  $compose -notmatch "uploads_data:/data/uploads" -or
  $compose -notmatch 'ENABLE_DEV_LOGIN:\s*\$\{ENABLE_DEV_LOGIN:-false\}' -or
  $compose -notmatch '(?m)^  teacher-web:\s*$' -or
  $compose -notmatch 'dockerfile:\s*deploy/Dockerfile\.teacher-web' -or
  $compose -notmatch 'TEACHER_WEB_SITE_ADDRESS:'
) {
  throw "Docker Compose persistence, safety defaults, or teacher web service are incomplete"
}
$teacherService = [regex]::Match(
  $compose,
  '(?ms)^  teacher-web:\r?\n(?<body>.*?)(?=^  [a-zA-Z0-9_-]+:\r?\n|^volumes:)'
)
if (-not $teacherService.Success) {
  throw "Docker Compose teacher-web service could not be inspected"
}
if ($teacherService.Groups["body"].Value -match '(?m)^    ports:\s*$') {
  throw "teacher-web must not publish a host port; Caddy is the only public entry"
}

$caddy = Get-Content -LiteralPath (Join-Path $repoRoot "deploy/Caddyfile") -Raw -Encoding UTF8
foreach ($pattern in @(
  "reverse_proxy api:3000",
  'TEACHER_WEB_SITE_ADDRESS:http://teacher.localhost',
  "reverse_proxy teacher-web:80",
  "X-Content-Type-Options nosniff",
  "Strict-Transport-Security"
)) {
  if ($caddy -notmatch [regex]::Escape($pattern)) {
    throw "Caddy production safety configuration is incomplete: $pattern"
  }
}
$teacherCaddy = Get-Content -LiteralPath (Join-Path $repoRoot "deploy/Caddyfile.teacher-web") -Raw -Encoding UTF8
if (
  $teacherCaddy -notmatch [regex]::Escape("try_files {path} /index.html") -or
  $teacherCaddy -notmatch [regex]::Escape("file_server")
) {
  throw "Teacher web static server must provide SPA fallback and static files"
}
Write-Host "[production-config] Caddy, persistence, backup and restore assets: present"
Write-Host "Production configuration verification passed."
