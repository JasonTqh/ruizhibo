param(
  [string]$BaseUrl = $(if ($env:VERIFY_API_BASE_URL) { $env:VERIFY_API_BASE_URL } else { "http://localhost:3000/api" })
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Get-RequestIdHeader {
  param($Response)

  $requestId = [string]$Response.Headers["X-Request-Id"]
  Assert-True (-not [string]::IsNullOrWhiteSpace($requestId)) "Response is missing X-Request-Id"
  return $requestId
}

Write-Host "[observability] Checking trusted request ID propagation"
$trustedRequestId = "cp29-$([guid]::NewGuid().ToString('N'))"
$healthResponse = Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "$BaseUrl/health" `
  -Headers @{ "X-Request-Id" = $trustedRequestId } `
  -TimeoutSec 15
Assert-True ($healthResponse.StatusCode -eq 200) "Health endpoint did not return 200"
Assert-True ((Get-RequestIdHeader $healthResponse) -eq $trustedRequestId) "Safe request ID was not propagated"

Write-Host "[observability] Checking unsafe request ID replacement"
$unsafeRequestId = "x" * 200
$replacementResponse = Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "$BaseUrl/health" `
  -Headers @{ "X-Request-Id" = $unsafeRequestId } `
  -TimeoutSec 15
$replacementRequestId = Get-RequestIdHeader $replacementResponse
Assert-True ($replacementRequestId -ne $unsafeRequestId) "Unsafe request ID was accepted"
Assert-True ($replacementRequestId -match '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$') "Generated request ID has an invalid format"

Write-Host "[observability] Checking error response correlation"
$errorResponse = $null
$errorContent = ""
try {
  Invoke-WebRequest `
    -UseBasicParsing `
    -Uri "$BaseUrl/cp29-not-found" `
    -Headers @{ "X-Request-Id" = $trustedRequestId } `
    -TimeoutSec 15 | Out-Null
  throw "Expected the missing endpoint to return 404"
} catch {
  if (-not $_.Exception.Response) {
    throw
  }

  $errorResponse = $_.Exception.Response
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
    $errorContent = $_.ErrorDetails.Message
  } else {
    $stream = $errorResponse.GetResponseStream()
    $reader = [System.IO.StreamReader]::new($stream)
    try {
      $errorContent = $reader.ReadToEnd()
    } finally {
      $reader.Dispose()
      $stream.Dispose()
    }
  }
}

Assert-True ([int]$errorResponse.StatusCode -eq 404) "Missing endpoint did not return 404"
$errorRequestId = Get-RequestIdHeader $errorResponse
$errorBody = $errorContent | ConvertFrom-Json
Assert-True ($errorBody.error.code -eq "NOT_FOUND") "Unexpected error code"
Assert-True ($errorBody.error.requestId -eq $errorRequestId) "Error body request ID does not match response header"
Assert-True ($errorRequestId -eq $trustedRequestId) "Error response did not preserve the trusted request ID"

Write-Host "[observability] Checking body parser error correlation"
$parserRequestId = "cp29-parser-$([guid]::NewGuid().ToString('N'))"
$parserResponse = $null
$parserContent = ""
try {
  Invoke-WebRequest `
    -UseBasicParsing `
    -Method Post `
    -Uri "$BaseUrl/auth/dev-login" `
    -Headers @{ "X-Request-Id" = $parserRequestId } `
    -ContentType "application/json" `
    -Body "{" `
    -TimeoutSec 15 | Out-Null
  throw "Expected malformed JSON to return 400"
} catch {
  if (-not $_.Exception.Response) {
    throw
  }

  $parserResponse = $_.Exception.Response
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
    $parserContent = $_.ErrorDetails.Message
  } else {
    $stream = $parserResponse.GetResponseStream()
    $reader = [System.IO.StreamReader]::new($stream)
    try {
      $parserContent = $reader.ReadToEnd()
    } finally {
      $reader.Dispose()
      $stream.Dispose()
    }
  }
}

Assert-True ([int]$parserResponse.StatusCode -eq 400) "Malformed JSON did not return 400"
$parserHeaderRequestId = Get-RequestIdHeader $parserResponse
$parserBody = $parserContent | ConvertFrom-Json
Assert-True ($parserBody.error.requestId -eq $parserHeaderRequestId) "Parser error body request ID does not match response header"
Assert-True ($parserHeaderRequestId -eq $parserRequestId) "Parser error did not preserve the trusted request ID"

Write-Host "Observability verification passed."
