param(
  [string]$BaseUrl = "http://localhost:3000/api",
  [string]$TeacherPhone = "13800000001",
  [string]$ParentPhone = "13800000002",
  [switch]$IncludeWrites
)

$ErrorActionPreference = "Stop"

if (-not $PSBoundParameters.ContainsKey("BaseUrl") -and $env:VERIFY_API_BASE_URL) {
  $BaseUrl = $env:VERIFY_API_BASE_URL
}
if (-not $PSBoundParameters.ContainsKey("TeacherPhone") -and $env:VERIFY_TEACHER_PHONE) {
  $TeacherPhone = $env:VERIFY_TEACHER_PHONE
}
if (-not $PSBoundParameters.ContainsKey("ParentPhone") -and $env:VERIFY_PARENT_PHONE) {
  $ParentPhone = $env:VERIFY_PARENT_PHONE
}
. "$PSScriptRoot/verify-api-common.ps1"

Write-Step "Checking health endpoint at $BaseUrl"
Invoke-Api -Method "GET" -Path "/health" | Out-Null

Write-Step "Logging in as teacher"
$teacherLogin = Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
  role = "teacher"
  phone = $TeacherPhone
} -ExpectedStatus 201
$teacherToken = $teacherLogin.Body.data.token
Assert-True ($teacherToken.Length -gt 0) "Teacher login did not return a token"

Write-Step "Logging in as parent for role isolation checks"
$parentLogin = Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
  role = "parent"
  phone = $ParentPhone
} -ExpectedStatus 201
$parentToken = $parentLogin.Body.data.token

Write-Step "Checking teacher identity and dashboard"
$me = Invoke-Api -Method "GET" -Path "/me" -Token $teacherToken
Assert-True ($me.Body.data.role -eq "teacher") "GET /me did not return a teacher"
$dashboard = Invoke-Api -Method "GET" -Path "/teacher/dashboard" -Token $teacherToken
Assert-True ($dashboard.Body.data.classCount -ge 1) "Expected at least one teacher class"
Assert-True ($dashboard.Body.data.studentCount -ge 1) "Expected at least one teacher student"

Write-Step "Checking classes, students and today's workflow"
$classes = Invoke-Api -Method "GET" -Path "/teacher/classes" -Token $teacherToken
Assert-True (@($classes.Body.data).Count -ge 1) "Expected at least one teacher class"
$classId = $classes.Body.data[0].id
$students = Invoke-Api -Method "GET" -Path "/teacher/classes/$classId/students" -Token $teacherToken
Assert-True (@($students.Body.data).Count -ge 1) "Expected at least one class student"
$studentId = $students.Body.data[0].id
$workflow = Invoke-Api -Method "GET" -Path "/teacher/workflow/today" -Token $teacherToken
Assert-DataArray $workflow "Workflow endpoint did not return data"

Write-Step "Checking teaching, growth, lesson and research reads"
Assert-DataArray (Invoke-Api -Method "GET" -Path "/teacher/teaching-records" -Token $teacherToken) "Teaching records endpoint did not return data"
Assert-DataArray (Invoke-Api -Method "GET" -Path "/teacher/growth-records" -Token $teacherToken) "Growth records endpoint did not return data"
Assert-DataArray (Invoke-Api -Method "GET" -Path "/teacher/lesson-plans?scope=all" -Token $teacherToken) "Lesson plans endpoint did not return data"
Assert-DataArray (Invoke-Api -Method "GET" -Path "/teacher/research-activities?scope=all" -Token $teacherToken) "Research endpoint did not return data"

Write-Step "Checking homework, notices and conversations"
Assert-DataArray (Invoke-Api -Method "GET" -Path "/teacher/homework" -Token $teacherToken) "Homework endpoint did not return data"
Assert-DataArray (Invoke-Api -Method "GET" -Path "/teacher/notices" -Token $teacherToken) "Notices endpoint did not return data"
$conversations = Invoke-Api -Method "GET" -Path "/teacher/conversations" -Token $teacherToken
Assert-True (@($conversations.Body.data).Count -ge 1) "Expected at least one teacher conversation"
$conversationId = $conversations.Body.data[0].id
Assert-DataArray (Invoke-Api -Method "GET" -Path "/teacher/conversations/$conversationId/messages" -Token $teacherToken) "Conversation messages endpoint did not return data"

Write-Step "Checking authentication, role isolation and validation errors"
$forbidden = Invoke-Api -Method "GET" -Path "/teacher/dashboard" -Token $parentToken -ExpectedStatus 403
Assert-True ($forbidden.Body.error.code -eq "FORBIDDEN") "Expected parent access to return FORBIDDEN"
$unauthorized = Invoke-Api -Method "GET" -Path "/teacher/dashboard" -ExpectedStatus 401
Assert-True ($unauthorized.Body.error.code -eq "UNAUTHORIZED") "Expected missing token to return UNAUTHORIZED"
$badRequest = Invoke-Api -Method "GET" -Path "/teacher/lesson-plans?scope=invalid" -Token $teacherToken -ExpectedStatus 400
Assert-True ($badRequest.Body.error.code -eq "BAD_REQUEST") "Expected invalid scope to return BAD_REQUEST"

if ($IncludeWrites) {
  Write-Step "Running teacher write verification"
  $suffix = Get-Date -Format "yyyyMMddHHmmssfff"

  $teaching = Invoke-Api -Method "POST" -Path "/teacher/teaching-records" -Token $teacherToken -Body @{
    classId = $classId
    date = (Get-Date).ToString("o")
    course = "verify-course-$suffix"
    content = "Automated teacher API verification"
    tags = @("verify", "cp24")
  } -ExpectedStatus 201
  Assert-True ($teaching.Body.data.course -eq "verify-course-$suffix") "Teaching record write did not persist"

  $growth = Invoke-Api -Method "POST" -Path "/teacher/students/$studentId/growth-records" -Token $teacherToken -Body @{
    title = "verify-growth-$suffix"
    content = "Automated growth feedback verification"
    visibleToParent = $false
  } -ExpectedStatus 201
  Assert-True ($growth.Body.data.visibleToParent -eq $false) "Growth visibility did not persist"

  $homework = Invoke-Api -Method "POST" -Path "/teacher/homework" -Token $teacherToken -Body @{
    classId = $classId
    title = "verify-homework-$suffix"
    subject = "API verification"
    content = "Complete the automated verification task"
    dueAt = (Get-Date).AddDays(1).ToString("o")
  } -ExpectedStatus 201
  Assert-True (@($homework.Body.data.submissions).Count -ge 1) "Homework did not create submissions"

  $notice = Invoke-Api -Method "POST" -Path "/teacher/notices" -Token $teacherToken -Body @{
    classId = $classId
    kind = "task"
    title = "verify-notice-$suffix"
    content = "Automated notice verification"
    dueAt = (Get-Date).AddDays(1).ToString("o")
  } -ExpectedStatus 201
  Assert-True ($notice.Body.data.receiptSummary.totalCount -ge 1) "Notice did not create receipts"
  $receipts = Invoke-Api -Method "GET" -Path "/teacher/notices/$($notice.Body.data.id)/receipts" -Token $teacherToken
  Assert-True (@($receipts.Body.data.receipts).Count -ge 1) "Notice receipts were not readable"

  $message = Invoke-Api -Method "POST" -Path "/teacher/conversations/$conversationId/messages" -Token $teacherToken -Body @{
    kind = "text"
    content = "verify-teacher-message-$suffix"
  } -ExpectedStatus 201
  Assert-True ($message.Body.data.content -eq "verify-teacher-message-$suffix") "Teacher message did not persist"

  $uncheckedStep = $null
  foreach ($session in @($workflow.Body.data)) {
    $candidate = @($session.steps | Where-Object { -not $_.checked -and -not $_.requirePhoto }) | Select-Object -First 1
    if ($candidate) {
      $uncheckedStep = @{ SessionId = $session.id; StepId = $candidate.id }
      break
    }
  }
  if ($uncheckedStep) {
    $checked = Invoke-Api -Method "POST" -Path "/teacher/workflow/$($uncheckedStep.SessionId)/steps/$($uncheckedStep.StepId)/check" -Token $teacherToken -Body @{} -ExpectedStatus 201
    Assert-True ($checked.Body.data.checked -eq $true) "Workflow step was not checked"
  } else {
    Write-Step "No unchecked non-photo workflow step remains; workflow write check skipped"
  }
}

Write-Host "Teacher API verification passed."
