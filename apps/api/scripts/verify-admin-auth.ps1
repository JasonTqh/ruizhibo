param(
  [string]$BaseUrl = $(if ($env:VERIFY_API_BASE_URL) { $env:VERIFY_API_BASE_URL } else { "http://localhost:3000/api" }),
  [string]$Phone = $(if ($env:VERIFY_ADMIN_PHONE) { $env:VERIFY_ADMIN_PHONE } else { "13800000000" }),
  [string]$Password = $env:VERIFY_ADMIN_PASSWORD
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")

if ([string]::IsNullOrWhiteSpace($Password)) {
  throw "Set VERIFY_ADMIN_PASSWORD before running admin authentication verification"
}

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
    [int]$ExpectedStatus = 200
  )

  $headers = @{}
  if ($Token) {
    $headers["Authorization"] = "Bearer $Token"
  }
  $request = @{
    Uri = "$BaseUrl$Path"
    Method = $Method
    Headers = $headers
    UseBasicParsing = $true
    TimeoutSec = 15
  }
  if ($null -ne $Body) {
    $request["ContentType"] = "application/json"
    $request["Body"] = $Body | ConvertTo-Json -Depth 5 -Compress
  }

  try {
    $response = Invoke-WebRequest @request
    $status = [int]$response.StatusCode
    $content = $response.Content
  } catch {
    if (-not $_.Exception.Response) {
      throw
    }
    $status = [int]$_.Exception.Response.StatusCode
    $content = Read-ErrorContent $_
  }

  if ($status -ne $ExpectedStatus) {
    throw "Expected $Method $Path to return $ExpectedStatus, got $status. Body: $content"
  }

  return $(if ($content) { $content | ConvertFrom-Json } else { $null })
}

Write-Host "[admin-auth] Checking invalid password rejection"
$invalid = Invoke-JsonRequest `
  -Method Post `
  -Path "/auth/admin-login" `
  -Body @{ phone = $Phone; password = "$Password-invalid" } `
  -ExpectedStatus 401
if ($invalid.error.code -ne "UNAUTHORIZED") {
  throw "Invalid password returned an unexpected error code"
}

Write-Host "[admin-auth] Checking administrator password login"
$login = Invoke-JsonRequest `
  -Method Post `
  -Path "/auth/admin-login" `
  -Body @{ phone = $Phone; password = $Password } `
  -ExpectedStatus 201
if (-not $login.data.token -or $login.data.user.role -ne "admin") {
  throw "Admin login response is invalid"
}
$token = [string]$login.data.token
$tokenParts = $token.Split(".")
if ($tokenParts.Count -ne 3) {
  throw "Admin login did not return a valid JWT"
}
$payloadPart = $tokenParts[1].Replace("-", "+").Replace("_", "/")
switch ($payloadPart.Length % 4) {
  2 { $payloadPart += "==" }
  3 { $payloadPart += "=" }
}
$payloadJson = [System.Text.Encoding]::UTF8.GetString(
  [Convert]::FromBase64String($payloadPart)
)
$payload = $payloadJson | ConvertFrom-Json
if (([long]$payload.exp - [long]$payload.iat) -ne (8 * 60 * 60)) {
  throw "Admin token lifetime is not 8 hours"
}

Write-Host "[admin-auth] Checking authenticated profile"
$profile = Invoke-JsonRequest -Method Get -Path "/me" -Token $token
if ($profile.data.role -ne "admin" -or $profile.data.phone -ne $Phone) {
  throw "Authenticated profile does not match the admin account"
}

Write-Host "[admin-auth] Checking administrator API access"
$teachers = Invoke-JsonRequest -Method Get -Path "/admin/teachers" -Token $token
if ($null -eq $teachers.data) {
  throw "Admin API response is missing data"
}

Write-Host "[admin-auth] Checking login audit event"
$auditLogs = Invoke-JsonRequest -Method Get -Path "/admin/audit-logs" -Token $token
$loginAudit = @($auditLogs.data) | Where-Object { $_.action -eq "auth.admin.login" } | Select-Object -First 1
if (-not $loginAudit) {
  throw "Admin login audit event was not found"
}

Write-Host "Admin authentication verification passed."
