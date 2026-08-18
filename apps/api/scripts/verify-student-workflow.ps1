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

function Disable-VerificationData {
  if (-not $adminToken) { return }

  foreach ($studentId in $createdStudents) {
    try {
      Invoke-Api -Method "PATCH" -Path "/admin/students/$studentId" -Token $adminToken -Body @{
        status = "inactive"
      } | Out-Null
    } catch {
      Write-Warning "Could not deactivate student-workflow verification student $studentId`: $($_.Exception.Message)"
    }
  }
  foreach ($parentId in $createdParents) {
    try {
      Invoke-Api -Method "PATCH" -Path "/admin/parents/$parentId" -Token $adminToken -Body @{
        status = "disabled"
      } | Out-Null
    } catch {
      Write-Warning "Could not disable student-workflow verification parent $parentId`: $($_.Exception.Message)"
    }
  }
  foreach ($teacherId in $createdTeachers) {
    try {
      Invoke-Api -Method "PATCH" -Path "/admin/teachers/$teacherId" -Token $adminToken -Body @{
        status = "disabled"
      } | Out-Null
    } catch {
      Write-Warning "Could not disable student-workflow verification teacher $teacherId`: $($_.Exception.Message)"
    }
  }
}

function Get-IsolatedSession {
  param(
    [string]$Token,
    [string]$ClassId
  )

  $workflow = Invoke-Api -Method "GET" -Path "/teacher/workflow/today" -Token $Token
  $session = @($workflow.Body.data | Where-Object { $_.class.id -eq $ClassId }) | Select-Object -First 1
  Assert-True ($null -ne $session) "The isolated workflow session was not returned"
  return $session
}

function Get-StepFromSession {
  param(
    $Session,
    [string]$StepId
  )

  $step = @($Session.steps | Where-Object { $_.id -eq $StepId }) | Select-Object -First 1
  Assert-True ($null -ne $step) "Workflow step $StepId was not returned"
  return $step
}

function Get-StudentFromStep {
  param(
    $Step,
    [string]$StudentId
  )

  $student = @($Step.students | Where-Object { $_.id -eq $StudentId }) | Select-Object -First 1
  Assert-True ($null -ne $student) "Student $StudentId was not returned for workflow step $($Step.id)"
  return $student
}

function New-Phone {
  param([string]$Prefix)
  $tail = Get-Random -Minimum 10000000 -Maximum 99999999
  return "$Prefix$tail"
}

try {
  Write-Step "Creating isolated student-workflow verification data"
  $adminLogin = Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
    role = "admin"
    phone = $AdminPhone
  } -ExpectedStatus 201
  $adminToken = $adminLogin.Body.data.token

  $classes = Invoke-Api -Method "GET" -Path "/admin/classes" -Token $adminToken
  Assert-True (@($classes.Body.data).Count -ge 1) "A seeded campus is required"
  $campusId = $classes.Body.data[0].campusId
  $suffix = Get-Date -Format "MMddHHmmssfff"

  $teacherA = Invoke-Api -Method "POST" -Path "/admin/teachers" -Token $adminToken -Body @{
    name = "verify-student-workflow-teacher-a-$suffix"
    phone = New-Phone "138"
  } -ExpectedStatus 201
  $createdTeachers += $teacherA.Body.data.id
  $teacherB = Invoke-Api -Method "POST" -Path "/admin/teachers" -Token $adminToken -Body @{
    name = "verify-student-workflow-teacher-b-$suffix"
    phone = New-Phone "137"
  } -ExpectedStatus 201
  $createdTeachers += $teacherB.Body.data.id

  $parentA = Invoke-Api -Method "POST" -Path "/admin/parents" -Token $adminToken -Body @{
    name = "verify-student-workflow-parent-a-$suffix"
    phone = New-Phone "136"
  } -ExpectedStatus 201
  $createdParents += $parentA.Body.data.id
  $parentB = Invoke-Api -Method "POST" -Path "/admin/parents" -Token $adminToken -Body @{
    name = "verify-student-workflow-parent-b-$suffix"
    phone = New-Phone "135"
  } -ExpectedStatus 201
  $createdParents += $parentB.Body.data.id

  $classA = Invoke-Api -Method "POST" -Path "/admin/classes" -Token $adminToken -Body @{
    campusId = $campusId
    name = "verify-student-workflow-class-a-$suffix"
    teacherId = $teacherA.Body.data.id
  } -ExpectedStatus 201
  $classB = Invoke-Api -Method "POST" -Path "/admin/classes" -Token $adminToken -Body @{
    campusId = $campusId
    name = "verify-student-workflow-class-b-$suffix"
    teacherId = $teacherB.Body.data.id
  } -ExpectedStatus 201

  $students = @{}
  foreach ($label in @("a", "b", "c", "d", "e", "f", "g", "h")) {
    $student = Invoke-Api -Method "POST" -Path "/admin/students" -Token $adminToken -Body @{
      classId = $classA.Body.data.id
      name = "verify-student-workflow-$label-$suffix"
    } -ExpectedStatus 201
    $students[$label] = $student.Body.data
    $createdStudents += $student.Body.data.id
  }
  $foreignStudent = Invoke-Api -Method "POST" -Path "/admin/students" -Token $adminToken -Body @{
    classId = $classB.Body.data.id
    name = "verify-student-workflow-foreign-$suffix"
  } -ExpectedStatus 201
  $createdStudents += $foreignStudent.Body.data.id

  Invoke-Api -Method "POST" -Path "/admin/students/$($students.a.id)/guardians" -Token $adminToken -Body @{
    parentId = $parentA.Body.data.id
    relation = "mother"
    isPrimary = $true
    canPickup = $true
  } -ExpectedStatus 201 | Out-Null
  Invoke-Api -Method "POST" -Path "/admin/students/$($foreignStudent.Body.data.id)/guardians" -Token $adminToken -Body @{
    parentId = $parentB.Body.data.id
    relation = "father"
    isPrimary = $true
    canPickup = $true
  } -ExpectedStatus 201 | Out-Null

  $teacherALogin = Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
    role = "teacher"
    phone = $teacherA.Body.data.phone
  } -ExpectedStatus 201
  $teacherAToken = $teacherALogin.Body.data.token
  $teacherBLogin = Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
    role = "teacher"
    phone = $teacherB.Body.data.phone
  } -ExpectedStatus 201
  $teacherBToken = $teacherBLogin.Body.data.token
  $parentALogin = Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
    role = "parent"
    phone = $parentA.Body.data.phone
  } -ExpectedStatus 201
  $parentAToken = $parentALogin.Body.data.token

  Write-Step "Case 1: initializing pending student facts for every class step"
  $sessionA = Get-IsolatedSession -Token $teacherAToken -ClassId $classA.Body.data.id
  $sessionB = Get-IsolatedSession -Token $teacherBToken -ClassId $classB.Body.data.id
  Assert-True (@($sessionA.steps).Count -ge 5) "The active workflow template must provide at least five steps"
  foreach ($step in @($sessionA.steps)) {
    Assert-True ($step.studentSummary.total -eq 8) "A workflow step did not initialize all active students"
    Assert-True ($step.studentSummary.pending -eq 8) "A newly initialized workflow step was not fully pending"
    Assert-True (@($step.students | Where-Object { $_.effectiveStatus -ne "pending" }).Count -eq 0) "A new student workflow fact had a terminal state"
  }

  $regularSteps = @($sessionA.steps | Where-Object { -not $_.requirePhoto })
  $photoStep = @($sessionA.steps | Where-Object { $_.requirePhoto }) | Select-Object -First 1
  Assert-True ($regularSteps.Count -ge 4) "Four non-photo workflow steps are required for isolated verification"
  Assert-True ($null -ne $photoStep) "A requirePhoto workflow step is required for compatibility verification"
  $step1 = $regularSteps[0]
  $step2 = $regularSteps[1]
  $step3 = $regularSteps[2]
  $step4 = $regularSteps[3]
  $foreignStep = @($sessionB.steps) | Select-Object -First 1

  $growthBefore = Invoke-Api -Method "GET" -Path "/admin/business/growth-records?classId=$($classA.Body.data.id)&type=workflow&pageSize=50" -Token $adminToken

  $pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
  $ownerWorkflowAsset = Invoke-Api -Method "POST" -Path "/files" -Token $teacherAToken -Body @{
    fileName = "student-workflow-owner.png"
    mimeType = "image/png"
    base64 = $pngBase64
    size = 68
    scene = "workflow"
  } -ExpectedStatus 201
  $ownerMessageAsset = Invoke-Api -Method "POST" -Path "/files" -Token $teacherAToken -Body @{
    fileName = "student-workflow-message.png"
    mimeType = "image/png"
    base64 = $pngBase64
    size = 68
    scene = "message"
  } -ExpectedStatus 201
  $foreignWorkflowAsset = Invoke-Api -Method "POST" -Path "/files" -Token $teacherBToken -Body @{
    fileName = "student-workflow-foreign.png"
    mimeType = "image/png"
    base64 = $pngBase64
    size = 68
    scene = "workflow"
  } -ExpectedStatus 201

  Write-Step "Creating a current-day absence after workflow initialization"
  $fixtureOutput = & pnpm exec tsx "$PSScriptRoot/pickup-verification-fixture.ts" create-absence $students.e.id $teacherA.Body.data.id
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create student-workflow absence fixture: $fixtureOutput"
  }

  Write-Step "Cases 2-3: completing one student while the class step remains unchecked"
  $completeAPath = "/teacher/workflow/$($sessionA.id)/steps/$($step1.id)/students/$($students.a.id)/complete"
  $completedA = Invoke-Api -Method "POST" -Path $completeAPath -Token $teacherAToken -Body @{
    remark = "Individual completion proof"
    photoUrls = @($ownerWorkflowAsset.Body.data.url)
  } -ExpectedStatus 201
  Assert-True ($completedA.Body.data.status -eq "completed") "Case 2 did not persist completed status"
  Assert-True ($completedA.Body.data.teacher.id -eq $teacherA.Body.data.id) "Case 2 did not persist the responsible teacher"
  Assert-True ($null -ne $completedA.Body.data.completedAt) "Case 2 did not persist completedAt"
  Assert-True ($completedA.Body.data.remark -eq "Individual completion proof") "Case 2 did not persist the remark"
  Assert-True (@($completedA.Body.data.photoUrls).Count -eq 1) "Case 2 did not persist the personal photo"

  $sessionA = Get-IsolatedSession -Token $teacherAToken -ClassId $classA.Body.data.id
  $step1View = Get-StepFromSession -Session $sessionA -StepId $step1.id
  $studentBView = Get-StudentFromStep -Step $step1View -StudentId $students.b.id
  Assert-True ($studentBView.effectiveStatus -eq "pending") "Case 3 changed an unrelated student"
  Assert-True ($step1View.checked -eq $false) "Case 3 incorrectly marked the class step checked"

  Write-Step "Cases 5 and 9-12: absence, repeat and terminal-transition protections"
  Invoke-Api -Method "POST" -Path "/teacher/workflow/$($sessionA.id)/steps/$($step1.id)/students/$($students.e.id)/complete" -Token $teacherAToken -Body @{} -ExpectedStatus 409 | Out-Null
  Invoke-Api -Method "POST" -Path $completeAPath -Token $teacherAToken -Body @{} -ExpectedStatus 409 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/workflow/$($sessionA.id)/steps/$($step1.id)/students/$($students.a.id)/skip" -Token $teacherAToken -Body @{ remark = "must not overwrite" } -ExpectedStatus 409 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/workflow/$($sessionA.id)/steps/$($step1.id)/students/$($students.c.id)/skip" -Token $teacherAToken -Body @{} -ExpectedStatus 400 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/workflow/$($sessionA.id)/steps/$($step1.id)/students/$($students.d.id)/exception" -Token $teacherAToken -Body @{} -ExpectedStatus 400 | Out-Null

  Write-Step "Cases 6-8: rejecting cross-teacher, mismatched-step and foreign-student access"
  Invoke-Api -Method "POST" -Path "/teacher/workflow/$($sessionA.id)/steps/$($step1.id)/students/$($students.b.id)/complete" -Token $teacherBToken -Body @{} -ExpectedStatus 403 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/workflow/$($sessionA.id)/steps/$($foreignStep.id)/students/$($students.b.id)/complete" -Token $teacherAToken -Body @{} -ExpectedStatus 404 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/workflow/$($sessionA.id)/steps/$($step1.id)/students/$($foreignStudent.Body.data.id)/complete" -Token $teacherAToken -Body @{} -ExpectedStatus 403 | Out-Null

  Invoke-Api -Method "POST" -Path "/teacher/workflow/$($sessionA.id)/steps/$($step1.id)/students/$($students.c.id)/skip" -Token $teacherAToken -Body @{
    remark = "Left before this activity"
  } -ExpectedStatus 201 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/workflow/$($sessionA.id)/steps/$($step1.id)/students/$($students.d.id)/exception" -Token $teacherAToken -Body @{
    remark = "Needs individual follow-up"
  } -ExpectedStatus 201 | Out-Null

  Write-Step "Case 4: all eligible students handled means the class step is checked"
  $batchStep1 = Invoke-Api -Method "POST" -Path "/teacher/workflow/$($sessionA.id)/steps/$($step1.id)/batch-complete" -Token $teacherAToken -Body @{} -ExpectedStatus 201
  Assert-True ($batchStep1.Body.data.checked -eq $true) "Case 4 did not synchronize WorkflowStep.checked"
  $sessionA = Get-IsolatedSession -Token $teacherAToken -ClassId $classA.Body.data.id
  $step1View = Get-StepFromSession -Session $sessionA -StepId $step1.id
  Assert-True ($step1View.studentSummary.pending -eq 0) "Case 4 left an eligible student pending"
  Assert-True ($step1View.studentSummary.completed -eq 5) "Case 4 completed count is incorrect"
  Assert-True ($step1View.studentSummary.skipped -eq 1) "Case 4 skipped count is incorrect"
  Assert-True ($step1View.studentSummary.exception -eq 1) "Case 4 exception count is incorrect"
  Assert-True ($step1View.studentSummary.absent -eq 1) "Case 4 did not dynamically expose absence"

  Write-Step "Cases 13-16: personal image policy and selected-student batch completion"
  $step2APath = "/teacher/workflow/$($sessionA.id)/steps/$($step2.id)/students/$($students.a.id)/complete"
  Invoke-Api -Method "POST" -Path $step2APath -Token $teacherAToken -Body @{
    photoUrls = @($ownerWorkflowAsset.Body.data.url)
  } -ExpectedStatus 201 | Out-Null
  $step2BPath = "/teacher/workflow/$($sessionA.id)/steps/$($step2.id)/students/$($students.b.id)/complete"
  Invoke-Api -Method "POST" -Path $step2BPath -Token $teacherAToken -Body @{
    photoUrls = @($foreignWorkflowAsset.Body.data.url)
  } -ExpectedStatus 400 | Out-Null
  Invoke-Api -Method "POST" -Path $step2BPath -Token $teacherAToken -Body @{
    photoUrls = @($ownerMessageAsset.Body.data.url)
  } -ExpectedStatus 400 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/workflow/$($sessionA.id)/steps/$($step2.id)/batch-complete" -Token $teacherAToken -Body @{
    studentIds = @($students.b.id, $students.f.id)
  } -ExpectedStatus 201 | Out-Null
  $sessionA = Get-IsolatedSession -Token $teacherAToken -ClassId $classA.Body.data.id
  $step2View = Get-StepFromSession -Session $sessionA -StepId $step2.id
  Assert-True ((Get-StudentFromStep -Step $step2View -StudentId $students.b.id).status -eq "completed") "Case 16 did not complete the first selected student"
  Assert-True ((Get-StudentFromStep -Step $step2View -StudentId $students.f.id).status -eq "completed") "Case 16 did not complete the second selected student"

  Write-Step "Cases 17-18: batch atomicity and preservation of handled states"
  Invoke-Api -Method "POST" -Path "/teacher/workflow/$($sessionA.id)/steps/$($step3.id)/batch-complete" -Token $teacherAToken -Body @{
    studentIds = @($students.a.id, $foreignStudent.Body.data.id)
  } -ExpectedStatus 400 | Out-Null
  $sessionA = Get-IsolatedSession -Token $teacherAToken -ClassId $classA.Body.data.id
  $step3View = Get-StepFromSession -Session $sessionA -StepId $step3.id
  Assert-True ((Get-StudentFromStep -Step $step3View -StudentId $students.a.id).status -eq "pending") "Case 17 partially updated a valid student"

  Invoke-Api -Method "POST" -Path "/teacher/workflow/$($sessionA.id)/steps/$($step3.id)/students/$($students.c.id)/skip" -Token $teacherAToken -Body @{
    remark = "Preserve this skipped state"
  } -ExpectedStatus 201 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/workflow/$($sessionA.id)/steps/$($step3.id)/students/$($students.d.id)/exception" -Token $teacherAToken -Body @{
    remark = "Preserve this exception state"
  } -ExpectedStatus 201 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/workflow/$($sessionA.id)/steps/$($step3.id)/batch-complete" -Token $teacherAToken -Body @{} -ExpectedStatus 201 | Out-Null
  $sessionA = Get-IsolatedSession -Token $teacherAToken -ClassId $classA.Body.data.id
  $step3View = Get-StepFromSession -Session $sessionA -StepId $step3.id
  Assert-True ((Get-StudentFromStep -Step $step3View -StudentId $students.c.id).status -eq "skipped") "Case 18 overwrote skipped status"
  Assert-True ((Get-StudentFromStep -Step $step3View -StudentId $students.d.id).status -eq "exception") "Case 18 overwrote exception status"
  Assert-True ($step3View.checked -eq $true) "Case 18 did not finish the class step"

  Write-Step "Cases 19-20: preserving the old check API and class requirePhoto policy"
  $legacyCheck = Invoke-Api -Method "POST" -Path "/teacher/workflow/$($sessionA.id)/steps/$($step4.id)/check" -Token $teacherAToken -Body @{} -ExpectedStatus 201
  Assert-True ($legacyCheck.Body.data.checked -eq $true) "Case 19 old check API no longer batch-completes pending students"
  Invoke-Api -Method "POST" -Path "/teacher/workflow/$($sessionA.id)/steps/$($photoStep.id)/check" -Token $teacherAToken -Body @{} -ExpectedStatus 400 | Out-Null
  $legacyPhotoCheck = Invoke-Api -Method "POST" -Path "/teacher/workflow/$($sessionA.id)/steps/$($photoStep.id)/check" -Token $teacherAToken -Body @{
    photoUrls = @($ownerWorkflowAsset.Body.data.url)
  } -ExpectedStatus 201
  Assert-True ($legacyPhotoCheck.Body.data.checked -eq $true) "Case 20 valid class photo did not complete the requirePhoto step"
  Assert-True (@($legacyPhotoCheck.Body.data.photoUrls).Count -eq 1) "Case 20 did not retain the class-level photo"

  Write-Step "Cases 21-22: parent ownership and safe workflow timeline"
  $parentWorkflow = Invoke-Api -Method "GET" -Path "/parent/children/$($students.a.id)/workflow/today" -Token $parentAToken
  Assert-True ($parentWorkflow.Body.data.student.id -eq $students.a.id) "Case 21 returned the wrong child"
  $parentStep1 = @($parentWorkflow.Body.data.timeline | Where-Object {
    $_.stepKey -eq $step1.stepKey
  }) | Select-Object -First 1
  Assert-True ($parentStep1.effectiveStatus -eq "completed") "Case 21 omitted the child's completed workflow fact"
  Assert-True ($parentStep1.remark -eq "Individual completion proof") "Case 21 omitted the teacher remark"
  Assert-True (@($parentStep1.photoUrls).Count -eq 1) "Case 21 omitted the personal photo"
  Assert-True ($null -eq $parentWorkflow.Body.data.PSObject.Properties["sessionId"]) "Case 21 exposed an internal workflow session ID"
  Assert-True ($null -eq $parentStep1.PSObject.Properties["workflowStepId"]) "Case 21 exposed an internal workflow step ID"
  Assert-True ($null -eq $parentStep1.PSObject.Properties["status"]) "Case 21 exposed the raw persisted status"
  Assert-True ($null -eq $parentStep1.teacher.PSObject.Properties["id"]) "Case 21 exposed an internal teacher ID"
  $parentWorkflowJson = $parentWorkflow.Body | ConvertTo-Json -Depth 20
  Assert-True (-not $parentWorkflowJson.Contains($students.b.name)) "Case 21 leaked another student's data"
  Assert-True (-not $parentWorkflowJson.Contains('storageKey')) "Case 21 exposed internal FileAsset metadata"
  Invoke-Api -Method "GET" -Path "/parent/children/$($foreignStudent.Body.data.id)/workflow/today" -Token $parentAToken -ExpectedStatus 404 | Out-Null

  Write-Step "Checking the read-only admin student workflow query"
  $adminWorkflow = Invoke-Api -Method "GET" -Path "/admin/business/student-workflows?classId=$($classA.Body.data.id)&studentId=$($students.a.id)&pageSize=50" -Token $adminToken
  Assert-True ($adminWorkflow.Body.data.total -eq 1) "Admin student workflow query did not isolate one student-day"
  Assert-True (@($adminWorkflow.Body.data.items[0].steps).Count -eq @($sessionA.steps).Count) "Admin student workflow detail omitted steps"
  $wideRangeStart = (Get-Date).AddDays(-31).ToString("yyyy-MM-dd")
  $wideRangeEnd = (Get-Date).ToString("yyyy-MM-dd")
  Invoke-Api -Method "GET" -Path "/admin/business/student-workflows?from=$wideRangeStart&to=$wideRangeEnd" -Token $adminToken -ExpectedStatus 400 | Out-Null

  Write-Step "Case 23: normal workflow operations no longer create GrowthRecord rows"
  $growthAfter = Invoke-Api -Method "GET" -Path "/admin/business/growth-records?classId=$($classA.Body.data.id)&type=workflow&pageSize=50" -Token $adminToken
  Assert-True ($growthAfter.Body.data.total -eq $growthBefore.Body.data.total) "Case 23 created false workflow GrowthRecord rows"

  Write-Step "Case 24: teacher dashboard unchecked count matches synchronized class steps"
  $sessionA = Get-IsolatedSession -Token $teacherAToken -ClassId $classA.Body.data.id
  $expectedUnchecked = @($sessionA.steps | Where-Object { -not $_.checked }).Count
  $dashboard = Invoke-Api -Method "GET" -Path "/teacher/dashboard" -Token $teacherAToken
  Assert-True ($dashboard.Body.data.workflow.uncheckedStepCount -eq $expectedUnchecked) "Case 24 dashboard uncheckedStepCount is inconsistent"

  Write-Host "Student workflow API verification passed (Cases 1-24 plus privacy and query-boundary checks)."
} finally {
  Disable-VerificationData
}
