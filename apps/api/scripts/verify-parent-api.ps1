param(
  [string]$BaseUrl = "http://localhost:3000/api",
  [string]$ParentPhone = "13800000002",
  [string]$TeacherPhone = "13800000001",
  [switch]$IncludeWrites
)

$ErrorActionPreference = "Stop"

if (-not $PSBoundParameters.ContainsKey("BaseUrl") -and $env:VERIFY_API_BASE_URL) {
  $BaseUrl = $env:VERIFY_API_BASE_URL
}
if (-not $PSBoundParameters.ContainsKey("ParentPhone") -and $env:VERIFY_PARENT_PHONE) {
  $ParentPhone = $env:VERIFY_PARENT_PHONE
}
if (-not $PSBoundParameters.ContainsKey("TeacherPhone") -and $env:VERIFY_TEACHER_PHONE) {
  $TeacherPhone = $env:VERIFY_TEACHER_PHONE
}
. "$PSScriptRoot/verify-api-common.ps1"

Write-Step "Checking health endpoint at $BaseUrl"
Invoke-Api -Method "GET" -Path "/health" | Out-Null

Write-Step "Logging in as parent"
$parentLogin = Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
  role = "parent"
  phone = $ParentPhone
} -ExpectedStatus 201
$parentToken = $parentLogin.Body.data.token
Assert-True ($parentToken.Length -gt 0) "Parent login did not return a token"

Write-Step "Logging in as teacher for role checks and write prerequisites"
$teacherLogin = Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
  role = "teacher"
  phone = $TeacherPhone
} -ExpectedStatus 201
$teacherToken = $teacherLogin.Body.data.token

Write-Step "Checking parent identity and children"
$me = Invoke-Api -Method "GET" -Path "/me" -Token $parentToken
Assert-True ($me.Body.data.role -eq "parent") "GET /me did not return a parent"
$children = Invoke-Api -Method "GET" -Path "/parent/children" -Token $parentToken
Assert-True (@($children.Body.data).Count -ge 1) "Expected at least one bound child"
$studentId = $children.Body.data[0].id
$classId = $children.Body.data[0].class.id

Write-Step "Checking timeline, attendance and homework"
Assert-DataArray (Invoke-Api -Method "GET" -Path "/parent/children/$studentId/timeline" -Token $parentToken) "Timeline endpoint did not return data"
Assert-DataArray (Invoke-Api -Method "GET" -Path "/parent/children/$studentId/attendance" -Token $parentToken) "Attendance endpoint did not return data"
Assert-DataArray (Invoke-Api -Method "GET" -Path "/parent/children/$studentId/homework" -Token $parentToken) "Homework endpoint did not return data"
$pickupToday = Invoke-Api -Method "GET" -Path "/parent/children/$studentId/pickup/today" -Token $parentToken
Assert-True ($null -ne $pickupToday.Body.data.status) "Pickup today endpoint did not return a status"
$pickupHistory = Invoke-Api -Method "GET" -Path "/parent/children/$studentId/pickup-records" -Token $parentToken
Assert-True ($null -ne $pickupHistory.Body.data.items) "Pickup history endpoint did not return items"

Write-Step "Checking notices and conversations"
Assert-DataArray (Invoke-Api -Method "GET" -Path "/parent/notices" -Token $parentToken) "Notices endpoint did not return data"
$conversations = Invoke-Api -Method "GET" -Path "/parent/conversations" -Token $parentToken
Assert-True (@($conversations.Body.data).Count -ge 1) "Expected at least one parent conversation"
$conversationId = $conversations.Body.data[0].id
Assert-DataArray (Invoke-Api -Method "GET" -Path "/parent/conversations/$conversationId/messages" -Token $parentToken) "Conversation messages endpoint did not return data"

Write-Step "Checking authentication, role isolation and data isolation"
$forbidden = Invoke-Api -Method "GET" -Path "/parent/children" -Token $teacherToken -ExpectedStatus 403
Assert-True ($forbidden.Body.error.code -eq "FORBIDDEN") "Expected teacher access to return FORBIDDEN"
$unauthorized = Invoke-Api -Method "GET" -Path "/parent/children" -ExpectedStatus 401
Assert-True ($unauthorized.Body.error.code -eq "UNAUTHORIZED") "Expected missing token to return UNAUTHORIZED"
$notFound = Invoke-Api -Method "GET" -Path "/parent/children/not-a-student/timeline" -Token $parentToken -ExpectedStatus 404
Assert-True ($notFound.Body.error.code -eq "NOT_FOUND") "Expected unbound student access to return NOT_FOUND"
$pickupNotFound = Invoke-Api -Method "GET" -Path "/parent/children/not-a-student/pickup-records" -Token $parentToken -ExpectedStatus 404
Assert-True ($pickupNotFound.Body.error.code -eq "NOT_FOUND") "Expected unbound pickup history access to return NOT_FOUND"

if ($IncludeWrites) {
  Write-Step "Running parent write verification with fresh teacher prerequisites"
  $suffix = Get-Date -Format "yyyyMMddHHmmssfff"

  $teacherClasses = Invoke-Api -Method "GET" -Path "/teacher/classes" -Token $teacherToken
  $ownsChildClass = @($teacherClasses.Body.data | Where-Object { $_.id -eq $classId }).Count -gt 0
  Assert-True $ownsChildClass "TeacherPhone must belong to the selected child's class when -IncludeWrites is used"

  $homework = Invoke-Api -Method "POST" -Path "/teacher/homework" -Token $teacherToken -Body @{
    classId = $classId
    title = "verify-parent-homework-$suffix"
    subject = "API verification"
    content = "Submit this task through the parent API"
    dueAt = (Get-Date).AddDays(1).ToString("o")
  } -ExpectedStatus 201
  $submission = @($homework.Body.data.submissions | Where-Object { $_.studentId -eq $studentId }) | Select-Object -First 1
  Assert-True ($null -ne $submission) "Fresh homework did not create a child submission"

  $submitted = Invoke-Api -Method "POST" -Path "/parent/homework-submissions/$($submission.id)/submit" -Token $parentToken -Body @{
    content = "verify-parent-submission-$suffix"
  } -ExpectedStatus 201
  Assert-True ($submitted.Body.data.status -eq "submitted") "Parent homework was not submitted"

  $notice = Invoke-Api -Method "POST" -Path "/teacher/notices" -Token $teacherToken -Body @{
    classId = $classId
    kind = "task"
    title = "verify-parent-notice-$suffix"
    content = "Confirm this task through the parent API"
    dueAt = (Get-Date).AddDays(1).ToString("o")
  } -ExpectedStatus 201
  $parentNotices = Invoke-Api -Method "GET" -Path "/parent/notices" -Token $parentToken
  $receipt = @($parentNotices.Body.data | Where-Object { $_.notice.id -eq $notice.Body.data.id -and $_.student.id -eq $studentId }) | Select-Object -First 1
  Assert-True ($null -ne $receipt) "Fresh notice receipt was not visible to the parent"

  $viewed = Invoke-Api -Method "POST" -Path "/parent/notice-receipts/$($receipt.id)/view" -Token $parentToken -ExpectedStatus 201
  Assert-True ($null -ne $viewed.Body.data.viewedAt) "Notice was not marked viewed"
  $confirmed = Invoke-Api -Method "POST" -Path "/parent/notice-receipts/$($receipt.id)/confirm" -Token $parentToken -ExpectedStatus 201
  Assert-True ($null -ne $confirmed.Body.data.confirmedAt) "Notice was not confirmed"

  $teacherReceipts = Invoke-Api -Method "GET" -Path "/teacher/notices/$($notice.Body.data.id)/receipts" -Token $teacherToken
  $confirmedReceipt = @($teacherReceipts.Body.data.receipts | Where-Object { $_.id -eq $receipt.id }) | Select-Object -First 1
  Assert-True ($confirmedReceipt.status -eq "confirmed") "Teacher receipt view did not observe confirmation"

  $message = Invoke-Api -Method "POST" -Path "/parent/conversations/$conversationId/messages" -Token $parentToken -Body @{
    kind = "text"
    content = "verify-parent-message-$suffix"
  } -ExpectedStatus 201
  Assert-True ($message.Body.data.content -eq "verify-parent-message-$suffix") "Parent message did not persist"

  $teacherMessages = Invoke-Api -Method "GET" -Path "/teacher/conversations/$conversationId/messages" -Token $teacherToken
  $received = @($teacherMessages.Body.data | Where-Object { $_.id -eq $message.Body.data.id }) | Select-Object -First 1
  Assert-True ($null -ne $received) "Teacher did not receive the parent message"
}

Write-Host "Parent API verification passed."
