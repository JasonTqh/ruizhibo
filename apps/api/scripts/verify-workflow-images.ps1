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

$teacherId = $null
$otherTeacherId = $null
$classId = $null
$adminToken = ""

function Remove-VerificationData {
  if (-not $adminToken) { return }

  if ($classId) {
    try {
      Invoke-Api -Method "DELETE" -Path "/admin/classes/$classId`?force=true" -Token $adminToken | Out-Null
    } catch {
      Write-Warning "Could not remove workflow verification class: $($_.Exception.Message)"
    }
  }

  foreach ($id in @($teacherId, $otherTeacherId)) {
    if (-not $id) { continue }
    try {
      Invoke-Api -Method "PATCH" -Path "/admin/teachers/$id" -Token $adminToken -Body @{
        status = "disabled"
      } | Out-Null
      Invoke-Api -Method "DELETE" -Path "/admin/teachers/$id`?force=true" -Token $adminToken | Out-Null
    } catch {
      Write-Warning "Could not remove workflow verification teacher $id`: $($_.Exception.Message)"
    }
  }
}

try {
  Write-Step "Logging in as administrator and creating isolated workflow data"
  $adminLogin = Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
    role = "admin"
    phone = $AdminPhone
  } -ExpectedStatus 201
  $adminToken = $adminLogin.Body.data.token

  $classes = Invoke-Api -Method "GET" -Path "/admin/classes" -Token $adminToken
  Assert-True (@($classes.Body.data).Count -ge 1) "A seeded campus/class is required"
  $campusId = $classes.Body.data[0].campusId
  $suffix = Get-Date -Format "MMddHHmmss"
  $phoneSuffix = Get-Date -Format "HHmmss"
  $teacherPhone = "13990$phoneSuffix"
  $otherTeacherPhone = "13991$phoneSuffix"

  $teacher = Invoke-Api -Method "POST" -Path "/admin/teachers" -Token $adminToken -Body @{
    name = "verify-workflow-owner-$suffix"
    phone = $teacherPhone
  } -ExpectedStatus 201
  $teacherId = $teacher.Body.data.id

  $otherTeacher = Invoke-Api -Method "POST" -Path "/admin/teachers" -Token $adminToken -Body @{
    name = "verify-workflow-foreign-$suffix"
    phone = $otherTeacherPhone
  } -ExpectedStatus 201
  $otherTeacherId = $otherTeacher.Body.data.id

  $class = Invoke-Api -Method "POST" -Path "/admin/classes" -Token $adminToken -Body @{
    campusId = $campusId
    name = "verify-workflow-class-$suffix"
    teacherId = $teacherId
  } -ExpectedStatus 201
  $classId = $class.Body.data.id

  $teacherLogin = Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
    role = "teacher"
    phone = $teacherPhone
  } -ExpectedStatus 201
  $teacherToken = $teacherLogin.Body.data.token
  $otherTeacherLogin = Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
    role = "teacher"
    phone = $otherTeacherPhone
  } -ExpectedStatus 201
  $otherTeacherToken = $otherTeacherLogin.Body.data.token

  $workflow = Invoke-Api -Method "GET" -Path "/teacher/workflow/today" -Token $teacherToken
  $session = @($workflow.Body.data | Where-Object { $_.class.id -eq $classId }) | Select-Object -First 1
  Assert-True ($null -ne $session) "Isolated workflow session was not created"
  $step = @($session.steps) | Select-Object -First 1
  Assert-True ($null -ne $step) "Isolated workflow session has no step"

  $pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
  $ownerWorkflowAsset = Invoke-Api -Method "POST" -Path "/files" -Token $teacherToken -Body @{
    fileName = "workflow-owner.png"
    mimeType = "image/png"
    base64 = $pngBase64
    size = 68
    scene = "workflow"
  } -ExpectedStatus 201
  $ownerMessageAsset = Invoke-Api -Method "POST" -Path "/files" -Token $teacherToken -Body @{
    fileName = "workflow-message-scene.png"
    mimeType = "image/png"
    base64 = $pngBase64
    size = 68
    scene = "message"
  } -ExpectedStatus 201
  $ownerHomeworkAsset = Invoke-Api -Method "POST" -Path "/files" -Token $teacherToken -Body @{
    fileName = "workflow-homework-scene.png"
    mimeType = "image/png"
    base64 = $pngBase64
    size = 68
    scene = "homework"
  } -ExpectedStatus 201
  $foreignWorkflowAsset = Invoke-Api -Method "POST" -Path "/files" -Token $otherTeacherToken -Body @{
    fileName = "workflow-foreign.png"
    mimeType = "image/png"
    base64 = $pngBase64
    size = 68
    scene = "workflow"
  } -ExpectedStatus 201

  $checkPath = "/teacher/workflow/$($session.id)/steps/$($step.id)/check"
  $invalidCases = @(
    @{ Label = "message scene"; Url = $ownerMessageAsset.Body.data.url },
    @{ Label = "homework scene"; Url = $ownerHomeworkAsset.Body.data.url },
    @{ Label = "other teacher workflow file"; Url = $foreignWorkflowAsset.Body.data.url },
    @{ Label = "missing FileAsset"; Url = "/uploads/workflow/missing-$suffix.png" }
  )

  foreach ($case in $invalidCases) {
    Write-Step "Rejecting $($case.Label)"
    $response = Invoke-Api -Method "POST" -Path $checkPath -Token $teacherToken -Body @{
      photoUrls = @($case.Url)
    } -ExpectedStatus 400
    Assert-True ($response.Body.error.code -eq "BAD_REQUEST") "$($case.Label) did not return BAD_REQUEST"
    Assert-True ([string]$response.Body.error.message -match "workflow") "$($case.Label) returned an unclear error"
  }

  Write-Step "Accepting the current teacher workflow asset"
  $checked = Invoke-Api -Method "POST" -Path $checkPath -Token $teacherToken -Body @{
    photoUrls = @($ownerWorkflowAsset.Body.data.url)
  } -ExpectedStatus 201
  Assert-True ($checked.Body.data.checked -eq $true) "Valid workflow image did not complete the step"
  Assert-True (@($checked.Body.data.photoUrls).Count -eq 1) "Valid workflow image was not saved"
  Assert-True ($checked.Body.data.photoUrls[0] -eq $ownerWorkflowAsset.Body.data.url) "Saved workflow image URL changed"

  Write-Host "Workflow image API verification passed."
} finally {
  Remove-VerificationData
}
