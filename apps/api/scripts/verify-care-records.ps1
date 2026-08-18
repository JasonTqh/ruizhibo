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

function Disable-VerificationData {
  if (-not $adminToken) { return }
  foreach ($studentId in $createdStudents) {
    try {
      Invoke-Api -Method "PATCH" -Path "/admin/students/$studentId" -Token $adminToken -Body @{
        status = "inactive"
      } | Out-Null
    } catch {
      Write-Warning "Could not deactivate care verification student $studentId`: $($_.Exception.Message)"
    }
  }
  foreach ($parentId in $createdParents) {
    try {
      Invoke-Api -Method "PATCH" -Path "/admin/parents/$parentId" -Token $adminToken -Body @{
        status = "disabled"
      } | Out-Null
    } catch {
      Write-Warning "Could not disable care verification parent $parentId`: $($_.Exception.Message)"
    }
  }
  foreach ($teacherId in $createdTeachers) {
    try {
      Invoke-Api -Method "PATCH" -Path "/admin/teachers/$teacherId" -Token $adminToken -Body @{
        status = "disabled"
      } | Out-Null
    } catch {
      Write-Warning "Could not disable care verification teacher $teacherId`: $($_.Exception.Message)"
    }
  }
}

function Find-TeacherStudent {
  param($TeacherToday, [string]$ClassId, [string]$StudentId)
  $classView = @($TeacherToday.Body.data.classes | Where-Object { $_.id -eq $ClassId }) | Select-Object -First 1
  Assert-True ($null -ne $classView) "Care class was not returned"
  $student = @($classView.students | Where-Object { $_.id -eq $StudentId }) | Select-Object -First 1
  Assert-True ($null -ne $student) "Care student was not returned"
  return $student
}

try {
  Write-Step "Creating isolated CP-35 care verification data"
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
    name = "verify-care-teacher-a-$suffix"
    phone = New-Phone "138"
  } -ExpectedStatus 201
  $teacherB = Invoke-Api -Method "POST" -Path "/admin/teachers" -Token $adminToken -Body @{
    name = "verify-care-teacher-b-$suffix"
    phone = New-Phone "137"
  } -ExpectedStatus 201
  $createdTeachers += $teacherA.Body.data.id
  $createdTeachers += $teacherB.Body.data.id

  $parentA = Invoke-Api -Method "POST" -Path "/admin/parents" -Token $adminToken -Body @{
    name = "verify-care-parent-a-$suffix"
    phone = New-Phone "136"
  } -ExpectedStatus 201
  $parentB = Invoke-Api -Method "POST" -Path "/admin/parents" -Token $adminToken -Body @{
    name = "verify-care-parent-b-$suffix"
    phone = New-Phone "135"
  } -ExpectedStatus 201
  $createdParents += $parentA.Body.data.id
  $createdParents += $parentB.Body.data.id

  $classA = Invoke-Api -Method "POST" -Path "/admin/classes" -Token $adminToken -Body @{
    campusId = $campusId
    name = "verify-care-class-a-$suffix"
    teacherId = $teacherA.Body.data.id
  } -ExpectedStatus 201
  $classB = Invoke-Api -Method "POST" -Path "/admin/classes" -Token $adminToken -Body @{
    campusId = $campusId
    name = "verify-care-class-b-$suffix"
    teacherId = $teacherB.Body.data.id
  } -ExpectedStatus 201

  $students = @{}
  foreach ($label in @("main", "batch-a", "batch-b", "exception-meal", "batch-new", "absent", "inactive", "detail", "atomic", "history", "checkout")) {
    $student = Invoke-Api -Method "POST" -Path "/admin/students" -Token $adminToken -Body @{
      classId = $classA.Body.data.id
      name = "verify-care-$label-$suffix"
    } -ExpectedStatus 201
    $students[$label] = $student.Body.data
    $createdStudents += $student.Body.data.id
  }
  $foreignStudent = Invoke-Api -Method "POST" -Path "/admin/students" -Token $adminToken -Body @{
    classId = $classB.Body.data.id
    name = "verify-care-foreign-$suffix"
  } -ExpectedStatus 201
  $createdStudents += $foreignStudent.Body.data.id

  Invoke-Api -Method "POST" -Path "/admin/students/$($students.main.id)/guardians" -Token $adminToken -Body @{
    parentId = $parentA.Body.data.id
    relation = "mother"
    isPrimary = $true
  } -ExpectedStatus 201 | Out-Null
  Invoke-Api -Method "POST" -Path "/admin/students/$($students.detail.id)/guardians" -Token $adminToken -Body @{
    parentId = $parentA.Body.data.id
    relation = "mother"
  } -ExpectedStatus 201 | Out-Null
  Invoke-Api -Method "POST" -Path "/admin/students/$($foreignStudent.Body.data.id)/guardians" -Token $adminToken -Body @{
    parentId = $parentB.Body.data.id
    relation = "father"
    isPrimary = $true
  } -ExpectedStatus 201 | Out-Null

  Invoke-Api -Method "PATCH" -Path "/admin/students/$($students.inactive.id)" -Token $adminToken -Body @{
    status = "inactive"
  } | Out-Null

  $teacherAToken = (Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
    role = "teacher"
    phone = $teacherA.Body.data.phone
  } -ExpectedStatus 201).Body.data.token
  $teacherBToken = (Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
    role = "teacher"
    phone = $teacherB.Body.data.phone
  } -ExpectedStatus 201).Body.data.token
  $parentAToken = (Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
    role = "parent"
    phone = $parentA.Body.data.phone
  } -ExpectedStatus 201).Body.data.token

  $fixtureOutput = & pnpm exec tsx "$PSScriptRoot/care-verification-fixture.ts" create-absence $students.absent.id $teacherA.Body.data.id 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Could not create care absence fixture: $fixtureOutput" }

  $growthBefore = Invoke-Api -Method "GET" -Path "/admin/business/growth-records?classId=$($classA.Body.data.id)&pageSize=50" -Token $adminToken
  $pickupBefore = Invoke-Api -Method "GET" -Path "/admin/business/pickup-records?classId=$($classA.Body.data.id)&pageSize=50" -Token $adminToken
  $workflowBefore = Invoke-Api -Method "GET" -Path "/admin/business/workflows?classId=$($classA.Body.data.id)&pageSize=50" -Token $adminToken

  Write-Step "Cases 1-7: single meal validation, ownership and same-day update"
  $meal = Invoke-Api -Method "POST" -Path "/teacher/students/$($students.main.id)/care-records/meal" -Token $teacherAToken -Body @{
    slot = "dinner"
    value = "normal"
  } -ExpectedStatus 201
  Assert-True ($meal.Body.data.value -eq "normal") "Case 1 did not create dinner normal"
  Invoke-Api -Method "POST" -Path "/teacher/students/$($foreignStudent.Body.data.id)/care-records/meal" -Token $teacherAToken -Body @{
    slot = "dinner"
    value = "normal"
  } -ExpectedStatus 404 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/students/$($students.inactive.id)/care-records/water" -Token $teacherAToken -Body @{} -ExpectedStatus 404 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/students/$($students.absent.id)/care-records/water" -Token $teacherAToken -Body @{} -ExpectedStatus 409 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/students/$($students.main.id)/care-records/meal" -Token $teacherAToken -Body @{
    value = "normal"
  } -ExpectedStatus 400 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/students/$($students.main.id)/care-records/meal" -Token $teacherAToken -Body @{
    slot = "dinner"
    value = "too_much"
  } -ExpectedStatus 400 | Out-Null
  $updatedMeal = Invoke-Api -Method "POST" -Path "/teacher/students/$($students.main.id)/care-records/meal" -Token $teacherAToken -Body @{
    slot = "dinner"
    value = "little"
  } -ExpectedStatus 201
  Assert-True ($updatedMeal.Body.data.id -eq $meal.Body.data.id) "Case 7 created a duplicate meal instead of updating"
  Assert-True ($updatedMeal.Body.data.value -eq "little") "Case 7 did not update the meal value"

  Write-Step "Cases 8-10: atomic batch meal and exception preservation"
  $batch = Invoke-Api -Method "POST" -Path "/teacher/care/meal/batch" -Token $teacherAToken -Body @{
    classId = $classA.Body.data.id
    slot = "dinner"
    value = "normal"
    studentIds = @($students.'batch-a'.id, $students.'batch-b'.id)
  } -ExpectedStatus 201
  Assert-True ($batch.Body.data.created -eq 2) "Case 8 did not create all batch meal rows"
  Invoke-Api -Method "POST" -Path "/teacher/care/meal/batch" -Token $teacherAToken -Body @{
    classId = $classA.Body.data.id
    slot = "snack"
    value = "normal"
    studentIds = @($students.atomic.id, $foreignStudent.Body.data.id)
  } -ExpectedStatus 404 | Out-Null
  $afterAtomic = Invoke-Api -Method "GET" -Path "/teacher/care/today" -Token $teacherAToken
  $atomicView = Find-TeacherStudent $afterAtomic $classA.Body.data.id $students.atomic.id
  Assert-True ($null -eq $atomicView.care.meal.snack) "Case 9 partially wrote an invalid batch"

  Invoke-Api -Method "POST" -Path "/teacher/students/$($students.'exception-meal'.id)/care-records/meal" -Token $teacherAToken -Body @{
    slot = "dinner"
    value = "refused"
  } -ExpectedStatus 201 | Out-Null
  $preserveBatch = Invoke-Api -Method "POST" -Path "/teacher/care/meal/batch" -Token $teacherAToken -Body @{
    classId = $classA.Body.data.id
    slot = "dinner"
    value = "normal"
    studentIds = @($students.'exception-meal'.id, $students.'batch-new'.id)
  } -ExpectedStatus 201
  Assert-True ($preserveBatch.Body.data.created -eq 1) "Case 10 did not create the pending student"
  Assert-True ($preserveBatch.Body.data.preserved -eq 1) "Case 10 did not preserve the exception meal"
  $afterPreserve = Invoke-Api -Method "GET" -Path "/teacher/care/today" -Token $teacherAToken
  $exceptionMealView = Find-TeacherStudent $afterPreserve $classA.Body.data.id $students.'exception-meal'.id
  Assert-True ($exceptionMealView.care.meal.dinner.value -eq "refused") "Case 10 overwrote refused with normal"

  Write-Step "Cases 11-17: water, rest, mood and attention exception"
  Invoke-Api -Method "POST" -Path "/teacher/students/$($students.detail.id)/care-records/water" -Token $teacherAToken -Body @{} -ExpectedStatus 201 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/students/$($students.detail.id)/care-records/water" -Token $teacherAToken -Body @{} -ExpectedStatus 201 | Out-Null
  $rest = Invoke-Api -Method "POST" -Path "/teacher/students/$($students.detail.id)/care-records/rest" -Token $teacherAToken -Body @{
    value = "slept"
    durationMinutes = 40
  } -ExpectedStatus 201
  Assert-True ($rest.Body.data.durationMinutes -eq 40) "Case 13 did not persist rest duration"
  Invoke-Api -Method "POST" -Path "/teacher/students/$($students.detail.id)/care-records/rest" -Token $teacherAToken -Body @{
    value = "slept"
    durationMinutes = 999
  } -ExpectedStatus 400 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/students/$($students.detail.id)/care-records/mood" -Token $teacherAToken -Body @{
    value = "good"
  } -ExpectedStatus 201 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/students/$($students.detail.id)/care-records/exception" -Token $teacherAToken -Body @{
    needsAttention = $true
  } -ExpectedStatus 400 | Out-Null
  $attentionException = Invoke-Api -Method "POST" -Path "/teacher/students/$($students.detail.id)/care-records/exception" -Token $teacherAToken -Body @{
    category = "physical"
    needsAttention = $true
    remark = "孩子表示轻微头疼"
    resolution = "已安排休息并联系家长"
  } -ExpectedStatus 201

  Write-Step "Cases 18-20: care image ownership and scene isolation"
  $pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
  $ownerCareAsset = Invoke-Api -Method "POST" -Path "/files" -Token $teacherAToken -Body @{
    fileName = "care-owner.png"
    mimeType = "image/png"
    base64 = $pngBase64
    scene = "care"
  } -ExpectedStatus 201
  $foreignCareAsset = Invoke-Api -Method "POST" -Path "/files" -Token $teacherBToken -Body @{
    fileName = "care-foreign.png"
    mimeType = "image/png"
    base64 = $pngBase64
    scene = "care"
  } -ExpectedStatus 201
  $workflowAsset = Invoke-Api -Method "POST" -Path "/files" -Token $teacherAToken -Body @{
    fileName = "care-workflow.png"
    mimeType = "image/png"
    base64 = $pngBase64
    scene = "workflow"
  } -ExpectedStatus 201
  $messageAsset = Invoke-Api -Method "POST" -Path "/files" -Token $teacherAToken -Body @{
    fileName = "care-message.png"
    mimeType = "image/png"
    base64 = $pngBase64
    scene = "message"
  } -ExpectedStatus 201
  $homeworkAsset = Invoke-Api -Method "POST" -Path "/files" -Token $teacherAToken -Body @{
    fileName = "care-homework.png"
    mimeType = "image/png"
    base64 = $pngBase64
    scene = "homework"
  } -ExpectedStatus 201
  $photoException = Invoke-Api -Method "POST" -Path "/teacher/students/$($students.detail.id)/care-records/exception" -Token $teacherAToken -Body @{
    category = "other"
    needsAttention = $false
    remark = "生活照护照片验证"
    photoUrls = @($ownerCareAsset.Body.data.url)
  } -ExpectedStatus 201
  Assert-True (@($photoException.Body.data.photoUrls).Count -eq 1) "Case 18 did not persist the care image"
  foreach ($invalidUrl in @($foreignCareAsset.Body.data.url, $workflowAsset.Body.data.url, $messageAsset.Body.data.url, $homeworkAsset.Body.data.url)) {
    Invoke-Api -Method "POST" -Path "/teacher/students/$($students.detail.id)/care-records/exception" -Token $teacherAToken -Body @{
      category = "other"
      needsAttention = $false
      remark = "invalid care image"
      photoUrls = @($invalidUrl)
    } -ExpectedStatus 400 | Out-Null
  }

  Write-Step "Cases 21-23: parent isolation, aggregation and safe projection"
  $parentCare = Invoke-Api -Method "GET" -Path "/parent/children/$($students.detail.id)/care/today" -Token $parentAToken
  Assert-True ($parentCare.Body.data.water.count -eq 2) "Case 12 parent water count is incorrect"
  Assert-True ($parentCare.Body.data.rest.durationMinutes -eq 40) "Case 21 omitted the rest summary"
  Assert-True (@($parentCare.Body.data.exceptions | Where-Object { $_.id -eq $attentionException.Body.data.id }).Count -eq 1) "Case 17 parent cannot read attention exception"
  Invoke-Api -Method "GET" -Path "/parent/children/$($foreignStudent.Body.data.id)/care/today" -Token $parentAToken -ExpectedStatus 404 | Out-Null
  foreach ($forbiddenField in @("ownerId", "storageKey", "storageDriver", "mimeType", '"scene"')) {
    Assert-True (-not $parentCare.Raw.Contains($forbiddenField)) "Case 23 exposed internal FileAsset field $forbiddenField"
  }

  Write-Step "Cases 24-27: bounded admin query and attention filters"
  $historical = Invoke-Api -Method "POST" -Path "/teacher/students/$($students.history.id)/care-records/mood" -Token $teacherAToken -Body @{
    value = "normal"
  } -ExpectedStatus 201
  $fixtureOutput = & pnpm exec tsx "$PSScriptRoot/care-verification-fixture.ts" backdate-record $historical.Body.data.id 40 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Could not backdate care fixture: $fixtureOutput" }
  $adminDefault = Invoke-Api -Method "GET" -Path "/admin/business/care-records?classId=$($classA.Body.data.id)&pageSize=50" -Token $adminToken
  $today = (Invoke-Api -Method "GET" -Path "/teacher/care/today" -Token $teacherAToken).Body.data.date
  Assert-True (@($adminDefault.Body.data.items | Where-Object { $_.id -eq $historical.Body.data.id }).Count -eq 0) "Case 24 default admin query returned historical data"
  Assert-True (@($adminDefault.Body.data.items | Where-Object { ([string]$_.serviceDate).Substring(0, 10) -ne $today }).Count -eq 0) "Case 24 returned a non-today record"
  $from = ([DateTime]::ParseExact($today, "yyyy-MM-dd", $null)).AddDays(-40).ToString("yyyy-MM-dd")
  Invoke-Api -Method "GET" -Path "/admin/business/care-records?from=$from&to=$today" -Token $adminToken -ExpectedStatus 400 | Out-Null
  $todayExceptions = Invoke-Api -Method "GET" -Path "/admin/business/care-records?classId=$($classA.Body.data.id)&quickFilter=today_exception&pageSize=50" -Token $adminToken
  Assert-True (@($todayExceptions.Body.data.items).Count -ge 2) "Case 26 did not return today's exceptions"
  Assert-True (@($todayExceptions.Body.data.items | Where-Object { $_.type -ne "exception" }).Count -eq 0) "Case 26 returned a non-exception record"
  $attentionItems = Invoke-Api -Method "GET" -Path "/admin/business/care-records?classId=$($classA.Body.data.id)&needsAttention=true&pageSize=50" -Token $adminToken
  Assert-True (@($attentionItems.Body.data.items | Where-Object { -not $_.needsAttention }).Count -eq 0) "Case 27 returned a record that does not need attention"
  Assert-True (@($attentionItems.Body.data.items | Where-Object { $_.id -eq $attentionException.Body.data.id }).Count -eq 1) "Case 27 omitted the attention exception"

  Write-Step "Cases 28-30: care facts remain separate from growth, pickup and workflow"
  $growthAfter = Invoke-Api -Method "GET" -Path "/admin/business/growth-records?classId=$($classA.Body.data.id)&pageSize=50" -Token $adminToken
  $pickupAfter = Invoke-Api -Method "GET" -Path "/admin/business/pickup-records?classId=$($classA.Body.data.id)&pageSize=50" -Token $adminToken
  $workflowAfter = Invoke-Api -Method "GET" -Path "/admin/business/workflows?classId=$($classA.Body.data.id)&pageSize=50" -Token $adminToken
  Assert-True ($growthAfter.Body.data.total -eq $growthBefore.Body.data.total) "Cases 28-29 created GrowthRecord rows"
  Assert-True ($pickupAfter.Body.data.total -eq $pickupBefore.Body.data.total) "Case 30 changed PickupRecord rows"
  Assert-True ($workflowAfter.Body.data.total -eq $workflowBefore.Body.data.total) "Case 30 changed WorkflowSession rows"

  Write-Step "Cases 31-32: checkout boundary uses happenedAt for exceptions"
  Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($students.checkout.id)/arrived" -Token $teacherAToken -Body @{
    arrivalMethod = "self_arrived"
  } -ExpectedStatus 201 | Out-Null
  $checkout = Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($students.checkout.id)/left" -Token $teacherAToken -Body @{
    status = "temporary_authorization"
    temporaryName = "CP-35.1 test pickup"
    temporaryRelationship = "other"
    temporaryPhone = "13800000000"
    resolution = "verification only"
  } -ExpectedStatus 201
  $checkoutAt = [DateTimeOffset]::Parse([string]$checkout.Body.data.happenedAt)
  $afterCheckout = $checkoutAt.AddSeconds(1).ToString("o")
  $beforeCheckout = $checkoutAt.AddSeconds(-1).ToString("o")

  Invoke-Api -Method "POST" -Path "/teacher/students/$($students.checkout.id)/care-records/exception" -Token $teacherAToken -Body @{
    happenedAt = $afterCheckout
    needsAttention = $true
    remark = "Exception after checkout must be rejected"
  } -ExpectedStatus 409 | Out-Null

  $historicalException = Invoke-Api -Method "POST" -Path "/teacher/students/$($students.checkout.id)/care-records/exception" -Token $teacherAToken -Body @{
    happenedAt = $beforeCheckout
    needsAttention = $true
    remark = "Historical exception before checkout is allowed"
  } -ExpectedStatus 201
  $historicalHappenedAt = [DateTimeOffset]::Parse([string]$historicalException.Body.data.happenedAt)
  Assert-True ($historicalHappenedAt -lt $checkoutAt) "Case 32 did not preserve the historical happenedAt"

  Write-Host "Care record API verification passed (Cases 1-32, including checkout boundary, file policy, privacy and query boundaries)."
} finally {
  Disable-VerificationData
}
