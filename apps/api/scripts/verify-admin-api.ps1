param(
  [string]$BaseUrl = "http://localhost:3000/api",
  [string]$AdminPhone = "13800000000",
  [string]$TeacherPhone = "13800000001",
  [switch]$IncludeWrites
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "[verify] $Message"
}

function Read-ErrorContent {
  param($ErrorRecord)

  if ($ErrorRecord.ErrorDetails -and $ErrorRecord.ErrorDetails.Message) {
    return $ErrorRecord.ErrorDetails.Message
  }

  $response = $ErrorRecord.Exception.Response
  if ($response -and $response.GetResponseStream) {
    $stream = $response.GetResponseStream()
    if ($stream) {
      $reader = New-Object System.IO.StreamReader($stream)
      return $reader.ReadToEnd()
    }
  }

  return ""
}

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    [object]$Body = $null,
    [string]$Token = "",
    [int]$ExpectedStatus = 200
  )

  $headers = @{}
  if ($Token) {
    $headers["Authorization"] = "Bearer $Token"
  }

  $request = @{
    Uri = "$BaseUrl$Path"
    Method = $Method
    Headers = $headers
    UseBasicParsing = $true
    TimeoutSec = 10
  }

  if ($null -ne $Body) {
    $request["ContentType"] = "application/json"
    $request["Body"] = ($Body | ConvertTo-Json -Depth 10 -Compress)
  }

  try {
    $response = Invoke-WebRequest @request
    $status = [int]$response.StatusCode
    $content = $response.Content
  } catch {
    $status = [int]$_.Exception.Response.StatusCode
    $content = Read-ErrorContent $_
  }

  if ($status -ne $ExpectedStatus) {
    throw "Expected $Method $Path to return $ExpectedStatus, got $status. Body: $content"
  }

  $parsed = $null
  if ($content) {
    $parsed = $content | ConvertFrom-Json
  }

  return @{
    Status = $status
    Body = $parsed
    Raw = $content
  }
}

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

Write-Step "Checking health endpoint at $BaseUrl"
Invoke-Api -Method "GET" -Path "/health" | Out-Null

Write-Step "Logging in as admin"
$adminLogin = Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
  role = "admin"
  phone = $AdminPhone
} -ExpectedStatus 201
$adminToken = $adminLogin.Body.data.token
Assert-True ($adminToken.Length -gt 0) "Admin login did not return a token"

Write-Step "Logging in as teacher"
$teacherLogin = Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
  role = "teacher"
  phone = $TeacherPhone
} -ExpectedStatus 201
$teacherToken = $teacherLogin.Body.data.token
Assert-True ($teacherToken.Length -gt 0) "Teacher login did not return a token"

Write-Step "Checking GET /me"
$me = Invoke-Api -Method "GET" -Path "/me" -Token $adminToken
Assert-True ($me.Body.data.role -eq "admin") "GET /me did not return the admin user"

Write-Step "Checking admin read endpoints"
$teachers = Invoke-Api -Method "GET" -Path "/admin/teachers" -Token $adminToken
$classes = Invoke-Api -Method "GET" -Path "/admin/classes" -Token $adminToken
$students = Invoke-Api -Method "GET" -Path "/admin/students" -Token $adminToken
Assert-True ($teachers.Body.data.Count -ge 1) "Expected at least one teacher from seed data"
Assert-True ($classes.Body.data.Count -ge 1) "Expected at least one class from seed data"
Assert-True ($students.Body.data.Count -ge 1) "Expected at least one student from seed data"

Write-Step "Checking role and auth errors"
$forbidden = Invoke-Api -Method "GET" -Path "/admin/teachers" -Token $teacherToken -ExpectedStatus 403
Assert-True ($forbidden.Body.error.code -eq "FORBIDDEN") "Expected FORBIDDEN error code"

$unauthorized = Invoke-Api -Method "GET" -Path "/admin/teachers" -ExpectedStatus 401
Assert-True ($unauthorized.Body.error.code -eq "UNAUTHORIZED") "Expected UNAUTHORIZED error code"

$badRequest = Invoke-Api -Method "POST" -Path "/admin/teachers" -Token $adminToken -Body @{
  name = ""
  phone = "123"
} -ExpectedStatus 400
Assert-True ($badRequest.Body.error.code -eq "BAD_REQUEST") "Expected BAD_REQUEST error code"

if ($IncludeWrites) {
  Write-Step "Running write verification"
  $suffix = Get-Date -Format "MMddHHmmss"
  $phoneSuffix = Get-Date -Format "HHmmss"
  $campusId = $classes.Body.data[0].campusId

  $createdTeacher = Invoke-Api -Method "POST" -Path "/admin/teachers" -Token $adminToken -Body @{
    name = "verify-teacher-$suffix"
    phone = "13999$phoneSuffix"
  } -ExpectedStatus 201
  $teacherId = $createdTeacher.Body.data.id

  $updatedTeacher = Invoke-Api -Method "PATCH" -Path "/admin/teachers/$teacherId" -Token $adminToken -Body @{
    name = "verify-teacher-$suffix-updated"
    status = "disabled"
  }
  Assert-True ($updatedTeacher.Body.data.status -eq "disabled") "Teacher update did not persist"

  $createdClass = Invoke-Api -Method "POST" -Path "/admin/classes" -Token $adminToken -Body @{
    campusId = $campusId
    name = "verify-class-$suffix"
    teacherId = $teacherId
  } -ExpectedStatus 201
  $classId = $createdClass.Body.data.id

  $createdStudent = Invoke-Api -Method "POST" -Path "/admin/students" -Token $adminToken -Body @{
    classId = $classId
    name = "verify-student-$suffix"
    gender = "female"
  } -ExpectedStatus 201
  $studentId = $createdStudent.Body.data.id

  $updatedStudent = Invoke-Api -Method "PATCH" -Path "/admin/students/$studentId" -Token $adminToken -Body @{
    status = "inactive"
  }
  Assert-True ($updatedStudent.Body.data.status -eq "inactive") "Student update did not persist"

  $guardian = Invoke-Api -Method "POST" -Path "/admin/students/$studentId/guardians" -Token $adminToken -Body @{
    parentName = "verify-parent-$suffix"
    parentPhone = "13799$phoneSuffix"
    relation = "mother"
  } -ExpectedStatus 201
  $guardianId = $guardian.Body.data.id

  Invoke-Api -Method "DELETE" -Path "/admin/students/$studentId/guardians/$guardianId" -Token $adminToken | Out-Null
}

Write-Host "Admin API verification passed."
