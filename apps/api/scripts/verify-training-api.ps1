param(
  [string]$BaseUrl = $(if ($env:VERIFY_API_BASE_URL) { $env:VERIFY_API_BASE_URL } else { "http://localhost:3000/api" }),
  [string]$AdminPhone = $(if ($env:VERIFY_ADMIN_PHONE) { $env:VERIFY_ADMIN_PHONE } else { "13800000000" }),
  [string]$TeacherPhone = $(if ($env:VERIFY_TEACHER_PHONE) { $env:VERIFY_TEACHER_PHONE } else { "13800000001" }),
  [string]$ParentPhone = $(if ($env:VERIFY_PARENT_PHONE) { $env:VERIFY_PARENT_PHONE } else { "13800000002" })
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")
. "$PSScriptRoot/verify-api-common.ps1"

Write-Step "Checking training API health"
Invoke-Api -Method "GET" -Path "/health" | Out-Null

Write-Step "Logging in with development fixtures"
$adminToken = (Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
  role = "admin"
  phone = $AdminPhone
} -ExpectedStatus 201).Body.data.token
$teacherToken = (Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
  role = "teacher"
  phone = $TeacherPhone
} -ExpectedStatus 201).Body.data.token
$parentToken = (Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
  role = "parent"
  phone = $ParentPhone
} -ExpectedStatus 201).Body.data.token

Write-Step "Checking fixed seven-course baseline and management statistics"
$courses = (Invoke-Api -Method "GET" -Path "/admin/training/courses" -Token $adminToken).Body.data
$onboardingCodes = @(
  "ONBOARDING-CULTURE",
  "ONBOARDING-COMPENSATION",
  "ONBOARDING-GROWTH",
  "ONBOARDING-CLASS-FLOW",
  "ONBOARDING-CLASSROOM",
  "ONBOARDING-FAMILY",
  "ONBOARDING-SAFETY"
)
$actualOnboarding = @($courses | Where-Object { $onboardingCodes -contains $_.code } | Sort-Object sortOrder)
Assert-True ($actualOnboarding.Count -eq 7) "The fixed onboarding plan does not expose all seven courses"
Assert-True ($actualOnboarding[3].requiresPractical -and $actualOnboarding[4].requiresPractical -and $actualOnboarding[5].requiresPractical -and $actualOnboarding[6].requiresPractical) "The four practical courses are not configured"
Assert-True ($actualOnboarding[6].isSafety) "The seventh onboarding course must be the safety course"

$stats = (Invoke-Api -Method "GET" -Path "/admin/training/assignments/stats" -Token $adminToken).Body.data
foreach ($name in @("participants", "completed", "learning", "overdue", "pendingPractical", "pendingSafety", "safetyExpiring", "safetyRetraining")) {
  Assert-True ($null -ne $stats.$name) "Training statistics are missing $name"
}
$capabilities = (Invoke-Api -Method "GET" -Path "/admin/training/capabilities" -Token $adminToken).Body.data
Assert-True ($capabilities.globalTrainingManage -eq $true) "Development administrator is missing global training management"
Assert-True ($capabilities.courseManage -eq $true) "Global training manager cannot maintain headquarters courses"
Assert-True ($capabilities.safetyConfirm -eq $true) "Development safety confirmation permission is missing"
$permissionSubjects = (Invoke-Api -Method "GET" -Path "/admin/training/permission-subjects" -Token $adminToken).Body.data
Assert-True (@($permissionSubjects).Count -ge 1) "Training permission subjects are missing administrator accounts"
Assert-True (@($permissionSubjects | Where-Object { $_.role -ne "admin" }).Count -eq 0) "Training permission subjects exposed a non-administrator account"
$permissionGrants = (Invoke-Api -Method "GET" -Path "/admin/training/permissions" -Token $adminToken).Body.data
$allowedTrainingPermissions = @("training_manage", "practical_confirm", "safety_confirm")
Assert-True (@($permissionGrants | Where-Object { $_.permission -notin $allowedTrainingPermissions }).Count -eq 0) "Training permissions exceeded the three PRD v1.1 capabilities"

Write-Step "Checking assignment detail, round history and Excel export"
$assignmentPage = (Invoke-Api -Method "GET" -Path "/admin/training/assignments?page=1&pageSize=20" -Token $adminToken).Body.data
Assert-True ($null -ne $assignmentPage.items) "Training assignment list is missing items"
if (@($assignmentPage.items).Count -gt 0) {
  $assignmentId = $assignmentPage.items[0].id
  $detail = (Invoke-Api -Method "GET" -Path "/admin/training/assignments/$assignmentId" -Token $adminToken).Body.data
  Assert-True ($detail.courses.Count -ge 1) "Training assignment detail is missing course snapshots"
  Assert-True ($null -ne $detail.history) "Training assignment detail is missing historical rounds"
  Assert-True ($null -ne $detail.auditRecords) "Training assignment detail is missing audit records"
}

$exportResponse = Invoke-WebRequest `
  -Uri "$BaseUrl/admin/training/assignments-export.xlsx?page=1&pageSize=20" `
  -Headers @{ Authorization = "Bearer $adminToken" } `
  -UseBasicParsing `
  -TimeoutSec 30
Assert-True ([int]$exportResponse.StatusCode -eq 200) "Training Excel export did not return 200"
$bytes = [byte[]]$exportResponse.Content
Assert-True ($bytes.Length -gt 4 -and $bytes[0] -eq 0x50 -and $bytes[1] -eq 0x4B) "Training export is not a valid XLSX container"

Write-Step "Checking teacher home, linear unlocking and library anti-bypass"
$trainingHome = (Invoke-Api -Method "GET" -Path "/teacher/training/home" -Token $teacherToken).Body.data
Assert-True ($null -ne $trainingHome.enabled) "Teacher training home is missing the campus feature state"
if ($trainingHome.enabled) {
  $library = (Invoke-Api -Method "GET" -Path "/teacher/training/library" -Token $teacherToken).Body.data
  Assert-True ($null -ne $library) "Teacher training library is missing"
  if ($trainingHome.assignment) {
    $plan = (Invoke-Api -Method "GET" -Path "/teacher/training/current" -Token $teacherToken).Body.data
    $expectedCourseCount = if ($plan.type -eq "safety_retraining") { 1 } else { 7 }
    Assert-True ($plan.courses.Count -eq $expectedCourseCount) "Current training plan has an unexpected course count"
    $locked = @($plan.courses | Where-Object { $_.locked })
    foreach ($item in $locked) {
      $libraryItem = @($library | Where-Object { $_.formalCourseId -eq $item.id }) | Select-Object -First 1
      if ($libraryItem) {
        Assert-True ($libraryItem.formalLocked) "A locked formal course was not marked locked in library search"
        Assert-True ($libraryItem.chapters.Count -eq 0) "Library search exposed chapters from a locked formal course"
      }
      $forbiddenCourse = Invoke-Api -Method "GET" -Path "/teacher/training/courses/$($item.id)" -Token $teacherToken -ExpectedStatus 403
      Assert-True ($forbiddenCourse.Body.error.code -eq "FORBIDDEN") "Locked course detail did not enforce server-side linear access"
    }
  }
}

Write-Step "Checking role isolation"
$teacherDenied = Invoke-Api -Method "GET" -Path "/admin/training/courses" -Token $teacherToken -ExpectedStatus 403
Assert-True ($teacherDenied.Body.error.code -eq "FORBIDDEN") "Teacher reached the training administration API"
$parentDenied = Invoke-Api -Method "GET" -Path "/teacher/training/home" -Token $parentToken -ExpectedStatus 403
Assert-True ($parentDenied.Body.error.code -eq "FORBIDDEN") "Parent reached the teacher training API"

Write-Host "Training API verification passed."
