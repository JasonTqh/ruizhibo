param(
  [string]$BaseUrl = $(if ($env:VERIFY_API_BASE_URL) { $env:VERIFY_API_BASE_URL } else { "http://localhost:3000/api" }),
  [string]$AdminPhone = $(if ($env:VERIFY_ADMIN_PHONE) { $env:VERIFY_ADMIN_PHONE } else { "13800000000" }),
  [string]$TeacherPhone = $(if ($env:VERIFY_TEACHER_PHONE) { $env:VERIFY_TEACHER_PHONE } else { "13800000001" }),
  [string]$TeacherPhoneB = $(if ($env:VERIFY_TEACHER_PHONE_B) { $env:VERIFY_TEACHER_PHONE_B } else { "13800000003" })
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")
. "$PSScriptRoot/verify-api-common.ps1"

Write-Step "Logging in with development fixtures"
$adminToken = (Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
  role = "admin"
  phone = $AdminPhone
} -ExpectedStatus 201).Body.data.token
$teacherToken = (Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
  role = "teacher"
  phone = $TeacherPhone
} -ExpectedStatus 201).Body.data.token
$teacherTokenB = (Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
  role = "teacher"
  phone = $TeacherPhoneB
} -ExpectedStatus 201).Body.data.token

Write-Step "Preparing a training media asset for verification"
$trainingHome = (Invoke-Api -Method "GET" -Path "/teacher/training/home" -Token $teacherToken).Body.data
Assert-True ($trainingHome.enabled -eq $true) "Training feature is not enabled for verification actor"
Assert-True ($null -ne $trainingHome.assignment) "Verification actor has no active training assignment"

$current = (Invoke-Api -Method "GET" -Path "/teacher/training/current" -Token $teacherToken).Body.data
Assert-True (($null -ne $current.courses) -and $current.courses.Count -gt 0) "Current training plan has no courses"

$selectedCourse = $null
foreach ($course in $current.courses) {
  if ($null -ne $course.id) {
    $selectedCourse = (Invoke-Api -Method "GET" -Path "/teacher/training/courses/$($course.id)" -Token $teacherToken).Body.data
    if ($selectedCourse.course.snapshot.chapters) { break }
  }
}
Assert-True ($null -ne $selectedCourse) "Unable to resolve a course with chapters for asset checks"

$assetId = $null
foreach ($chapter in @($selectedCourse.course.snapshot.chapters)) {
  foreach ($media in @($chapter.media)) {
    if ($media.fileAssetId) { $assetId = $media.fileAssetId; break }
  }
  if ($assetId) { break }
}
Assert-True ($null -ne $assetId) "Current training content contains no fileAssetId for media verification"

Write-Step "Verifying access API requires login and enforces assignment permission"
try {
  Invoke-WebRequest -Uri "$BaseUrl/files/training/$assetId/access" -UseBasicParsing -TimeoutSec 15
  throw "Anonymous training media access should be rejected"
} catch {
  $status = [int]$_.Exception.Response.StatusCode
  Assert-True ($status -eq 401 -or $status -eq 403) "Anonymous training media access request should be rejected"
}

$access = (Invoke-Api -Method "GET" -Path "/files/training/$assetId/access" -Token $teacherToken).Body.data
Write-Host "access.url=$($access.url)"
Assert-True ($null -ne $access.url -and $null -ne $access.mimeType) "Training media access API did not return media URL"

$parts = $access.url -split "\?", 2
$contentPath = $parts[0]
$queryString = if ($parts.Count -eq 2) { $parts[1] } else { "" }
$actorId = if ($queryString -match "(?:^|&)actorId=([^&]+)") { $matches[1] } else { "" }
$nonce = if ($queryString -match "(?:^|&)nonce=([^&]+)") { $matches[1] } else { "" }
$expires = if ($queryString -match "(?:^|&)expires=([^&]+)") { $matches[1] } else { "" }
$signature = if ($queryString -match "(?:^|&)signature=([^&]+)") { $matches[1] } else { "" }
Assert-True ($actorId -and $nonce -and $expires -and $signature) "Training media access URL is missing signed fields"
Assert-True ($actorId.Length -gt 3) "actorId in access URL is invalid"

$apiOrigin = [regex]::Replace($BaseUrl, "/api/?$", "")
$contentUrl = "${apiOrigin}$($access.url)"
$contentNoSignature = "${apiOrigin}${contentPath}"

Write-Step "Verifying anonymous content access is denied"
try {
  Invoke-WebRequest -Uri $contentNoSignature -Method GET -UseBasicParsing -TimeoutSec 10
  throw "content request without signature should fail"
} catch {
  $status = [int]$_.Exception.Response.StatusCode
  Assert-True ($status -eq 401 -or $status -eq 403) "No-signature content access should return 401/403"
}

Write-Step "Verifying forged signature is denied"
$forgedUrl = "${contentPath}?actorId=$actorId&expires=$expires&nonce=$nonce&signature=bad_signature"
try {
  Invoke-WebRequest -Uri "${apiOrigin}${forgedUrl}" -Method GET -UseBasicParsing -TimeoutSec 10
  throw "content request with forged signature should fail"
} catch {
  $status = [int]$_.Exception.Response.StatusCode
  Assert-True ($status -eq 401 -or $status -eq 403) "Forged signature should be rejected"
}

Write-Step "Verifying expired signature is denied"
$expired = [int]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) - 61
$expiredUrl = "${contentPath}?actorId=$actorId&expires=$expired&nonce=$nonce&signature=$signature"
try {
  Invoke-WebRequest -Uri "${apiOrigin}${expiredUrl}" -Method GET -UseBasicParsing -TimeoutSec 10
  throw "expired content request should fail"
} catch {
  $status = [int]$_.Exception.Response.StatusCode
  Assert-True ($status -eq 401 -or $status -eq 403) "Expired signature should be rejected"
}

Write-Step "Verifying user bound token cannot be repointed to another actorId"
$otherActorUrl = "${contentPath}?actorId=someone-else&expires=$expires&nonce=$nonce&signature=$signature"
try {
  Invoke-WebRequest -Uri "${apiOrigin}${otherActorUrl}" -Method GET -UseBasicParsing -TimeoutSec 10
  throw "content request with alternate actorId should fail"
} catch {
  $status = [int]$_.Exception.Response.StatusCode
  Assert-True ($status -eq 401 -or $status -eq 403) "Alternate actorId should be rejected"
}

Write-Step "Verifying assignment-based media access blocks unauthorized teacher"
try {
  Invoke-WebRequest -Uri "$BaseUrl/files/training/$assetId/access" -Headers @{ Authorization = "Bearer $teacherTokenB" } -UseBasicParsing -TimeoutSec 10
  throw "Another teacher unexpectedly obtained signed access to cross-teacher asset"
} catch {
  $status = [int]$_.Exception.Response.StatusCode
  Assert-True ($status -eq 401 -or $status -eq 403) "Cross-teacher access URL issuance should be rejected"
}

Write-Step "Verifying video/image content and seek/Range behavior"
$rawRange = curl.exe -s -D - --max-time 15 -H "Range: bytes=0-0" "$contentUrl" -o NUL
$rawRangeText = if ($rawRange -is [string]) { $rawRange } else { ($rawRange -join "`n") }
$statusLine = ($rawRangeText -split "`r?`n" | Where-Object { $_ -match '^HTTP/' } | Select-Object -Last 1)
if ($statusLine -notmatch "^HTTP/\S+\s+(\d+)") { throw "Unable to parse media range response status" }
$statusCode = [int]$matches[1]
Assert-True ($statusCode -eq 206) "Range request should return 206"
$contentRange = if (($rangeMatch = [regex]::Match($rawRangeText, "(?im)^Content-Range:\s*(.+)$")).Success) {
  $rangeMatch.Groups[1].Value.Trim()
} else {
  ""
}
$acceptRanges = if (($acceptMatch = [regex]::Match($rawRangeText, "(?im)^Accept-Ranges:\s*(.+)$")).Success) {
  $acceptMatch.Groups[1].Value.Trim()
} else {
  ""
}
Assert-True ($contentRange -match "bytes 0-0/") "Content-Range header is missing for range response"
Assert-True ($acceptRanges -eq "bytes") "Accept-Ranges should be bytes"

Write-Step "Verifying /uploads/training-course is not directly reachable"
try {
  Invoke-WebRequest -Uri "${apiOrigin}/uploads/training-course/forbidden.png" -Method GET -UseBasicParsing -TimeoutSec 10
  throw "/uploads/training-course should not be reachable"
} catch {
  $status = [int]$_.Exception.Response.StatusCode
  Assert-True ($status -eq 401 -or $status -eq 403 -or $status -eq 404) "Public training-course static path should be blocked"
}

Write-Step "Verifying media URL is short-lived and not excessive"
Assert-True (
  [int]$expires -le ([int]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) + 30*60) -and
  [int]$expires -ge [int]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) + 60
) "media expires value is outside expected range"

Write-Host "Training media verification passed."
