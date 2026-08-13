param(
  [string]$BaseUrl = "http://localhost:8080/api",
  [string]$AdminUrl = "http://localhost:8080",
  [switch]$RequireHttps,
  [switch]$RunApiSuite,
  [string]$ExpectedStorageDriver = "",
  [string]$AdminPhone = "13800000000",
  [string]$TeacherPhone = "13800000001",
  [string]$ParentPhone = "13800000002"
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")
$AdminUrl = $AdminUrl.TrimEnd("/")

function Assert-Https {
  param([string]$Url, [string]$Label)

  if ($RequireHttps -and -not $Url.StartsWith("https://")) {
    throw "$Label must use HTTPS: $Url"
  }
}

Assert-Https -Url $BaseUrl -Label "BaseUrl"
Assert-Https -Url $AdminUrl -Label "AdminUrl"

Write-Host "[deploy-verify] Checking API and database health"
$healthResponse = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/health" -TimeoutSec 15
$health = $healthResponse.Content | ConvertFrom-Json
if ($healthResponse.StatusCode -ne 200 -or $health.data.status -ne "ok") {
  throw "API health check failed"
}
if ($health.data.database -ne "ok") {
  throw "Database health check failed"
}
if ($ExpectedStorageDriver -and $health.data.fileStorage -ne $ExpectedStorageDriver) {
  throw "Expected file storage driver $ExpectedStorageDriver, got $($health.data.fileStorage)"
}

Write-Host "[deploy-verify] Checking admin web entry"
$adminResponse = Invoke-WebRequest -UseBasicParsing -Uri $AdminUrl -TimeoutSec 15
if ($adminResponse.StatusCode -ne 200 -or $adminResponse.Content -notmatch '<div id="root"') {
  throw "Admin web entry check failed"
}

if ($RunApiSuite) {
  Write-Host "[deploy-verify] Running admin, teacher and parent API verification"
  $env:VERIFY_API_BASE_URL = $BaseUrl
  $env:VERIFY_ADMIN_PHONE = $AdminPhone
  $env:VERIFY_TEACHER_PHONE = $TeacherPhone
  $env:VERIFY_PARENT_PHONE = $ParentPhone

  $repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
  Push-Location $repoRoot
  try {
    & pnpm --filter @ruizhibo/api verify:all
    if ($LASTEXITCODE -ne 0) {
      throw "API verification suite failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

Write-Host "Test deployment verification passed."
