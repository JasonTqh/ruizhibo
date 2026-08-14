[CmdletBinding()]
param(
  [string]$BaseUrl = "http://localhost:8080/api",
  [string]$AdminUrl = "http://localhost:8080",
  [switch]$RequireHttps,
  [switch]$ProductionGate,
  [switch]$RunApiSuite,
  [switch]$SkipStorageUpload,
  [string]$ExpectedStorageDriver = "",
  [string]$ExpectedCorsOrigin = "",
  [string]$ExpectedVersion = $(if ($env:VERIFY_APP_VERSION) { $env:VERIFY_APP_VERSION } else { "" }),
  [string]$AdminPhone = "13800000000",
  [string]$AdminPassword = $env:VERIFY_ADMIN_PASSWORD,
  [string]$TeacherPhone = "13800000001",
  [string]$ParentPhone = "13800000002"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$BaseUrl = $BaseUrl.TrimEnd("/")
$AdminUrl = $AdminUrl.TrimEnd("/")

function Read-ErrorContent {
  param($ErrorRecord)

  if ($ErrorRecord.ErrorDetails -and $ErrorRecord.ErrorDetails.Message) {
    return $ErrorRecord.ErrorDetails.Message
  }
  $response = $ErrorRecord.Exception.Response
  if ($response -and $response.GetResponseStream) {
    $stream = $response.GetResponseStream()
    if ($stream) {
      $reader = [System.IO.StreamReader]::new($stream)
      try {
        return $reader.ReadToEnd()
      } finally {
        $reader.Dispose()
        $stream.Dispose()
      }
    }
  }
  return ""
}

function Invoke-JsonRequest {
  param(
    [string]$Method,
    [string]$Path,
    [object]$Body = $null,
    [string]$Token = "",
    [int]$ExpectedStatus = 200,
    [hashtable]$Headers = @{}
  )

  $requestHeaders = @{}
  foreach ($entry in $Headers.GetEnumerator()) {
    $requestHeaders[$entry.Key] = $entry.Value
  }
  if ($Token) {
    $requestHeaders["Authorization"] = "Bearer $Token"
  }

  $request = @{
    Uri = "$BaseUrl$Path"
    Method = $Method
    Headers = $requestHeaders
    UseBasicParsing = $true
    TimeoutSec = 15
  }
  if ($null -ne $Body) {
    $request["ContentType"] = "application/json"
    $request["Body"] = $Body | ConvertTo-Json -Depth 10 -Compress
  }

  try {
    $response = Invoke-WebRequest @request
    $status = [int]$response.StatusCode
    $content = $response.Content
  } catch {
    if (-not $_.Exception.Response) {
      throw "Cannot reach $($request.Uri): $($_.Exception.Message)"
    }
    $response = $_.Exception.Response
    $status = [int]$response.StatusCode
    $content = Read-ErrorContent $_
  }

  if ($status -ne $ExpectedStatus) {
    throw "Expected $Method $Path to return $ExpectedStatus, got $status. Body: $content"
  }

  return @{
    Body = $(if ($content) { $content | ConvertFrom-Json } else { $null })
    Content = $content
    Headers = $response.Headers
    Status = $status
  }
}

function Assert-Https {
  param([string]$Url, [string]$Label)

  if ($RequireHttps -and -not $Url.StartsWith("https://")) {
    throw "$Label must use HTTPS: $Url"
  }
}

function Assert-Header {
  param(
    $Response,
    [string]$Name,
    [string]$Pattern
  )

  $value = [string]$Response.Headers[$Name]
  if (-not $value -or $value -notmatch $Pattern) {
    throw "Expected $Name header to match '$Pattern', got '$value'"
  }
}

function Resolve-PublicUrl {
  param([string]$Value)

  if ($Value -match "^https?://") {
    return $Value
  }
  $apiUri = [Uri]$BaseUrl
  return "$($apiUri.GetLeftPart([System.UriPartial]::Authority))$Value"
}

Assert-Https -Url $BaseUrl -Label "BaseUrl"
Assert-Https -Url $AdminUrl -Label "AdminUrl"

if ($ProductionGate) {
  if ($RunApiSuite) {
    throw "RunApiSuite depends on development login and cannot run with ProductionGate"
  }
  if ([string]::IsNullOrWhiteSpace($AdminPassword)) {
    throw "Set VERIFY_ADMIN_PASSWORD before running the production release gate"
  }
  if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
    throw "Set VERIFY_APP_VERSION to the deployed Git revision before running the production release gate"
  }
}

Write-Host "[deploy-verify] Checking API, database and storage health"
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
if ($ExpectedVersion -and $health.data.version -ne $ExpectedVersion) {
  throw "Expected deployed version $ExpectedVersion, got $($health.data.version)"
}

Write-Host "[deploy-verify] Checking admin web entry"
$adminResponse = Invoke-WebRequest -UseBasicParsing -Uri $AdminUrl -TimeoutSec 15
if ($adminResponse.StatusCode -ne 200 -or $adminResponse.Content -notmatch '<div id="root"') {
  throw "Admin web entry check failed"
}

if ($ProductionGate) {
  Write-Host "[deploy-verify] Checking reverse proxy security headers"
  foreach ($response in @($healthResponse, $adminResponse)) {
    Assert-Header -Response $response -Name "X-Content-Type-Options" -Pattern "^nosniff$"
    Assert-Header -Response $response -Name "X-Frame-Options" -Pattern "^SAMEORIGIN$"
    Assert-Header -Response $response -Name "Referrer-Policy" -Pattern "^strict-origin-when-cross-origin$"
    Assert-Header -Response $response -Name "Permissions-Policy" -Pattern "camera=\(\)"
  }
  if ($RequireHttps) {
    Assert-Header -Response $adminResponse -Name "Strict-Transport-Security" -Pattern "max-age=[1-9][0-9]+"
  }
  Assert-Header -Response $healthResponse -Name "X-Request-Id" -Pattern ".+"

  if ([string]::IsNullOrWhiteSpace($ExpectedCorsOrigin)) {
    $ExpectedCorsOrigin = ([Uri]$AdminUrl).GetLeftPart([System.UriPartial]::Authority)
  }
  Write-Host "[deploy-verify] Checking allowed and denied CORS origins"
  $allowedCors = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/health" -Headers @{
    Origin = $ExpectedCorsOrigin
  } -TimeoutSec 15
  Assert-Header -Response $allowedCors -Name "Access-Control-Allow-Origin" -Pattern "^$([regex]::Escape($ExpectedCorsOrigin))$"
  Assert-Header -Response $allowedCors -Name "Access-Control-Allow-Credentials" -Pattern "^true$"

  $deniedCors = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/health" -Headers @{
    Origin = "https://cors-denied.invalid"
  } -TimeoutSec 15
  if ($deniedCors.Headers["Access-Control-Allow-Origin"]) {
    throw "Unexpected CORS access for denied origin"
  }

  Write-Host "[deploy-verify] Checking development login is disabled"
  $devLogin = Invoke-JsonRequest -Method "POST" -Path "/auth/dev-login" -Body @{
    role = "admin"
    phone = $AdminPhone
  } -ExpectedStatus 403
  if ($devLogin.Body.error.code -ne "FORBIDDEN") {
    throw "Development login returned an unexpected error"
  }

  Write-Host "[deploy-verify] Checking formal administrator login"
  $adminLogin = Invoke-JsonRequest -Method "POST" -Path "/auth/admin-login" -Body @{
    phone = $AdminPhone
    password = $AdminPassword
  } -ExpectedStatus 201
  $adminToken = [string]$adminLogin.Body.data.token
  if (-not $adminToken -or $adminLogin.Body.data.user.role -ne "admin") {
    throw "Formal administrator login failed"
  }
  $profile = Invoke-JsonRequest -Method "GET" -Path "/me" -Token $adminToken
  if ($profile.Body.data.role -ne "admin" -or $profile.Body.data.phone -ne $AdminPhone) {
    throw "Administrator profile does not match the release account"
  }
  $teachers = Invoke-JsonRequest -Method "GET" -Path "/admin/teachers" -Token $adminToken
  if ($null -eq $teachers.Body.data) {
    throw "Administrator API access failed"
  }

  Write-Host "[deploy-verify] Checking production admin bundle"
  $scriptMatches = [regex]::Matches($adminResponse.Content, '<script[^>]+src="([^"]+[.]js)"')
  if ($scriptMatches.Count -lt 1) {
    throw "Admin web JavaScript bundle was not found"
  }
  $bundleContent = ""
  $adminBaseUri = [Uri]("$AdminUrl/")
  foreach ($match in $scriptMatches) {
    $assetUri = [Uri]::new($adminBaseUri, $match.Groups[1].Value)
    $bundleContent += (Invoke-WebRequest -UseBasicParsing -Uri $assetUri -TimeoutSec 30).Content
  }
  if ($bundleContent -notmatch "/auth/admin-login") {
    throw "Production admin bundle does not contain formal administrator login"
  }
  if ($bundleContent -match "/auth/dev-login") {
    throw "Production admin bundle still contains the development login endpoint"
  }

  if (-not $SkipStorageUpload) {
    Write-Host "[deploy-verify] Checking authenticated upload and public file access"
    $pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    $assetResponse = Invoke-JsonRequest -Method "POST" -Path "/files" -Token $adminToken -Body @{
      fileName = "release-gate.png"
      mimeType = "image/png"
      base64 = $pngBase64
      size = 68
      scene = "release-gate"
    } -ExpectedStatus 201
    $asset = $assetResponse.Body.data
    $expectedDriver = $(if ($ExpectedStorageDriver) { $ExpectedStorageDriver } else { $health.data.fileStorage })
    if ($asset.storageDriver -ne $expectedDriver) {
      throw "Expected uploaded asset driver $expectedDriver, got $($asset.storageDriver)"
    }
    $fileResponse = Invoke-WebRequest -UseBasicParsing -Uri (Resolve-PublicUrl $asset.url) -TimeoutSec 15
    if ($fileResponse.StatusCode -ne 200 -or $fileResponse.Headers["Content-Type"] -notmatch "image/png") {
      throw "Uploaded release-gate file is not publicly readable"
    }
  }
}

if ($RunApiSuite) {
  Write-Host "[deploy-verify] Running development admin, teacher and parent API verification"
  $previousApiBaseUrl = $env:VERIFY_API_BASE_URL
  $previousAdminPhone = $env:VERIFY_ADMIN_PHONE
  $previousTeacherPhone = $env:VERIFY_TEACHER_PHONE
  $previousParentPhone = $env:VERIFY_PARENT_PHONE
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
    $env:VERIFY_API_BASE_URL = $previousApiBaseUrl
    $env:VERIFY_ADMIN_PHONE = $previousAdminPhone
    $env:VERIFY_TEACHER_PHONE = $previousTeacherPhone
    $env:VERIFY_PARENT_PHONE = $previousParentPhone
    Pop-Location
  }
}

Write-Host $(if ($ProductionGate) { "Production release gate passed." } else { "Test deployment verification passed." })
