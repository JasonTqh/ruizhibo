param(
  [string]$BaseUrl = "http://localhost:3000/api",
  [string]$AdminPhone = "13800000000",
  [ValidateSet("local", "s3")]
  [string]$ExpectedDriver = "local"
)

$ErrorActionPreference = "Stop"

if (-not $PSBoundParameters.ContainsKey("BaseUrl") -and $env:VERIFY_API_BASE_URL) {
  $BaseUrl = $env:VERIFY_API_BASE_URL
}
if (-not $PSBoundParameters.ContainsKey("AdminPhone") -and $env:VERIFY_ADMIN_PHONE) {
  $AdminPhone = $env:VERIFY_ADMIN_PHONE
}

. "$PSScriptRoot/verify-api-common.ps1"

Write-Step "Logging in for file storage verification"
$login = Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
  role = "admin"
  phone = $AdminPhone
} -ExpectedStatus 201
$token = $login.Body.data.token

Write-Step "Uploading a valid PNG file"
$pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
$assetResponse = Invoke-Api -Method "POST" -Path "/files" -Token $token -Body @{
  fileName = "verify-storage.png"
  mimeType = "image/png"
  base64 = $pngBase64
  size = 68
  scene = "verify-storage"
} -ExpectedStatus 201
$asset = $assetResponse.Body.data
Assert-True ($asset.storageDriver -eq $ExpectedDriver) "Expected storage driver $ExpectedDriver"
Assert-True ($asset.storageKey -match "^verify-storage/.+[.]png$") "Storage key is missing or invalid"
Assert-True ([bool]$asset.url) "Uploaded asset did not return a URL"

Write-Step "Checking the uploaded file is publicly readable"
if ($asset.url -match "^https?://") {
  $assetUrl = $asset.url
} else {
  $apiUri = [Uri]$BaseUrl
  $assetUrl = "$($apiUri.GetLeftPart([System.UriPartial]::Authority))$($asset.url)"
}
$fileResponse = Invoke-WebRequest -UseBasicParsing -Uri $assetUrl -TimeoutSec 15
Assert-True ($fileResponse.StatusCode -eq 200) "Uploaded file is not publicly readable"
Assert-True ($fileResponse.Headers["Content-Type"] -match "image/png") "Uploaded file MIME type is incorrect"

Write-Step "Checking MIME type, content signature and size validation"
$plainBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("not-an-image"))
$unsupported = Invoke-Api -Method "POST" -Path "/files" -Token $token -Body @{
  fileName = "invalid.txt"
  mimeType = "text/plain"
  base64 = $plainBase64
  scene = "verify-storage"
} -ExpectedStatus 400
Assert-True ([bool]$unsupported.Body.error.message) "Unsupported type error is not readable"

$mismatch = Invoke-Api -Method "POST" -Path "/files" -Token $token -Body @{
  fileName = "fake.png"
  mimeType = "image/png"
  base64 = $plainBase64
  scene = "verify-storage"
} -ExpectedStatus 400
Assert-True ([bool]$mismatch.Body.error.message) "MIME mismatch error is not readable"

$wrongSize = Invoke-Api -Method "POST" -Path "/files" -Token $token -Body @{
  fileName = "wrong-size.png"
  mimeType = "image/png"
  base64 = $pngBase64
  size = 99
  scene = "verify-storage"
} -ExpectedStatus 400
Assert-True ([bool]$wrongSize.Body.error.message) "File size error is not readable"

Write-Host "File storage API verification passed."
