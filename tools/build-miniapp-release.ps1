[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("parent", "teacher")]
  [string]$App,

  [Parameter(Mandatory = $true)]
  [ValidatePattern("^wx[a-zA-Z0-9]{16}$")]
  [string]$ExpectedAppId,

  [string]$ApiBaseUrl = "https://api.ruizhibo.com/api"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$appDirectory = Join-Path $repoRoot "apps/$App-miniapp"
$projectConfigPath = Join-Path $appDirectory "project.config.json"
$distDirectory = Join-Path $appDirectory "dist"
$packageName = "@ruizhibo/$App-miniapp"

function Assert-ReleaseApiUrl {
  param([string]$Value)

  $uri = $null
  if (-not [Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$uri)) {
    throw "ApiBaseUrl must be an absolute URL"
  }
  $normalizedValue = $Value.TrimEnd("/")
  $expectedApiBaseUrl = "https://$($uri.DnsSafeHost)/api"
  if (
    $uri.Scheme -cne "https" -or
    $normalizedValue -cne $expectedApiBaseUrl -or
    $uri.AbsolutePath.TrimEnd("/") -cne "/api" -or
    $uri.Query -or
    $uri.Fragment -or
    $uri.UserInfo
  ) {
    throw "ApiBaseUrl must be a public HTTPS domain ending in /api, without a port, query, fragment, or credentials"
  }
  $ipAddress = $null
  if (
    [System.Net.IPAddress]::TryParse($uri.DnsSafeHost, [ref]$ipAddress) -or
    $uri.DnsSafeHost -eq "localhost" -or
    $uri.DnsSafeHost.EndsWith(".localhost", [StringComparison]::OrdinalIgnoreCase) -or
    -not $uri.DnsSafeHost.Contains(".") -or
    $uri.DnsSafeHost.EndsWith(".local", [StringComparison]::OrdinalIgnoreCase)
  ) {
    throw "ApiBaseUrl must use a public domain name, not an IP or local hostname"
  }
}

Assert-ReleaseApiUrl -Value $ApiBaseUrl

if (-not (Test-Path -LiteralPath $projectConfigPath -PathType Leaf)) {
  throw "Mini-program project config not found: $projectConfigPath"
}
$projectConfig = Get-Content -LiteralPath $projectConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ([string]$projectConfig.appid -cne $ExpectedAppId) {
  throw "$App mini-program AppID does not match ExpectedAppId"
}
if ($projectConfig.setting.urlCheck -ne $true) {
  throw "$App mini-program must enable setting.urlCheck before a release build"
}

$previousApiBaseUrl = [Environment]::GetEnvironmentVariable("TARO_APP_API_BASE_URL", "Process")
$previousAuthMode = [Environment]::GetEnvironmentVariable("TARO_APP_AUTH_MODE", "Process")
try {
  [Environment]::SetEnvironmentVariable("TARO_APP_API_BASE_URL", $ApiBaseUrl.TrimEnd("/"), "Process")
  [Environment]::SetEnvironmentVariable("TARO_APP_AUTH_MODE", "wechat", "Process")

  Push-Location $repoRoot
  try {
    & pnpm --filter $packageName typecheck
    if ($LASTEXITCODE -ne 0) { throw "$App mini-program typecheck failed" }
    & pnpm --filter $packageName build
    if ($LASTEXITCODE -ne 0) { throw "$App mini-program build failed" }
  } finally {
    Pop-Location
  }
} finally {
  [Environment]::SetEnvironmentVariable("TARO_APP_API_BASE_URL", $previousApiBaseUrl, "Process")
  [Environment]::SetEnvironmentVariable("TARO_APP_AUTH_MODE", $previousAuthMode, "Process")
}

$distProjectConfigPath = Join-Path $distDirectory "project.config.json"
if (-not (Test-Path -LiteralPath $distProjectConfigPath -PathType Leaf)) {
  throw "Release build did not produce project.config.json"
}
$distProjectConfig = Get-Content -LiteralPath $distProjectConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ([string]$distProjectConfig.appid -cne $ExpectedAppId) {
  throw "Release output AppID does not match ExpectedAppId"
}
if ($distProjectConfig.setting.urlCheck -ne $true) {
  throw "Release output has legal-domain validation disabled"
}

$javascriptFiles = @(Get-ChildItem -LiteralPath $distDirectory -Recurse -File -Filter "*.js")
if ($javascriptFiles.Count -eq 0) {
  throw "Release build did not produce JavaScript files"
}
$expectedApiFound = $false
$unsafePattern = 'http://localhost|127\.0\.0\.1|172\.(?:1[6-9]|2[0-9]|3[01])\.|192\.168\.|10\.[0-9]+\.'
foreach ($file in $javascriptFiles) {
  $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
  if ($content.Contains($ApiBaseUrl.TrimEnd("/"))) {
    $expectedApiFound = $true
  }
  if ($content -match $unsafePattern) {
    throw "Release output contains a local or private API address: $($file.FullName)"
  }
}
if (-not $expectedApiFound) {
  throw "Release output does not contain the expected API URL"
}

Write-Host "[$App-miniapp] Release build verified"
Write-Host "[$App-miniapp] AppID: $ExpectedAppId"
Write-Host "[$App-miniapp] API: $($ApiBaseUrl.TrimEnd('/'))"
Write-Host "[$App-miniapp] Output: $distDirectory"
