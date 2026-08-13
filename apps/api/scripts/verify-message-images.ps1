param(
  [string]$BaseUrl = "http://localhost:3000/api",
  [string]$TeacherPhone = "13800000001",
  [string]$ParentPhone = "13800000002"
)

$ErrorActionPreference = "Stop"

if (-not $PSBoundParameters.ContainsKey("BaseUrl") -and $env:VERIFY_API_BASE_URL) {
  $BaseUrl = $env:VERIFY_API_BASE_URL
}

. "$PSScriptRoot/verify-api-common.ps1"

Write-Step "Logging in teacher and parent"
$teacherLogin = Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
  role = "teacher"
  phone = $TeacherPhone
} -ExpectedStatus 201
$parentLogin = Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
  role = "parent"
  phone = $ParentPhone
} -ExpectedStatus 201
$teacherToken = $teacherLogin.Body.data.token
$parentToken = $parentLogin.Body.data.token

Write-Step "Finding a shared conversation"
$teacherConversations = Invoke-Api -Method "GET" -Path "/teacher/conversations" -Token $teacherToken
$parentConversations = Invoke-Api -Method "GET" -Path "/parent/conversations" -Token $parentToken
$parentConversationIds = @($parentConversations.Body.data | ForEach-Object { $_.id })
$conversation = @($teacherConversations.Body.data | Where-Object {
  $parentConversationIds -contains $_.id
}) | Select-Object -First 1
Assert-True ($null -ne $conversation) "No shared teacher/parent conversation is available"
$conversationId = $conversation.id

$pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

Write-Step "Keeping text message compatibility"
$textMessage = Invoke-Api -Method "POST" -Path "/teacher/conversations/$conversationId/messages" -Token $teacherToken -Body @{
  content = "message image compatibility check"
} -ExpectedStatus 201
Assert-True ($textMessage.Body.data.kind -eq "text") "Legacy text message behavior changed"

Write-Step "Teacher uploads and sends an image"
$teacherAsset = Invoke-Api -Method "POST" -Path "/files" -Token $teacherToken -Body @{
  fileName = "teacher-message.png"
  mimeType = "image/png"
  base64 = $pngBase64
  size = 68
  scene = "message"
} -ExpectedStatus 201
$teacherMessage = Invoke-Api -Method "POST" -Path "/teacher/conversations/$conversationId/messages" -Token $teacherToken -Body @{
  kind = "image"
  fileUrls = @($teacherAsset.Body.data.url)
} -ExpectedStatus 201
Assert-True ($teacherMessage.Body.data.kind -eq "image") "Teacher image message kind is invalid"

Write-Step "Parent reads the teacher image"
$parentMessages = Invoke-Api -Method "GET" -Path "/parent/conversations/$conversationId/messages" -Token $parentToken
$receivedTeacherMessage = @($parentMessages.Body.data | Where-Object {
  $_.id -eq $teacherMessage.Body.data.id
}) | Select-Object -First 1
Assert-True ($null -ne $receivedTeacherMessage) "Parent did not receive teacher image"
Assert-True ([bool]$receivedTeacherMessage.readAt) "Teacher image was not marked as read"

Write-Step "Parent uploads and sends an image"
$parentAsset = Invoke-Api -Method "POST" -Path "/files" -Token $parentToken -Body @{
  fileName = "parent-message.png"
  mimeType = "image/png"
  base64 = $pngBase64
  size = 68
  scene = "message"
} -ExpectedStatus 201
$parentMessage = Invoke-Api -Method "POST" -Path "/parent/conversations/$conversationId/messages" -Token $parentToken -Body @{
  kind = "image"
  fileUrls = @($parentAsset.Body.data.url)
} -ExpectedStatus 201
Assert-True ($parentMessage.Body.data.kind -eq "image") "Parent image message kind is invalid"

Write-Step "Teacher reads the parent image"
$teacherMessages = Invoke-Api -Method "GET" -Path "/teacher/conversations/$conversationId/messages" -Token $teacherToken
$receivedParentMessage = @($teacherMessages.Body.data | Where-Object {
  $_.id -eq $parentMessage.Body.data.id
}) | Select-Object -First 1
Assert-True ($null -ne $receivedParentMessage) "Teacher did not receive parent image"
Assert-True ([bool]$receivedParentMessage.readAt) "Parent image was not marked as read"

Write-Step "Rejecting foreign files and unsupported message kinds"
Invoke-Api -Method "POST" -Path "/parent/conversations/$conversationId/messages" -Token $parentToken -Body @{
  kind = "image"
  fileUrls = @($teacherAsset.Body.data.url)
} -ExpectedStatus 400 | Out-Null
Invoke-Api -Method "POST" -Path "/teacher/conversations/$conversationId/messages" -Token $teacherToken -Body @{
  kind = "system"
  content = "forged"
} -ExpectedStatus 400 | Out-Null

Write-Host "Message image verification passed."
