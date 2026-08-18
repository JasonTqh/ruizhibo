param(
  [string]$BaseUrl = "http://localhost:3000/api",
  [string]$AdminPhone = "13800000000"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not $PSBoundParameters.ContainsKey("BaseUrl") -and $env:VERIFY_API_BASE_URL) {
  $BaseUrl = $env:VERIFY_API_BASE_URL
}
if (-not $PSBoundParameters.ContainsKey("AdminPhone") -and $env:VERIFY_ADMIN_PHONE) {
  $AdminPhone = $env:VERIFY_ADMIN_PHONE
}

. "$PSScriptRoot/verify-api-common.ps1"

$adminToken = ""
$createdTeachers = @()
$createdParents = @()
$createdStudents = @()

function New-Phone {
  param([string]$Prefix)
  return "$Prefix$(Get-Random -Minimum 10000000 -Maximum 99999999)"
}

function Invoke-Fixture {
  param(
    [string]$Command,
    [string]$TargetId,
    [string]$ActorId = "unused",
    [string]$Extra = ""
  )
  $output = & pnpm exec tsx "$PSScriptRoot/daily-report-verification-fixture.ts" $Command $TargetId $ActorId $Extra 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Daily report fixture failed ($Command): $output"
  }
  return ($output | Out-String).Trim()
}

function Get-Snapshot {
  param([string]$StudentId)
  return (Invoke-Fixture "snapshot" $StudentId | ConvertFrom-Json)
}

function Disable-VerificationData {
  if (-not $adminToken) { return }
  foreach ($studentId in $createdStudents) {
    try {
      Invoke-Api -Method "PATCH" -Path "/admin/students/$studentId" -Token $adminToken -Body @{ status = "inactive" } | Out-Null
    } catch {
      Write-Warning "Could not deactivate daily-report verification student $studentId`: $($_.Exception.Message)"
    }
  }
  foreach ($parentId in $createdParents) {
    try {
      Invoke-Api -Method "PATCH" -Path "/admin/parents/$parentId" -Token $adminToken -Body @{ status = "disabled" } | Out-Null
    } catch {
      Write-Warning "Could not disable daily-report verification parent $parentId`: $($_.Exception.Message)"
    }
  }
  foreach ($teacherId in $createdTeachers) {
    try {
      Invoke-Api -Method "PATCH" -Path "/admin/teachers/$teacherId" -Token $adminToken -Body @{ status = "disabled" } | Out-Null
    } catch {
      Write-Warning "Could not disable daily-report verification teacher $teacherId`: $($_.Exception.Message)"
    }
  }
}

function Assert-ForbiddenFieldsAbsent {
  param([string]$Raw)
  foreach ($field in @("teacherId", "sessionId", "workflowStepId", "studentWorkflowStepId", "pickupRecordId", "careRecordId", "createdById", "storageKey", "storageDriver", "ownerId", '"scene"', "phoneSnapshot")) {
    Assert-True (-not $Raw.Contains($field)) "Parent report exposed forbidden field $field"
  }
}

try {
  Write-Step "Creating isolated CP-36 daily-report verification data"
  $adminToken = (Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{ role = "admin"; phone = $AdminPhone } -ExpectedStatus 201).Body.data.token
  $classes = Invoke-Api -Method "GET" -Path "/admin/classes" -Token $adminToken
  Assert-True (@($classes.Body.data).Count -ge 1) "A seeded campus is required"
  $campusId = $classes.Body.data[0].campusId
  $suffix = Get-Date -Format "MMddHHmmssfff"

  $teacherA = Invoke-Api -Method "POST" -Path "/admin/teachers" -Token $adminToken -Body @{ name = "verify-daily-report-teacher-a-$suffix"; phone = New-Phone "138" } -ExpectedStatus 201
  $teacherB = Invoke-Api -Method "POST" -Path "/admin/teachers" -Token $adminToken -Body @{ name = "verify-daily-report-teacher-b-$suffix"; phone = New-Phone "137" } -ExpectedStatus 201
  $createdTeachers += $teacherA.Body.data.id
  $createdTeachers += $teacherB.Body.data.id
  $parentA = Invoke-Api -Method "POST" -Path "/admin/parents" -Token $adminToken -Body @{ name = "verify-daily-report-parent-a-$suffix"; phone = New-Phone "136" } -ExpectedStatus 201
  $parentB = Invoke-Api -Method "POST" -Path "/admin/parents" -Token $adminToken -Body @{ name = "verify-daily-report-parent-b-$suffix"; phone = New-Phone "135" } -ExpectedStatus 201
  $createdParents += $parentA.Body.data.id
  $createdParents += $parentB.Body.data.id
  $classA = Invoke-Api -Method "POST" -Path "/admin/classes" -Token $adminToken -Body @{ campusId = $campusId; name = "verify-daily-report-class-a-$suffix"; teacherId = $teacherA.Body.data.id } -ExpectedStatus 201
  $classB = Invoke-Api -Method "POST" -Path "/admin/classes" -Token $adminToken -Body @{ campusId = $campusId; name = "verify-daily-report-class-b-$suffix"; teacherId = $teacherB.Body.data.id } -ExpectedStatus 201

  $studentLabels = @("main", "absent", "fallback", "history", "snapshot", "no-record") + (1..14 | ForEach-Object { "filler-$_" })
  $students = @{}
  foreach ($label in $studentLabels) {
    $student = Invoke-Api -Method "POST" -Path "/admin/students" -Token $adminToken -Body @{ classId = $classA.Body.data.id; name = "verify-daily-report-$label-$suffix" } -ExpectedStatus 201
    $students[$label] = $student.Body.data
    $createdStudents += $student.Body.data.id
  }
  $foreignStudent = Invoke-Api -Method "POST" -Path "/admin/students" -Token $adminToken -Body @{ classId = $classB.Body.data.id; name = "verify-daily-report-foreign-$suffix" } -ExpectedStatus 201
  $createdStudents += $foreignStudent.Body.data.id

  foreach ($label in @("main", "absent", "fallback", "history", "snapshot", "no-record")) {
    Invoke-Api -Method "POST" -Path "/admin/students/$($students[$label].id)/guardians" -Token $adminToken -Body @{ parentId = $parentA.Body.data.id; relation = "mother"; isPrimary = ($label -eq "main"); canViewGrowth = $true; canSubmitHomework = $true; canPickup = $true } -ExpectedStatus 201 | Out-Null
  }
  Invoke-Api -Method "POST" -Path "/admin/students/$($foreignStudent.Body.data.id)/guardians" -Token $adminToken -Body @{ parentId = $parentB.Body.data.id; relation = "father"; isPrimary = $true } -ExpectedStatus 201 | Out-Null

  $teacherAToken = (Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{ role = "teacher"; phone = $teacherA.Body.data.phone } -ExpectedStatus 201).Body.data.token
  $teacherBToken = (Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{ role = "teacher"; phone = $teacherB.Body.data.phone } -ExpectedStatus 201).Body.data.token
  $parentAToken = (Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{ role = "parent"; phone = $parentA.Body.data.phone } -ExpectedStatus 201).Body.data.token

  Write-Step "Cases 1-7: base aggregation, role isolation and absence mode"
  $workflowA = Invoke-Api -Method "GET" -Path "/teacher/workflow/today" -Token $teacherAToken
  $workflowB = Invoke-Api -Method "GET" -Path "/teacher/workflow/today" -Token $teacherBToken
  $sessionA = @($workflowA.Body.data | Where-Object { $_.class.id -eq $classA.Body.data.id }) | Select-Object -First 1
  $sessionB = @($workflowB.Body.data | Where-Object { $_.class.id -eq $classB.Body.data.id }) | Select-Object -First 1
  Assert-True ($null -ne $sessionA -and $null -ne $sessionB) "Daily report workflow fixtures were not initialized"
  Invoke-Fixture "create-absence" $students.absent.id $teacherA.Body.data.id | Out-Null

  $parentMainBefore = Invoke-Api -Method "GET" -Path "/parent/students/$($students.main.id)/daily-report" -Token $parentAToken
  Assert-True ($parentMainBefore.Body.data.student.id -eq $students.main.id) "Case 2 parent could not read own child"
  Invoke-Api -Method "GET" -Path "/parent/students/$($foreignStudent.Body.data.id)/daily-report" -Token $parentAToken -ExpectedStatus 404 | Out-Null
  $teacherOwn = Invoke-Api -Method "GET" -Path "/teacher/students/$($students.main.id)/daily-report" -Token $teacherAToken
  Assert-True ($teacherOwn.Body.data.student.id -eq $students.main.id) "Case 4 teacher could not read owned student"
  Invoke-Api -Method "GET" -Path "/teacher/students/$($foreignStudent.Body.data.id)/daily-report" -Token $teacherAToken -ExpectedStatus 404 | Out-Null
  Invoke-Api -Method "GET" -Path "/teacher/daily-reports?classId=$($classB.Body.data.id)" -Token $teacherAToken -ExpectedStatus 404 | Out-Null
  $absenceReport = Invoke-Api -Method "GET" -Path "/parent/students/$($students.absent.id)/daily-report" -Token $parentAToken
  Assert-True ($absenceReport.Body.data.status -eq "absence") "Case 6 did not derive absence status"
  Assert-True ($absenceReport.Body.data.workflow.available -eq $false) "Case 7 exposed pending workflow as an absence problem"
  Assert-True ($absenceReport.Body.data.care.available -eq $false) "Case 7 exposed empty care as an absence problem"
  Assert-True ($absenceReport.Body.data.attention.count -eq 0) "Case 7 generated absence attention"

  Write-Step "Cases 15-22 and 62: student workflow semantics, live refresh and photo isolation"
  $steps = @($sessionA.steps)
  Assert-True ($steps.Count -ge 4) "At least four workflow steps are required"
  $photoStep = @($steps | Where-Object { $_.requirePhoto }) | Select-Object -First 1
  if (-not $photoStep) { $photoStep = $steps[0] }
  $otherSteps = @($steps | Where-Object { $_.id -ne $photoStep.id })
  Assert-True ($otherSteps.Count -ge 2) "Workflow status verification requires three distinct steps"
  $pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
  $workflowAsset = Invoke-Api -Method "POST" -Path "/files" -Token $teacherAToken -Body @{ fileName = "cp36-workflow.png"; mimeType = "image/png"; base64 = $pngBase64; size = 68; scene = "workflow" } -ExpectedStatus 201
  $pendingBefore = Invoke-Api -Method "GET" -Path "/parent/students/$($students.main.id)/daily-report" -Token $parentAToken
  $pendingCount = $pendingBefore.Body.data.workflow.summary.pending
  Invoke-Api -Method "POST" -Path "/teacher/workflow/$($sessionA.id)/steps/$($photoStep.id)/students/$($students.main.id)/complete" -Token $teacherAToken -Body @{ remark = "personal workflow proof"; photoUrls = @($workflowAsset.Body.data.url) } -ExpectedStatus 201 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/workflow/$($sessionA.id)/steps/$($otherSteps[0].id)/students/$($students.main.id)/skip" -Token $teacherAToken -Body @{ remark = "skipped by actual condition" } -ExpectedStatus 201 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/workflow/$($sessionA.id)/steps/$($otherSteps[1].id)/students/$($students.main.id)/exception" -Token $teacherAToken -Body @{ remark = "workflow exception fact" } -ExpectedStatus 201 | Out-Null
  $classPhotoMarker = "/uploads/cp36-class-photo-must-not-leak.png"
  Invoke-Fixture "set-class-photo" $photoStep.id "unused" $classPhotoMarker | Out-Null
  $workflowUpdated = Invoke-Api -Method "GET" -Path "/parent/students/$($students.main.id)/daily-report" -Token $parentAToken
  Assert-True ($workflowUpdated.Body.data.workflow.summary.completed -eq 1) "Case 15 completed status is incorrect"
  Assert-True ($workflowUpdated.Body.data.workflow.summary.skipped -eq 1) "Case 16 skipped status is incorrect"
  Assert-True ($workflowUpdated.Body.data.workflow.summary.exception -eq 1) "Case 17 exception status is incorrect"
  Assert-True ($workflowUpdated.Body.data.workflow.summary.pending -eq ($pendingCount - 3)) "Cases 18-20 workflow summary is incorrect"
  Assert-True ($workflowUpdated.Body.data.workflow.summary.processed -eq 3) "Case 20 processed count is incorrect"
  Assert-True (@($workflowUpdated.Body.data.workflow.steps | Where-Object { $_.photoUrls -contains $workflowAsset.Body.data.url }).Count -eq 1) "Case 21 omitted personal workflow photo"
  Assert-True (-not $workflowUpdated.Raw.Contains($classPhotoMarker)) "Case 22 leaked a class WorkflowStep photo"

  Write-Step "Cases 23-34 and 61: care aggregation, no-data semantics and live refresh"
  Invoke-Api -Method "POST" -Path "/teacher/students/$($students.main.id)/care-records/meal" -Token $teacherAToken -Body @{ slot = "snack"; value = "good" } -ExpectedStatus 201 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/students/$($students.main.id)/care-records/meal" -Token $teacherAToken -Body @{ slot = "dinner"; value = "little" } -ExpectedStatus 201 | Out-Null
  1..2 | ForEach-Object { Invoke-Api -Method "POST" -Path "/teacher/students/$($students.main.id)/care-records/water" -Token $teacherAToken -Body @{} -ExpectedStatus 201 | Out-Null }
  Invoke-Api -Method "POST" -Path "/teacher/students/$($students.main.id)/care-records/rest" -Token $teacherAToken -Body @{ value = "slept"; durationMinutes = 40 } -ExpectedStatus 201 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/students/$($students.main.id)/care-records/mood" -Token $teacherAToken -Body @{ value = "normal" } -ExpectedStatus 201 | Out-Null
  Start-Sleep -Milliseconds 20
  Invoke-Api -Method "POST" -Path "/teacher/students/$($students.main.id)/care-records/mood" -Token $teacherAToken -Body @{ value = "good" } -ExpectedStatus 201 | Out-Null
  $careAsset = Invoke-Api -Method "POST" -Path "/files" -Token $teacherAToken -Body @{ fileName = "cp36-care.png"; mimeType = "image/png"; base64 = $pngBase64; size = 68; scene = "care" } -ExpectedStatus 201
  Invoke-Api -Method "POST" -Path "/teacher/students/$($students.main.id)/care-records/exception" -Token $teacherAToken -Body @{ category = "injury"; needsAttention = $true; remark = "minor bump during activity"; resolution = "cleaned and observed"; photoUrls = @($careAsset.Body.data.url) } -ExpectedStatus 201 | Out-Null
  $twoWater = Invoke-Api -Method "GET" -Path "/parent/students/$($students.main.id)/daily-report" -Token $parentAToken
  Assert-True ($twoWater.Body.data.care.water.count -eq 2) "Case 26 initial water count is incorrect"
  Invoke-Api -Method "POST" -Path "/teacher/students/$($students.main.id)/care-records/water" -Token $teacherAToken -Body @{} -ExpectedStatus 201 | Out-Null
  $careReport = Invoke-Api -Method "GET" -Path "/parent/students/$($students.main.id)/daily-report" -Token $parentAToken
  Assert-True ($careReport.Body.data.care.meal.snack.value -eq "good") "Case 23 snack aggregation is incorrect"
  Assert-True ($careReport.Body.data.care.meal.dinner.value -eq "little") "Case 24 dinner aggregation is incorrect"
  Assert-True ($careReport.Body.data.care.water.count -eq 3) "Cases 26 and 61 water refresh are incorrect"
  Assert-True ($careReport.Body.data.care.rest.durationMinutes -eq 40) "Case 28 rest aggregation is incorrect"
  Assert-True ($careReport.Body.data.care.mood.value -eq "good") "Case 29 did not select the latest mood"
  Assert-True (@($careReport.Body.data.care.exceptions).Count -eq 1) "Case 30 care exception is missing"
  Assert-True ($careReport.Body.data.care.exceptions[0].needsAttention -eq $true) "Case 31 needsAttention is incorrect"
  Assert-True ($careReport.Body.data.care.exceptions[0].teacher.name -eq $teacherA.Body.data.name) "Case 32 omitted the care teacher"
  Assert-True (@($careReport.Body.data.care.exceptions[0].photoUrls).Count -eq 1) "Case 33 omitted the care image URL"
  Assert-True (-not $careReport.Raw.Contains("suspected cold") -and -not $careReport.Raw.Contains("take medicine")) "Case 34 generated medical diagnosis language"
  $noRecord = Invoke-Api -Method "GET" -Path "/parent/students/$($students.'no-record'.id)/daily-report" -Token $parentAToken
  Assert-True ($noRecord.Body.data.care.water.hasRecord -eq $false -and $null -eq $noRecord.Body.data.care.water.count) "Cases 25 and 27 did not preserve no-record semantics"

  Write-Step "Cases 35-44: homework attribution, status isolation and growth visibility"
  $dueAt = (Get-Date).ToUniversalTime().ToString("o")
  $assignments = @{}
  foreach ($state in @("pending", "submitted", "reviewed", "overdue")) {
    $assignment = Invoke-Api -Method "POST" -Path "/teacher/homework" -Token $teacherAToken -Body @{ classId = $classA.Body.data.id; title = "CP36-$state-$suffix"; subject = "general"; content = "daily report homework state verification"; dueAt = $dueAt } -ExpectedStatus 201
    $assignments[$state] = $assignment.Body.data
  }
  $submittedRow = @($assignments.submitted.submissions | Where-Object { $_.studentId -eq $students.main.id }) | Select-Object -First 1
  $reviewedRow = @($assignments.reviewed.submissions | Where-Object { $_.studentId -eq $students.main.id }) | Select-Object -First 1
  $overdueRow = @($assignments.overdue.submissions | Where-Object { $_.studentId -eq $students.main.id }) | Select-Object -First 1
  $homeworkAsset = Invoke-Api -Method "POST" -Path "/files" -Token $parentAToken -Body @{ fileName = "cp36-homework.png"; mimeType = "image/png"; base64 = $pngBase64; size = 68; scene = "homework" } -ExpectedStatus 201
  Invoke-Api -Method "POST" -Path "/parent/homework-submissions/$($submittedRow.id)/submit" -Token $parentAToken -Body @{ content = "current student submission"; fileUrls = @($homeworkAsset.Body.data.url) } -ExpectedStatus 201 | Out-Null
  Invoke-Api -Method "POST" -Path "/parent/homework-submissions/$($reviewedRow.id)/submit" -Token $parentAToken -Body @{ content = "submission to review" } -ExpectedStatus 201 | Out-Null
  Invoke-Api -Method "PATCH" -Path "/teacher/homework-submissions/$($reviewedRow.id)" -Token $teacherAToken -Body @{ status = "reviewed"; remark = "reviewed" } -ExpectedStatus 200 | Out-Null
  Invoke-Fixture "set-homework-status" $overdueRow.id "unused" "overdue" | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/students/$($students.main.id)/growth-records" -Token $teacherAToken -Body @{ title = "parent-visible growth"; content = "organized learning supplies"; visibleToParent = $true } -ExpectedStatus 201 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/students/$($students.main.id)/growth-records" -Token $teacherAToken -Body @{ title = "internal growth"; content = "must not enter parent report"; visibleToParent = $false } -ExpectedStatus 201 | Out-Null
  $studyReport = Invoke-Api -Method "GET" -Path "/parent/students/$($students.main.id)/daily-report" -Token $parentAToken
  $statuses = @($studyReport.Body.data.homework.items | ForEach-Object { $_.status })
  foreach ($expected in @("pending", "submitted", "reviewed", "overdue")) { Assert-True ($statuses -contains $expected) "Homework report omitted status $expected" }
  Assert-True (@($studyReport.Body.data.homework.items).Count -eq 4) "Case 35 attributed an assignment more than once or missed today's assignment"
  Assert-True ($studyReport.Raw.Contains($homeworkAsset.Body.data.url)) "Case 41 omitted the safe homework URL"
  Assert-True ($studyReport.Raw.Contains("parent-visible growth")) "Case 42 omitted visible growth"
  Assert-True (-not $studyReport.Raw.Contains("internal growth")) "Case 43 leaked internal growth"
  Assert-True (-not $studyReport.Raw.Contains($foreignStudent.Body.data.id)) "Case 40 leaked another student's submission"

  Write-Step "Cases 8-14, 18 and 75: pickup ordering, snapshots and attention priority"
  Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($students.main.id)/picked-up" -Token $teacherAToken -Body @{ remark = "picked up at school gate" } -ExpectedStatus 201 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($students.main.id)/arrived" -Token $teacherAToken -Body @{ arrivalMethod = "teacher_pickup" } -ExpectedStatus 201 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($students.main.id)/left" -Token $teacherAToken -Body @{ status = "temporary_authorization"; temporaryName = "temporary authorized uncle"; temporaryRelationship = "relative"; temporaryPhone = "13800001234"; resolution = "parent authorization verified by phone" } -ExpectedStatus 201 | Out-Null
  $person = Invoke-Api -Method "POST" -Path "/admin/students/$($students.snapshot.id)/pickup-persons" -Token $adminToken -Body @{ name = "original pickup person"; relationship = "father"; phone = "13800005678"; isActive = $true } -ExpectedStatus 201
  Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($students.snapshot.id)/picked-up" -Token $teacherAToken -Body @{} -ExpectedStatus 201 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($students.snapshot.id)/arrived" -Token $teacherAToken -Body @{ arrivalMethod = "teacher_pickup" } -ExpectedStatus 201 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($students.snapshot.id)/left" -Token $teacherAToken -Body @{ status = "normal"; pickupPersonType = "authorized_person"; pickupPersonId = $person.Body.data.id } -ExpectedStatus 201 | Out-Null
  Invoke-Api -Method "PATCH" -Path "/admin/pickup-persons/$($person.Body.data.id)" -Token $adminToken -Body @{ name = "modified current pickup person" } -ExpectedStatus 200 | Out-Null
  $finalReport = Invoke-Api -Method "GET" -Path "/parent/students/$($students.main.id)/daily-report" -Token $parentAToken
  Assert-True ($finalReport.Body.data.status -eq "left") "Case 1/68 did not derive left status"
  $pickupTypes = @($finalReport.Body.data.pickup.events | ForEach-Object { $_.type })
  Assert-True (($pickupTypes -join ",") -eq "picked_up_from_school,arrived_at_center,left_center") "Cases 8-9 pickup timeline is duplicated or unordered"
  Assert-True ($finalReport.Body.data.pickup.events[2].teacher.name -eq $teacherA.Body.data.name) "Case 13 omitted pickup teacher name"
  Assert-True ($finalReport.Body.data.attention.items[0].source -eq "pickup") "Case 75 pickup attention did not have highest priority"
  Assert-True ($finalReport.Body.data.attention.items[1].source -eq "care") "Case 75 care attention priority is incorrect"
  Assert-True (@($finalReport.Body.data.workflow.steps | Where-Object { $_.status -eq "pending" }).Count -ge 1) "Case 18 rewrote pending workflow after checkout"
  Assert-True ($finalReport.Raw.Contains("temporary authorized uncle")) "Cases 11-12 did not highlight temporary pickup"
  Assert-True (-not $finalReport.Raw.Contains("13800001234")) "Case 14 exposed a pickup phone"
  $snapshotReport = Invoke-Api -Method "GET" -Path "/parent/students/$($students.snapshot.id)/daily-report" -Token $parentAToken
  Assert-True ($snapshotReport.Raw.Contains("original pickup person") -and -not $snapshotReport.Raw.Contains("modified current pickup person")) "Cases 10/77 did not preserve pickup snapshot"

  Write-Step "Cases 9 and 76-79: attendance fallback and historical date isolation"
  Invoke-Fixture "create-attendance-fallback" $students.fallback.id $teacherA.Body.data.id | Out-Null
  $fallback = Invoke-Api -Method "GET" -Path "/parent/students/$($students.fallback.id)/daily-report" -Token $parentAToken
  Assert-True ($fallback.Body.data.status -eq "left") "Attendance fallback did not derive left status"
  Assert-True (@($fallback.Body.data.pickup.events).Count -eq 2) "Attendance fallback duplicated timeline events"
  $historyDate = Invoke-Fixture "create-history" $students.history.id $teacherA.Body.data.id
  $history = Invoke-Api -Method "GET" -Path "/parent/students/$($students.history.id)/daily-report?date=$historyDate" -Token $parentAToken
  Assert-True ($history.Body.data.status -eq "left") "Case 76 historical status is incorrect"
  Assert-True ($history.Raw.Contains("historical pickup snapshot")) "Case 77 historical pickup snapshot is missing"
  Assert-True ($history.Body.data.care.mood.value -eq "good") "Case 78 historical care is missing"
  Assert-True ($history.Body.data.workflow.summary.completed -eq 1) "Case 79 historical workflow is missing"
  Assert-True ($history.Raw.Contains("historical daily homework") -and $history.Raw.Contains("historical daily growth")) "Historical report mixed or omitted dated facts"
  Assert-True (-not $history.Raw.Contains("parent-visible growth")) "Case 44/76 historical report mixed today's growth"

  Write-Step "Cases 45-48 and 72: report GET is strictly read-only"
  $beforeRead = Get-Snapshot $students.main.id
  Invoke-Api -Method "GET" -Path "/parent/students/$($students.main.id)/daily-report" -Token $parentAToken | Out-Null
  Invoke-Api -Method "GET" -Path "/teacher/students/$($students.main.id)/daily-report" -Token $teacherAToken | Out-Null
  Invoke-Api -Method "GET" -Path "/admin/business/daily-reports/$($students.main.id)" -Token $adminToken | Out-Null
  $afterRead = Get-Snapshot $students.main.id
  Assert-True ($afterRead.growth -eq $beforeRead.growth) "Case 45 report GET created GrowthRecord"
  Assert-True ($afterRead.pickup -eq $beforeRead.pickup) "Case 46 report GET changed PickupRecord"
  Assert-True ($afterRead.care -eq $beforeRead.care) "Case 47 report GET changed StudentCareRecord"
  Assert-True (($afterRead.workflow | ConvertTo-Json -Compress) -eq ($beforeRead.workflow | ConvertTo-Json -Compress)) "Case 48 report GET changed StudentWorkflowStep"
  Assert-True ($afterRead.audit -eq $beforeRead.audit) "Case 72 report GET wrote AuditLog"

  Write-Step "Cases 49-60 and 73: note draft privacy, publication, uniqueness and date validation"
  Invoke-Api -Method "PUT" -Path "/teacher/students/$($students.main.id)/daily-report-note" -Token $teacherAToken -Body @{ comment = "parent-hidden draft"; publish = $false } | Out-Null
  $draftParent = Invoke-Api -Method "GET" -Path "/parent/students/$($students.main.id)/daily-report" -Token $parentAToken
  Assert-True (-not $draftParent.Raw.Contains("parent-hidden draft")) "Case 50 leaked draft note"
  Invoke-Api -Method "PUT" -Path "/teacher/students/$($students.main.id)/daily-report-note" -Token $teacherAToken -Body @{ comment = "Stable day, thank you."; publish = $true } | Out-Null
  $publishedParent = Invoke-Api -Method "GET" -Path "/parent/students/$($students.main.id)/daily-report" -Token $parentAToken
  Assert-True ($publishedParent.Raw.Contains("Stable day")) "Case 51 parent cannot see published note"
  Invoke-Api -Method "PUT" -Path "/teacher/students/$($students.main.id)/daily-report-note" -Token $teacherAToken -Body @{ comment = "Updated daily note."; publish = $true } | Out-Null
  $republished = Invoke-Api -Method "GET" -Path "/parent/students/$($students.main.id)/daily-report" -Token $parentAToken
  Assert-True ($republished.Raw.Contains("Updated daily note") -and -not $republished.Raw.Contains("Stable day")) "Case 52 republish did not replace comment"
  $noteSnapshot = Get-Snapshot $students.main.id
  Assert-True ($noteSnapshot.notes -eq 1) "Case 53 created duplicate notes"
  Assert-True ($noteSnapshot.audit -gt $afterRead.audit) "Case 73 note writes did not create audit logs"
  Invoke-Api -Method "PUT" -Path "/teacher/students/$($foreignStudent.Body.data.id)/daily-report-note" -Token $teacherAToken -Body @{ comment = "cross-class"; publish = $false } -ExpectedStatus 404 | Out-Null
  Invoke-Api -Method "PUT" -Path "/teacher/students/$($students.main.id)/daily-report-note" -Token $teacherAToken -Body @{ comment = ("x" * 501); publish = $false } -ExpectedStatus 400 | Out-Null
  Invoke-Api -Method "PUT" -Path "/teacher/students/$($students.main.id)/daily-report-note" -Token $teacherAToken -Body @{ comment = "   "; publish = $true } -ExpectedStatus 400 | Out-Null
  $future = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
  Invoke-Api -Method "GET" -Path "/parent/students/$($students.main.id)/daily-report?date=$future" -Token $parentAToken -ExpectedStatus 400 | Out-Null
  Invoke-Api -Method "GET" -Path "/parent/students/$($students.main.id)/daily-report?date=2026-02-31" -Token $parentAToken -ExpectedStatus 400 | Out-Null
  $tooOld = (Get-Date).AddDays(-91).ToString("yyyy-MM-dd")
  Invoke-Api -Method "GET" -Path "/parent/students/$($students.main.id)/daily-report?date=$tooOld" -Token $parentAToken -ExpectedStatus 400 | Out-Null
  Assert-ForbiddenFieldsAbsent $republished.Raw

  Write-Step "Cases 63-71, 74 and 80: admin pagination/filters and 20-student teacher summary"
  $adminDefault = Invoke-Api -Method "GET" -Path "/admin/business/daily-reports?classId=$($classA.Body.data.id)&page=1&pageSize=5" -Token $adminToken
  Assert-True ($adminDefault.Body.data.date -eq (Get-Date).ToString("yyyy-MM-dd")) "Case 63 admin default date is not today"
  Assert-True (@($adminDefault.Body.data.items).Count -eq 5 -and $adminDefault.Body.data.total -eq 20 -and $adminDefault.Body.data.page -eq 1) "Case 64 admin pagination is incorrect"
  $adminException = Invoke-Api -Method "GET" -Path "/admin/business/daily-reports?classId=$($classA.Body.data.id)&hasException=true&pageSize=50" -Token $adminToken
  Assert-True (@($adminException.Body.data.items | Where-Object { $_.student.id -eq $students.main.id }).Count -eq 1) "Case 65 admin exception filter omitted main student"
  $adminAttention = Invoke-Api -Method "GET" -Path "/admin/business/daily-reports?classId=$($classA.Body.data.id)&needsAttention=true&pageSize=50" -Token $adminToken
  Assert-True (@($adminAttention.Body.data.items | Where-Object { $_.student.id -eq $students.main.id }).Count -eq 1) "Case 66 admin attention filter omitted main student"
  $adminAbsent = Invoke-Api -Method "GET" -Path "/admin/business/daily-reports?classId=$($classA.Body.data.id)&status=absence&pageSize=50" -Token $adminToken
  Assert-True (@($adminAbsent.Body.data.items).Count -eq 1 -and $adminAbsent.Body.data.items[0].student.id -eq $students.absent.id) "Case 67 admin absence filter is incorrect"
  $adminLeft = Invoke-Api -Method "GET" -Path "/admin/business/daily-reports?classId=$($classA.Body.data.id)&status=left&pageSize=50" -Token $adminToken
  Assert-True (@($adminLeft.Body.data.items | Where-Object { $_.student.id -eq $students.main.id }).Count -eq 1) "Case 68 admin left filter omitted main student"
  $adminPublished = Invoke-Api -Method "GET" -Path "/admin/business/daily-reports?classId=$($classA.Body.data.id)&published=true&pageSize=50" -Token $adminToken
  Assert-True (@($adminPublished.Body.data.items).Count -eq 1 -and $adminPublished.Body.data.items[0].student.id -eq $students.main.id) "Case 69 admin published filter is incorrect"
  Assert-True (@($adminDefault.Body.data.items).Count -le $adminDefault.Body.data.pageSize) "Case 70 aggregated more than the current DB page"
  $teacherTwenty = Invoke-Api -Method "GET" -Path "/teacher/daily-reports?classId=$($classA.Body.data.id)" -Token $teacherAToken
  Assert-True (@($teacherTwenty.Body.data.items).Count -eq 20) "Case 71 teacher summary did not return the 20-student class"
  Assert-True ($absenceReport.Body.data.attention.count -eq 0) "Case 74 absence generated attention"
  Invoke-Api -Method "GET" -Path "/parent/students/$($foreignStudent.Body.data.id)/daily-report" -Token $parentAToken -ExpectedStatus 404 | Out-Null

  Write-Step "Cases 81-89: class-transfer history context and isolation"
  Invoke-Api -Method "PATCH" -Path "/admin/students/$($students.history.id)" -Token $adminToken -Body @{ classId = $classB.Body.data.id } -ExpectedStatus 200 | Out-Null
  $contamination = Invoke-Fixture "create-transfer-contamination" $students.history.id $teacherB.Body.data.id | ConvertFrom-Json
  Assert-True ($contamination.date -eq $historyDate) "Transfer fixture used a different report date"
  $beforeTransferRead = Get-Snapshot $students.history.id
  $transferredHistory = Invoke-Api -Method "GET" -Path "/parent/students/$($students.history.id)/daily-report?date=$historyDate" -Token $parentAToken
  Assert-True ($transferredHistory.Body.data.class.name -eq $classA.Body.data.name) "Case 81 historical report displayed the student's current class"
  Assert-True ($transferredHistory.Body.data.workflow.summary.completed -eq 1 -and $transferredHistory.Raw.Contains("historical daily workflow")) "Case 82 lost the old-class StudentWorkflowStep"
  Assert-True ($transferredHistory.Raw.Contains("historical daily homework")) "Case 83 lost the old-class reviewed homework"
  Assert-True (-not $transferredHistory.Raw.Contains($contamination.workflowMarker)) "Case 84 mixed the new-class workflow into old history"
  Assert-True (-not $transferredHistory.Raw.Contains($contamination.homeworkMarker)) "Case 85 mixed the new-class homework into old history"
  $adminHistoryA = Invoke-Api -Method "GET" -Path "/admin/business/daily-reports?date=$historyDate&classId=$($classA.Body.data.id)&pageSize=50" -Token $adminToken
  $adminHistoryB = Invoke-Api -Method "GET" -Path "/admin/business/daily-reports?date=$historyDate&classId=$($classB.Body.data.id)&pageSize=50" -Token $adminToken
  $adminTransferred = @($adminHistoryA.Body.data.items | Where-Object { $_.student.id -eq $students.history.id })
  Assert-True ($adminTransferred.Count -eq 1 -and $adminTransferred[0].class.id -eq $classA.Body.data.id -and $adminTransferred[0].campus.id -eq $campusId) "Cases 86-87 admin historical class/campus filtering is incorrect"
  Assert-True (@($adminHistoryB.Body.data.items | Where-Object { $_.student.id -eq $students.history.id }).Count -eq 0) "Case 87 current-class data overrode pickup history"
  Invoke-Api -Method "GET" -Path "/teacher/students/$($students.history.id)/daily-report?date=$historyDate" -Token $teacherAToken -ExpectedStatus 404 | Out-Null
  $currentTeacherHistory = Invoke-Api -Method "GET" -Path "/teacher/students/$($students.history.id)/daily-report?date=$historyDate" -Token $teacherBToken
  Assert-True ($currentTeacherHistory.Body.data.class.id -eq $classA.Body.data.id) "Case 88 changed teacher access or lost historical class context"
  $afterTransferRead = Get-Snapshot $students.history.id
  Assert-True (($afterTransferRead | ConvertTo-Json -Compress) -eq ($beforeTransferRead | ConvertTo-Json -Compress)) "Case 89 historical report GET changed persisted facts"

  Write-Host "Daily report verification passed (Cases 1-89: aggregation, transfer history, isolation, read-only GET, note privacy, filters, dates and no-data semantics)."
} finally {
  Disable-VerificationData
}
