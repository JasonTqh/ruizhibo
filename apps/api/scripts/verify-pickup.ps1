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
      Write-Warning "Could not deactivate pickup verification student $studentId`: $($_.Exception.Message)"
    }
  }
  foreach ($parentId in $createdParents) {
    try {
      Invoke-Api -Method "PATCH" -Path "/admin/parents/$parentId" -Token $adminToken -Body @{
        status = "disabled"
      } | Out-Null
    } catch {
      Write-Warning "Could not disable pickup verification parent $parentId`: $($_.Exception.Message)"
    }
  }
  foreach ($teacherId in $createdTeachers) {
    try {
      Invoke-Api -Method "PATCH" -Path "/admin/teachers/$teacherId" -Token $adminToken -Body @{
        status = "disabled"
      } | Out-Null
    } catch {
      Write-Warning "Could not disable pickup verification teacher $teacherId`: $($_.Exception.Message)"
    }
  }
}

try {
  Write-Step "Creating isolated safe-pickup verification data"
  $adminLogin = Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
    role = "admin"
    phone = $AdminPhone
  } -ExpectedStatus 201
  $adminToken = $adminLogin.Body.data.token

  $classes = Invoke-Api -Method "GET" -Path "/admin/classes" -Token $adminToken
  Assert-True (@($classes.Body.data).Count -ge 1) "A seeded campus is required"
  $campusId = $classes.Body.data[0].campusId
  $suffix = Get-Date -Format "MMddHHmmssfff"
  $phoneTail = Get-Random -Minimum 10000000 -Maximum 99999999

  $teacherA = Invoke-Api -Method "POST" -Path "/admin/teachers" -Token $adminToken -Body @{
    name = "verify-pickup-teacher-a-$suffix"
    phone = "138$phoneTail"
  } -ExpectedStatus 201
  $createdTeachers += $teacherA.Body.data.id
  $phoneTail = Get-Random -Minimum 10000000 -Maximum 99999999
  $teacherB = Invoke-Api -Method "POST" -Path "/admin/teachers" -Token $adminToken -Body @{
    name = "verify-pickup-teacher-b-$suffix"
    phone = "137$phoneTail"
  } -ExpectedStatus 201
  $createdTeachers += $teacherB.Body.data.id

  $phoneTail = Get-Random -Minimum 10000000 -Maximum 99999999
  $parentA = Invoke-Api -Method "POST" -Path "/admin/parents" -Token $adminToken -Body @{
    name = "verify-pickup-parent-a-$suffix"
    phone = "136$phoneTail"
  } -ExpectedStatus 201
  $createdParents += $parentA.Body.data.id
  $phoneTail = Get-Random -Minimum 10000000 -Maximum 99999999
  $parentB = Invoke-Api -Method "POST" -Path "/admin/parents" -Token $adminToken -Body @{
    name = "verify-pickup-parent-b-$suffix"
    phone = "135$phoneTail"
  } -ExpectedStatus 201
  $createdParents += $parentB.Body.data.id

  $classA = Invoke-Api -Method "POST" -Path "/admin/classes" -Token $adminToken -Body @{
    campusId = $campusId
    name = "verify-pickup-class-a-$suffix"
    teacherId = $teacherA.Body.data.id
  } -ExpectedStatus 201
  $classB = Invoke-Api -Method "POST" -Path "/admin/classes" -Token $adminToken -Body @{
    campusId = $campusId
    name = "verify-pickup-class-b-$suffix"
    teacherId = $teacherB.Body.data.id
  } -ExpectedStatus 201

  $normalStudent = Invoke-Api -Method "POST" -Path "/admin/students" -Token $adminToken -Body @{
    classId = $classA.Body.data.id
    name = "verify-pickup-normal-$suffix"
  } -ExpectedStatus 201
  $createdStudents += $normalStudent.Body.data.id
  $temporaryStudent = Invoke-Api -Method "POST" -Path "/admin/students" -Token $adminToken -Body @{
    classId = $classA.Body.data.id
    name = "verify-pickup-temporary-$suffix"
  } -ExpectedStatus 201
  $createdStudents += $temporaryStudent.Body.data.id
  $foreignStudent = Invoke-Api -Method "POST" -Path "/admin/students" -Token $adminToken -Body @{
    classId = $classB.Body.data.id
    name = "verify-pickup-foreign-$suffix"
  } -ExpectedStatus 201
  $createdStudents += $foreignStudent.Body.data.id
  $guardianStudent = Invoke-Api -Method "POST" -Path "/admin/students" -Token $adminToken -Body @{
    classId = $classA.Body.data.id
    name = "verify-pickup-guardian-$suffix"
  } -ExpectedStatus 201
  $createdStudents += $guardianStudent.Body.data.id
  $absentStudent = Invoke-Api -Method "POST" -Path "/admin/students" -Token $adminToken -Body @{
    classId = $classA.Body.data.id
    name = "verify-pickup-absent-$suffix"
  } -ExpectedStatus 201
  $createdStudents += $absentStudent.Body.data.id
  $batchStudentA = Invoke-Api -Method "POST" -Path "/admin/students" -Token $adminToken -Body @{
    classId = $classA.Body.data.id
    name = "verify-pickup-batch-a-$suffix"
  } -ExpectedStatus 201
  $createdStudents += $batchStudentA.Body.data.id
  $batchStudentB = Invoke-Api -Method "POST" -Path "/admin/students" -Token $adminToken -Body @{
    classId = $classA.Body.data.id
    name = "verify-pickup-batch-b-$suffix"
  } -ExpectedStatus 201
  $createdStudents += $batchStudentB.Body.data.id
  $unauthorizedStudent = Invoke-Api -Method "POST" -Path "/admin/students" -Token $adminToken -Body @{
    classId = $classA.Body.data.id
    name = "verify-pickup-unauthorized-$suffix"
  } -ExpectedStatus 201
  $createdStudents += $unauthorizedStudent.Body.data.id
  $pickupThenAbsenceStudent = Invoke-Api -Method "POST" -Path "/admin/students" -Token $adminToken -Body @{
    classId = $classA.Body.data.id
    name = "verify-pickup-before-absence-$suffix"
  } -ExpectedStatus 201
  $createdStudents += $pickupThenAbsenceStudent.Body.data.id
  $legacyConflictStudent = Invoke-Api -Method "POST" -Path "/admin/students" -Token $adminToken -Body @{
    classId = $classA.Body.data.id
    name = "verify-pickup-legacy-conflict-$suffix"
  } -ExpectedStatus 201
  $createdStudents += $legacyConflictStudent.Body.data.id

  $guardianA = Invoke-Api -Method "POST" -Path "/admin/students/$($normalStudent.Body.data.id)/guardians" -Token $adminToken -Body @{
    parentId = $parentA.Body.data.id
    relation = "mother"
    isPrimary = $true
    canPickup = $true
  } -ExpectedStatus 201
  Invoke-Api -Method "POST" -Path "/admin/students/$($temporaryStudent.Body.data.id)/guardians" -Token $adminToken -Body @{
    parentId = $parentA.Body.data.id
    relation = "mother"
    canPickup = $true
  } -ExpectedStatus 201 | Out-Null
  Invoke-Api -Method "POST" -Path "/admin/students/$($foreignStudent.Body.data.id)/guardians" -Token $adminToken -Body @{
    parentId = $parentB.Body.data.id
    relation = "father"
    canPickup = $true
  } -ExpectedStatus 201 | Out-Null
  $guardianForDelete = Invoke-Api -Method "POST" -Path "/admin/students/$($guardianStudent.Body.data.id)/guardians" -Token $adminToken -Body @{
    parentId = $parentA.Body.data.id
    relation = "father"
    canPickup = $true
  } -ExpectedStatus 201
  Invoke-Api -Method "POST" -Path "/admin/students/$($absentStudent.Body.data.id)/guardians" -Token $adminToken -Body @{
    parentId = $parentA.Body.data.id
    relation = "father"
    canPickup = $true
  } -ExpectedStatus 201 | Out-Null
  $unauthorizedGuardian = Invoke-Api -Method "POST" -Path "/admin/students/$($unauthorizedStudent.Body.data.id)/guardians" -Token $adminToken -Body @{
    parentId = $parentA.Body.data.id
    relation = "father"
  } -ExpectedStatus 201
  Assert-True ($unauthorizedGuardian.Body.data.canPickup -eq $false) "Guardian without explicit pickup permission was authorized by default"

  $authorized = Invoke-Api -Method "POST" -Path "/admin/students/$($normalStudent.Body.data.id)/pickup-persons" -Token $adminToken -Body @{
    name = "verify-grandfather-$suffix"
    relationship = "grandfather"
    phone = "13800000003"
    isActive = $true
  } -ExpectedStatus 201
  $inactive = Invoke-Api -Method "POST" -Path "/admin/students/$($temporaryStudent.Body.data.id)/pickup-persons" -Token $adminToken -Body @{
    name = "verify-inactive-$suffix"
    relationship = "relative"
    phone = "13800000004"
    isActive = $false
  } -ExpectedStatus 201

  $teacherALogin = Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
    role = "teacher"
    phone = $teacherA.Body.data.phone
  } -ExpectedStatus 201
  $teacherAToken = $teacherALogin.Body.data.token
  $parentALogin = Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
    role = "parent"
    phone = $parentA.Body.data.phone
  } -ExpectedStatus 201
  $parentAToken = $parentALogin.Body.data.token

  Write-Step "A-B: guardian pickup requires explicit authorization"
  $authorizationToday = Invoke-Api -Method "GET" -Path "/teacher/pickup/today" -Token $teacherAToken
  $unauthorizedToday = @($authorizationToday.Body.data.classes.students | Where-Object { $_.id -eq $unauthorizedStudent.Body.data.id }) | Select-Object -First 1
  Assert-True (@($unauthorizedToday.pickupPeople | Where-Object { $_.id -eq $unauthorizedGuardian.Body.data.id }).Count -eq 0) "Unauthorized guardian appeared as a normal pickup person"
  Assert-True (@($unauthorizedToday.deliveryPeople | Where-Object { $_.id -eq $unauthorizedGuardian.Body.data.id }).Count -eq 1) "Active guardian should remain available as a delivery person"
  Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($unauthorizedStudent.Body.data.id)/arrived" -Token $teacherAToken -Body @{
    arrivalMethod = "self_arrived"
  } -ExpectedStatus 201 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($unauthorizedStudent.Body.data.id)/left" -Token $teacherAToken -Body @{
    status = "normal"
    pickupPersonType = "guardian"
    pickupPersonId = $unauthorizedGuardian.Body.data.id
  } -ExpectedStatus 400 | Out-Null
  $authorizedGuardian = Invoke-Api -Method "PATCH" -Path "/admin/students/$($unauthorizedStudent.Body.data.id)/guardians/$($unauthorizedGuardian.Body.data.id)" -Token $adminToken -Body @{
    canPickup = $true
  }
  Assert-True ($authorizedGuardian.Body.data.canPickup -eq $true) "Administrator could not explicitly authorize guardian pickup"
  $authorizedGuardianLeft = Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($unauthorizedStudent.Body.data.id)/left" -Token $teacherAToken -Body @{
    status = "normal"
    pickupPersonType = "guardian"
    pickupPersonId = $unauthorizedGuardian.Body.data.id
  } -ExpectedStatus 201
  Assert-True ($authorizedGuardianLeft.Body.data.studentGuardianId -eq $unauthorizedGuardian.Body.data.id) "Explicitly authorized guardian could not complete normal checkout"

  Write-Step "C: absence blocks school pickup and remains consistent across views"
  $fixtureOutput = & pnpm exec tsx "$PSScriptRoot/pickup-verification-fixture.ts" create-absence $absentStudent.Body.data.id $teacherA.Body.data.id
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create isolated pickup absence fixture: $fixtureOutput"
  }
  $absentToday = Invoke-Api -Method "GET" -Path "/teacher/pickup/today" -Token $teacherAToken
  $teacherAbsentStudent = @($absentToday.Body.data.classes.students | Where-Object { $_.id -eq $absentStudent.Body.data.id }) | Select-Object -First 1
  Assert-True ($teacherAbsentStudent.status -eq "absent") "Teacher pickup view did not show the absence"
  $parentAbsentToday = Invoke-Api -Method "GET" -Path "/parent/children/$($absentStudent.Body.data.id)/pickup/today" -Token $parentAToken
  Assert-True ($parentAbsentToday.Body.data.status -eq "absent") "Parent pickup view did not show the absence"
  Assert-True ($parentAbsentToday.Body.data.absenceRemark -eq "Pickup verification absence") "Parent pickup view omitted the absence remark"
  $adminAbsentMissing = Invoke-Api -Method "GET" -Path "/admin/business/pickup-records?quickFilter=missing_arrival_today&studentId=$($absentStudent.Body.data.id)" -Token $adminToken
  Assert-True ($adminAbsentMissing.Body.data.total -eq 0) "Absent student appeared in admin missing-arrival results"
  Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($absentStudent.Body.data.id)/picked-up" -Token $teacherAToken -Body @{} -ExpectedStatus 409 | Out-Null

  Write-Step "D: pickup activity blocks a later absence write"
  Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($pickupThenAbsenceStudent.Body.data.id)/picked-up" -Token $teacherAToken -Body @{} -ExpectedStatus 201 | Out-Null
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $blockedAbsenceOutput = (& pnpm exec tsx "$PSScriptRoot/pickup-verification-fixture.ts" create-absence $pickupThenAbsenceStudent.Body.data.id $teacherA.Body.data.id 2>&1 | Out-String)
    $blockedAbsenceExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  Assert-True ($blockedAbsenceExitCode -ne 0) "Attendance absence was written after pickup activity started"
  Assert-True ($blockedAbsenceOutput -match "ATTENDANCE_PICKUP_CONFLICT") "Rejected absence did not report the pickup consistency conflict"

  Write-Step "E-F: legacy conflict blocks single and atomic batch arrival"
  Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($legacyConflictStudent.Body.data.id)/picked-up" -Token $teacherAToken -Body @{} -ExpectedStatus 201 | Out-Null
  $previousConflictFixtureFlag = $env:PICKUP_VERIFICATION_ALLOW_CONFLICT_FIXTURE
  try {
    $env:PICKUP_VERIFICATION_ALLOW_CONFLICT_FIXTURE = "1"
    $legacyConflictOutput = & pnpm exec tsx "$PSScriptRoot/pickup-verification-fixture.ts" create-conflicting-absence $legacyConflictStudent.Body.data.id $teacherA.Body.data.id
    if ($LASTEXITCODE -ne 0) {
      throw "Could not create isolated pre-CP-33.1 conflict fixture: $legacyConflictOutput"
    }
  } finally {
    if ($null -eq $previousConflictFixtureFlag) {
      Remove-Item Env:PICKUP_VERIFICATION_ALLOW_CONFLICT_FIXTURE -ErrorAction SilentlyContinue
    } else {
      $env:PICKUP_VERIFICATION_ALLOW_CONFLICT_FIXTURE = $previousConflictFixtureFlag
    }
  }
  Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($legacyConflictStudent.Body.data.id)/arrived" -Token $teacherAToken -Body @{
    arrivalMethod = "teacher_pickup"
  } -ExpectedStatus 409 | Out-Null
  $consistencyBatchIds = @($legacyConflictStudent.Body.data.id, $pickupThenAbsenceStudent.Body.data.id)
  Invoke-Api -Method "POST" -Path "/teacher/pickup/batch/arrived" -Token $teacherAToken -Body @{
    studentIds = $consistencyBatchIds
  } -ExpectedStatus 409 | Out-Null
  $consistencyToday = Invoke-Api -Method "GET" -Path "/teacher/pickup/today" -Token $teacherAToken
  $consistencyStudents = @($consistencyToday.Body.data.classes.students | Where-Object { $_.id -in $consistencyBatchIds })
  Assert-True ($consistencyStudents.Count -eq 2) "Consistency batch students were not returned"
  Assert-True (@($consistencyStudents | Where-Object { $_.status -ne "picked_up" }).Count -eq 0) "Failed consistency batch partially advanced a student"
  Assert-True (@($consistencyStudents.events | Where-Object { $_.type -eq "arrived_at_center" }).Count -eq 0) "Failed consistency batch created an arrival fact"

  Write-Step "1-4: normal school pickup, arrival, authorized checkout and parent read"
  $today = Invoke-Api -Method "GET" -Path "/teacher/pickup/today" -Token $teacherAToken
  $normalToday = @($today.Body.data.classes.students | Where-Object { $_.id -eq $normalStudent.Body.data.id }) | Select-Object -First 1
  Assert-True ($null -ne $normalToday) "Teacher today list omitted an owned student"
  Assert-True (@($normalToday.pickupPeople).Count -ge 2) "Guardian and fixed authorized pickup people were not returned"
  Assert-True (@($normalToday.deliveryPeople).Count -ge 2) "Available delivery people were not returned"

  $picked = Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($normalStudent.Body.data.id)/picked-up" -Token $teacherAToken -Body @{} -ExpectedStatus 201
  Assert-True ($picked.Body.data.type -eq "picked_up_from_school") "School pickup fact was not saved"
  $arrived = Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($normalStudent.Body.data.id)/arrived" -Token $teacherAToken -Body @{
    arrivalMethod = "teacher_pickup"
  } -ExpectedStatus 201
  Assert-True ($arrived.Body.data.type -eq "arrived_at_center") "Arrival fact was not saved"
  Assert-True (-not [string]::IsNullOrWhiteSpace([string]$arrived.Body.data.attendanceEventId)) "Arrival did not link AttendanceEvent"

  Write-Step "9: duplicate arrival is rejected without a duplicate fact"
  Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($normalStudent.Body.data.id)/arrived" -Token $teacherAToken -Body @{
    arrivalMethod = "teacher_pickup"
  } -ExpectedStatus 409 | Out-Null

  $left = Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($normalStudent.Body.data.id)/left" -Token $teacherAToken -Body @{
    status = "normal"
    pickupPersonType = "authorized_person"
    pickupPersonId = $authorized.Body.data.id
  } -ExpectedStatus 201
  Assert-True ($left.Body.data.type -eq "left_center") "Checkout fact was not saved"
  Assert-True ($left.Body.data.pickupPersonNameSnapshot -eq $authorized.Body.data.name) "Authorized pickup snapshot was not saved"
  Assert-True (-not [string]::IsNullOrWhiteSpace([string]$left.Body.data.attendanceEventId)) "Checkout did not link AttendanceEvent"

  Write-Step "10: duplicate checkout is rejected without a duplicate fact"
  Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($normalStudent.Body.data.id)/left" -Token $teacherAToken -Body @{
    status = "normal"
    pickupPersonType = "guardian"
    pickupPersonId = $guardianA.Body.data.id
  } -ExpectedStatus 409 | Out-Null

  $parentToday = Invoke-Api -Method "GET" -Path "/parent/children/$($normalStudent.Body.data.id)/pickup/today" -Token $parentAToken
  Assert-True ($parentToday.Body.data.status -eq "left") "Parent today status did not reach left"
  Assert-True (@($parentToday.Body.data.events).Count -eq 3) "Parent did not receive the complete three-event chain"
  $parentHistory = Invoke-Api -Method "GET" -Path "/parent/children/$($normalStudent.Body.data.id)/pickup-records" -Token $parentAToken
  Assert-True (@($parentHistory.Body.data.items).Count -eq 3) "Parent pickup history is incomplete"

  $guardianArrival = Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($guardianStudent.Body.data.id)/arrived" -Token $teacherAToken -Body @{
    arrivalMethod = "parent_delivered"
    deliveryPersonType = "guardian"
    deliveryPersonId = $guardianForDelete.Body.data.id
  } -ExpectedStatus 201
  Assert-True ($guardianArrival.Body.data.type -eq "arrived_at_center") "Guardian handoff student did not arrive"
  Assert-True ($guardianArrival.Body.data.studentGuardianId -eq $guardianForDelete.Body.data.id) "Specific delivery guardian was not linked"
  Assert-True ($guardianArrival.Body.data.pickupPersonNameSnapshot -eq $parentA.Body.data.name) "Delivery-person snapshot was not saved"
  $guardianParentToday = Invoke-Api -Method "GET" -Path "/parent/children/$($guardianStudent.Body.data.id)/pickup/today" -Token $parentAToken
  $guardianArrivalForParent = @($guardianParentToday.Body.data.events | Where-Object { $_.id -eq $guardianArrival.Body.data.id }) | Select-Object -First 1
  Assert-True ($guardianArrivalForParent.teacher.name -eq $teacherA.Body.data.name) "Parent pickup status omitted the handling teacher"
  Assert-True ($guardianArrivalForParent.pickupPersonNameSnapshot -eq $parentA.Body.data.name) "Parent pickup status omitted the delivery-person fact"
  $guardianLeft = Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($guardianStudent.Body.data.id)/left" -Token $teacherAToken -Body @{
    status = "normal"
    pickupPersonType = "guardian"
    pickupPersonId = $guardianForDelete.Body.data.id
  } -ExpectedStatus 201
  Assert-True ($guardianLeft.Body.data.studentGuardianId -eq $guardianForDelete.Body.data.id) "Guardian handoff was not linked"

  Write-Step "Batch school pickup and safe arrival are atomic and idempotent"
  $batchIds = @($batchStudentA.Body.data.id, $batchStudentB.Body.data.id)
  $batchPicked = Invoke-Api -Method "POST" -Path "/teacher/pickup/batch/picked-up" -Token $teacherAToken -Body @{
    studentIds = $batchIds
  } -ExpectedStatus 201
  Assert-True ($batchPicked.Body.data.count -eq 2) "Batch school pickup did not save both students"
  $batchArrived = Invoke-Api -Method "POST" -Path "/teacher/pickup/batch/arrived" -Token $teacherAToken -Body @{
    studentIds = $batchIds
  } -ExpectedStatus 201
  Assert-True ($batchArrived.Body.data.count -eq 2) "Batch safe arrival did not save both students"
  Invoke-Api -Method "POST" -Path "/teacher/pickup/batch/arrived" -Token $teacherAToken -Body @{
    studentIds = $batchIds
  } -ExpectedStatus 409 | Out-Null
  $batchToday = Invoke-Api -Method "GET" -Path "/teacher/pickup/today" -Token $teacherAToken
  $batchInCare = @($batchToday.Body.data.classes.students | Where-Object { $_.id -in $batchIds -and $_.status -eq "in_care" })
  Assert-True ($batchInCare.Count -eq 2) "Teacher today view did not refresh both batch students to in-care"

  Write-Step "5-8: teacher/parent isolation, inactive authorization and invalid student"
  Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($foreignStudent.Body.data.id)/picked-up" -Token $teacherAToken -Body @{} -ExpectedStatus 404 | Out-Null
  Invoke-Api -Method "GET" -Path "/parent/children/$($foreignStudent.Body.data.id)/pickup-records" -Token $parentAToken -ExpectedStatus 404 | Out-Null
  Invoke-Api -Method "POST" -Path "/teacher/pickup/students/not-a-student/picked-up" -Token $teacherAToken -Body @{} -ExpectedStatus 404 | Out-Null

  Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($temporaryStudent.Body.data.id)/arrived" -Token $teacherAToken -Body @{
    arrivalMethod = "parent_delivered"
    deliveryPersonType = "guardian"
    deliveryPersonId = $guardianForDelete.Body.data.id
  } -ExpectedStatus 400 | Out-Null

  $directArrival = Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($temporaryStudent.Body.data.id)/arrived" -Token $teacherAToken -Body @{
    arrivalMethod = "parent_delivered"
  } -ExpectedStatus 201
  Assert-True ($directArrival.Body.data.arrivalMethod -eq "parent_delivered") "Direct parent arrival method was not preserved"
  Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($temporaryStudent.Body.data.id)/left" -Token $teacherAToken -Body @{
    status = "normal"
    pickupPersonType = "authorized_person"
    pickupPersonId = $inactive.Body.data.id
  } -ExpectedStatus 400 | Out-Null

  Write-Step "11-12: temporary handoff is explicit and visible to parent/admin"
  $temporaryLeft = Invoke-Api -Method "POST" -Path "/teacher/pickup/students/$($temporaryStudent.Body.data.id)/left" -Token $teacherAToken -Body @{
    status = "temporary_authorization"
    temporaryName = "temporary-pickup-$suffix"
    temporaryRelationship = "relative"
    temporaryPhone = "13800000005"
    exceptionReason = "Temporary family authorization"
    resolution = "Primary guardian confirmed by phone"
  } -ExpectedStatus 201
  Assert-True ($temporaryLeft.Body.data.isException -eq $true) "Temporary handoff was not marked exceptional"
  Assert-True ($temporaryLeft.Body.data.status -eq "temporary_authorization") "Temporary handoff status was not preserved"

  $parentTemporary = Invoke-Api -Method "GET" -Path "/parent/children/$($temporaryStudent.Body.data.id)/pickup-records" -Token $parentAToken
  $parentException = @($parentTemporary.Body.data.items | Where-Object { $_.id -eq $temporaryLeft.Body.data.id }) | Select-Object -First 1
  Assert-True ($parentException.isException -eq $true) "Parent history hid the exceptional handoff"
  Assert-True (-not [string]::IsNullOrWhiteSpace([string]$parentException.resolution)) "Parent history omitted the resolution"

  $adminExceptions = Invoke-Api -Method "GET" -Path "/admin/business/pickup-records?quickFilter=exception&studentId=$($temporaryStudent.Body.data.id)" -Token $adminToken
  $adminException = @($adminExceptions.Body.data.items | Where-Object { $_.id -eq $temporaryLeft.Body.data.id }) | Select-Object -First 1
  Assert-True ($null -ne $adminException) "Admin exception filter omitted the temporary handoff"

  Write-Step "13-14: AttendanceEvent arrival and leave compatibility"
  $attendance = Invoke-Api -Method "GET" -Path "/parent/children/$($normalStudent.Body.data.id)/attendance" -Token $parentAToken
  $arriveAttendance = @($attendance.Body.data | Where-Object { $_.id -eq $arrived.Body.data.attendanceEventId }) | Select-Object -First 1
  $leaveAttendance = @($attendance.Body.data | Where-Object { $_.id -eq $left.Body.data.attendanceEventId }) | Select-Object -First 1
  Assert-True ($arriveAttendance.type -eq "arrive") "Arrival AttendanceEvent is missing"
  Assert-True ($leaveAttendance.type -eq "leave") "Leave AttendanceEvent is missing"

  $normalAdminRecords = Invoke-Api -Method "GET" -Path "/admin/business/pickup-records?studentId=$($normalStudent.Body.data.id)" -Token $adminToken
  Assert-True ($normalAdminRecords.Body.data.total -eq 3) "Admin pickup record query did not return the full chain"
  Assert-True ($normalAdminRecords.Body.data.items[0].class.name -eq $classA.Body.data.name) "Admin pickup record omitted the root class snapshot"
  $missingLeave = Invoke-Api -Method "GET" -Path "/admin/business/pickup-records?quickFilter=missing_leave_today&classId=$($classA.Body.data.id)" -Token $adminToken
  $missingLeaveItems = @($missingLeave.Body.data.items)
  Assert-True ($missingLeaveItems.Count -eq 2) "Admin missing-leave filter did not isolate the two batch arrivals"
  Assert-True (@($missingLeaveItems | Where-Object { $_.id -eq "missing-leave:$($batchStudentA.Body.data.id)" }).Count -eq 1) "First batch student was omitted from missing-leave results"
  Assert-True (@($missingLeaveItems | Where-Object { $_.id -eq "missing-leave:$($batchStudentB.Body.data.id)" }).Count -eq 1) "Second batch student was omitted from missing-leave results"
  Assert-True (@($missingLeaveItems | Where-Object { $null -ne $_.happenedAt }).Count -eq 0) "Missing-record placeholders exposed a fake event time"

  Write-Step "Immutable pickup history blocks destructive master-data deletion"
  Invoke-Api -Method "PATCH" -Path "/admin/students/$($normalStudent.Body.data.id)" -Token $adminToken -Body @{
    status = "inactive"
  } | Out-Null
  Invoke-Api -Method "PATCH" -Path "/admin/teachers/$($teacherA.Body.data.id)" -Token $adminToken -Body @{
    status = "disabled"
  } | Out-Null
  Invoke-Api -Method "PATCH" -Path "/admin/parents/$($parentA.Body.data.id)" -Token $adminToken -Body @{
    status = "disabled"
  } | Out-Null
  Invoke-Api -Method "DELETE" -Path "/admin/students/$($normalStudent.Body.data.id)?force=true" -Token $adminToken -ExpectedStatus 409 | Out-Null
  Invoke-Api -Method "DELETE" -Path "/admin/teachers/$($teacherA.Body.data.id)?force=true" -Token $adminToken -ExpectedStatus 409 | Out-Null
  Invoke-Api -Method "DELETE" -Path "/admin/parents/$($parentA.Body.data.id)?force=true" -Token $adminToken -ExpectedStatus 409 | Out-Null
  Invoke-Api -Method "DELETE" -Path "/admin/classes/$($classA.Body.data.id)?force=true" -Token $adminToken -ExpectedStatus 409 | Out-Null

  Write-Host "Safe pickup API verification passed (explicit guardian authorization, bidirectional absence consistency, legacy-conflict, atomic batch, delivery-person, admin and immutable-history guards)."
} finally {
  Disable-VerificationData
}
