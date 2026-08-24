param(
  [string]$BaseUrl = "http://localhost:3000/api",
  [string]$AdminPhone = "13800000000",
  [string]$TeacherPhone = "13800000001",
  [string]$ParentPhone = "13800000002",
  [string]$ReportPath = "tmp/dev-acceptance/latest.md",
  [switch]$PrepareDataOnly,
  [switch]$SkipStaticChecks,
  [switch]$SkipExtendedSuites,
  [switch]$KeepVerificationData
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiScriptRoot = Join-Path $repoRoot "apps/api/scripts"
$commonScript = Join-Path $apiScriptRoot "verify-api-common.ps1"
$fixtureScript = Join-Path $apiScriptRoot "prepare-dev-acceptance-fixture.ts"
$cleanupScript = Join-Path $apiScriptRoot "cleanup-dev-verification-data.ts"
$pnpm = (Get-Command "pnpm.cmd" -ErrorAction Stop).Source
$pwshCandidate = Join-Path $PSHOME "pwsh.exe"
$powershell = if (Test-Path -LiteralPath $pwshCandidate) {
  $pwshCandidate
} else {
  Join-Path $PSHOME "powershell.exe"
}

. $commonScript

$script:Results = [System.Collections.Generic.List[object]]::new()
$script:Fixture = $null
$script:PerformanceMs = $null

function Add-Result {
  param(
    [string]$Module,
    [ValidateSet("PASS", "FAIL", "PENDING")]
    [string]$Status,
    [long]$DurationMs,
    [string]$Detail
  )

  $script:Results.Add([pscustomobject]@{
      Module = $Module
      Status = $Status
      DurationMs = $DurationMs
      Detail = $Detail
    })
}

function Invoke-Check {
  param(
    [string]$Module,
    [scriptblock]$Action,
    [string]$SuccessDetail = "验证通过"
  )

  Write-Host ""
  Write-Host "[dev-acceptance] $Module"
  $timer = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    & $Action
    $timer.Stop()
    Add-Result -Module $Module -Status "PASS" -DurationMs $timer.ElapsedMilliseconds -Detail $SuccessDetail
    Write-Host "[PASS] $Module ($($timer.ElapsedMilliseconds) ms)"
    return $true
  } catch {
    $timer.Stop()
    $message = $_.Exception.Message
    Add-Result -Module $Module -Status "FAIL" -DurationMs $timer.ElapsedMilliseconds -Detail $message
    Write-Host "[FAIL] $Module - $message" -ForegroundColor Red
    return $false
  }
}

function Invoke-VerificationScript {
  param(
    [string]$FileName,
    [string[]]$Arguments
  )

  $path = Join-Path $apiScriptRoot $FileName
  Push-Location (Join-Path $repoRoot "apps/api")
  try {
    & $powershell -NoProfile -ExecutionPolicy Bypass -File $path @Arguments 2>&1 |
      ForEach-Object { Write-Host $_ }
    $exitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  if ($exitCode -ne 0) {
    throw "$FileName exited with code $exitCode"
  }
}

function Invoke-VerificationCleanup {
  Push-Location (Join-Path $repoRoot "apps/api")
  try {
    $output = & $pnpm exec tsx $cleanupScript --apply 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  if ($exitCode -ne 0) {
    throw "Verification cleanup failed: $(($output | Out-String).Trim())"
  }
  $jsonLine = @($output | ForEach-Object { [string]$_ } | Where-Object { $_.Trim().StartsWith("{") }) | Select-Object -Last 1
  if (-not $jsonLine) {
    throw "Verification cleanup did not return JSON"
  }
  $cleanup = $jsonLine | ConvertFrom-Json
  Write-Host "[cleanup] users=$($cleanup.deleted.users) classes=$($cleanup.deleted.classes) students=$($cleanup.deleted.students) files=$($cleanup.localFiles.removed)"
}

function Convert-MarkdownCell {
  param([object]$Value)
  if ($null -eq $Value) { return "" }
  return ([string]$Value).Replace("|", "\|").Replace("`r", " ").Replace("`n", " ")
}

function Write-Report {
  $target = if ([System.IO.Path]::IsPathRooted($ReportPath)) {
    $ReportPath
  } else {
    Join-Path $repoRoot $ReportPath
  }
  $directory = Split-Path -Parent $target
  if ($directory) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
  }

  $failed = @($script:Results | Where-Object { $_.Status -eq "FAIL" })
  $overall = if ($failed.Count -eq 0) { "AUTOMATED PASS / MANUAL PENDING" } else { "FAIL" }
  $lines = [System.Collections.Generic.List[string]]::new()
  $lines.Add("# 开发环境验收报告")
  $lines.Add("")
  $lines.Add("- 执行时间：$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')")
  $lines.Add("- API：$BaseUrl")
  $lines.Add("- 自动化结果：$overall")
  if ($null -ne $script:PerformanceMs) {
    $lines.Add("- 20 人日报接口：$($script:PerformanceMs) ms（门槛 < 3000 ms）")
  }
  $lines.Add("")
  $lines.Add("## 自动化结果")
  $lines.Add("")
  $lines.Add("| 模块 | 结果 | 耗时 | 说明 |")
  $lines.Add("|---|---:|---:|---|")
  foreach ($result in $script:Results) {
    $lines.Add("| $(Convert-MarkdownCell $result.Module) | $($result.Status) | $($result.DurationMs) ms | $(Convert-MarkdownCell $result.Detail) |")
  }

  $lines.Add("")
  $lines.Add("## 已准备的人工验收数据")
  $lines.Add("")
  if ($null -ne $script:Fixture) {
    $lines.Add("- 校区：$($script:Fixture.campus.name)")
    $lines.Add("- 教师：$($script:Fixture.teacher.name) / $($script:Fixture.teacher.phone)")
    $lines.Add("- 家长：$($script:Fixture.parent.name) / $($script:Fixture.parent.phone)")
    $lines.Add("- 班级：$($script:Fixture.classes.primary.name)（$($script:Fixture.classes.primary.activeStudentCount) 人）")
    $lines.Add("- 历史转班目标：$($script:Fixture.classes.historyTarget.name)")
    $lines.Add("")
    $lines.Add("| 学生 | 用途 |")
    $lines.Add("|---|---|")
    foreach ($student in $script:Fixture.students) {
      $lines.Add("| $($student.name) | $($student.purpose) |")
    }
  }

  $lines.Add("")
  $lines.Add("## 必须人工检查")
  $lines.Add("")
  $lines.Add("- 教师端 20 人列表首次可见、滚动流畅度和异常学生视觉突出程度。")
  $lines.Add("- 家长日报八个区块的视觉顺序、中文文案和时间显示。")
  $lines.Add("- 教师端与家长端图片的实际渲染、预览和失败态。")
  $lines.Add("- Admin 是否没有删除 PickupRecord 的入口；API 自动测试覆盖重复事实与权限隔离，但 UI 入口仍需观察。")
  $lines.Add("- 数据库单次请求的精确 SQL 查询条数；当前门禁验证 20 人由一个汇总接口返回并限制总耗时。")
  $lines.Add("- 微信登录、真机上传、合法域名和真实账号属于下一阶段，不纳入本地门禁。")

  [System.IO.File]::WriteAllLines(
    $target,
    $lines,
    [System.Text.UTF8Encoding]::new($false)
  )
  return $target
}

function Complete-Run {
  $report = Write-Report
  $failed = @($script:Results | Where-Object { $_.Status -eq "FAIL" })
  Write-Host ""
  Write-Host "[dev-acceptance] Report: $report"
  Write-Host "[dev-acceptance] PASS=$(@($script:Results | Where-Object { $_.Status -eq 'PASS' }).Count) FAIL=$($failed.Count)"
  if ($failed.Count -gt 0) { return 1 }
  return 0
}

$preflightOk = Invoke-Check -Module "环境、数据库与本地存储" -SuccessDetail "API、PostgreSQL 和 local storage 健康" -Action {
  $health = Invoke-Api -Method "GET" -Path "/health"
  Assert-True ($health.Body.data.status -eq "ok") "API health status is not ok"
  Assert-True ($health.Body.data.database -eq "ok") "PostgreSQL health check failed"
  Assert-True ($health.Body.data.fileStorage -eq "local") "FILE_STORAGE_DRIVER must be local"
}
if (-not $preflightOk) { exit (Complete-Run) }

$fixtureOk = Invoke-Check -Module "固定验收数据" -SuccessDetail "测试校区A、教师A、家长A、一年级测试班和 20 名学生已幂等准备" -Action {
  Push-Location (Join-Path $repoRoot "apps/api")
  try {
    $output = & $pnpm exec tsx $fixtureScript 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  if ($exitCode -ne 0) {
    throw "Fixture preparation failed: $(($output | Out-String).Trim())"
  }
  $jsonLine = @($output | ForEach-Object { [string]$_ } | Where-Object { $_.Trim().StartsWith("{") }) | Select-Object -Last 1
  if (-not $jsonLine) {
    throw "Fixture preparation did not return JSON"
  }
  $script:Fixture = $jsonLine | ConvertFrom-Json
  Assert-True ($script:Fixture.classes.primary.activeStudentCount -eq 20) "一年级测试班必须恰好包含 20 名启用学生"
  Assert-True (@($script:Fixture.workflowTemplate.steps).Count -eq 5) "开发验收流程必须包含 5 个步骤"
}
if (-not $fixtureOk) { exit (Complete-Run) }

$namedDataOk = Invoke-Check -Module "固定账号权限与 20 人接口" -SuccessDetail "教师班级隔离、家长学生隔离、无数据语义和 <3 秒门槛通过" -Action {
  $teacherLogin = Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
    role = "teacher"
    phone = $TeacherPhone
  } -ExpectedStatus 201
  $parentLogin = Invoke-Api -Method "POST" -Path "/auth/dev-login" -Body @{
    role = "parent"
    phone = $ParentPhone
  } -ExpectedStatus 201
  Assert-True ($teacherLogin.Body.data.user.name -eq "教师A") "Teacher account name is not 教师A"
  Assert-True ($parentLogin.Body.data.user.name -eq "家长A") "Parent account name is not 家长A"
  $teacherToken = $teacherLogin.Body.data.token
  $parentToken = $parentLogin.Body.data.token

  $classId = $script:Fixture.classes.primary.id
  $classStudents = Invoke-Api -Method "GET" -Path "/teacher/classes/$classId/students" -Token $teacherToken
  Assert-True (@($classStudents.Body.data).Count -eq 20) "教师A未获得一年级测试班的 20 名学生"

  $children = Invoke-Api -Method "GET" -Path "/parent/children" -Token $parentToken
  Assert-True ($children.Raw.Contains($script:Fixture.studentIds.student01)) "家长A未绑定学生01"
  Invoke-Api -Method "GET" -Path "/parent/students/$($script:Fixture.studentIds.student02)/daily-report" -Token $parentToken -ExpectedStatus 404 | Out-Null
  Invoke-Api -Method "GET" -Path "/teacher/daily-reports?classId=$($script:Fixture.classes.historyTarget.id)" -Token $teacherToken -ExpectedStatus 404 | Out-Null

  $noData = Invoke-Api -Method "GET" -Path "/teacher/students/$($script:Fixture.studentIds.student07)/daily-report" -Token $teacherToken
  Assert-True ($noData.Body.data.care.water.hasRecord -eq $false) "学生07无数据被错误解释为有记录"
  Assert-True ($null -eq $noData.Body.data.care.water.count) "学生07无饮水记录不能显示为 0 次"

  $timer = [System.Diagnostics.Stopwatch]::StartNew()
  $dailyReports = Invoke-Api -Method "GET" -Path "/teacher/daily-reports?classId=$classId" -Token $teacherToken
  $timer.Stop()
  $script:PerformanceMs = $timer.ElapsedMilliseconds
  Assert-True (@($dailyReports.Body.data.items).Count -eq 20) "教师日报汇总没有一次返回 20 名学生"
  Assert-True ($script:PerformanceMs -lt 3000) "20 人日报首次接口耗时 $($script:PerformanceMs) ms，超过 3000 ms"
}
if (-not $namedDataOk) { exit (Complete-Run) }

if ($PrepareDataOnly) {
  Write-Host "[dev-acceptance] PrepareDataOnly selected; extended suites were not run."
  if (-not $KeepVerificationData) {
    Invoke-Check -Module "清理自动验收隔离数据" -SuccessDetail "verify-* 临时账号、班级、学生及关联事实已删除" -Action {
      Invoke-VerificationCleanup
    } | Out-Null
  }
  exit (Complete-Run)
}

if (-not $SkipStaticChecks) {
  Invoke-Check -Module "全仓类型检查" -SuccessDetail "所有工作区 TypeScript 检查通过" -Action {
    Push-Location $repoRoot
    try {
      & $pnpm typecheck 2>&1 | ForEach-Object { Write-Host $_ }
      if ($LASTEXITCODE -ne 0) { throw "pnpm typecheck exited with code $LASTEXITCODE" }
    } finally {
      Pop-Location
    }
  } | Out-Null
}

$suites = @(
  @{
    Module = "登录与 Admin 基础权限"
    File = "verify-admin-api.ps1"
    Args = @("-BaseUrl", $BaseUrl, "-AdminPhone", $AdminPhone, "-TeacherPhone", $TeacherPhone)
    Detail = "Admin 登录、只读查询、角色拒绝和输入校验通过"
  },
  @{
    Module = "教师基础权限"
    File = "verify-teacher-api.ps1"
    Args = @("-BaseUrl", $BaseUrl, "-TeacherPhone", $TeacherPhone, "-ParentPhone", $ParentPhone)
    Detail = "教师班级、学生、日报和业务查询边界通过"
  },
  @{
    Module = "家长基础权限"
    File = "verify-parent-api.ps1"
    Args = @("-BaseUrl", $BaseUrl, "-ParentPhone", $ParentPhone, "-TeacherPhone", $TeacherPhone)
    Detail = "家长孩子、日报、作业和消息读取边界通过"
  }
)

if (-not $SkipExtendedSuites) {
  $suites += @(
    @{
      Module = "学校接送、安全到店与离店交接"
      File = "verify-pickup.ps1"
      Args = @("-BaseUrl", $BaseUrl, "-AdminPhone", $AdminPhone)
      Detail = "正常、直接到店、临时/异常、重复事实与跨班权限通过"
    },
    @{
      Module = "学生流程 CP-34"
      File = "verify-student-workflow.ps1"
      Args = @("-BaseUrl", $BaseUrl, "-AdminPhone", $AdminPhone)
      Detail = "完成、跳过、异常、批量原子性、图片归属与权限通过"
    },
    @{
      Module = "生活照护 CP-35"
      File = "verify-care-records.ps1"
      Args = @("-BaseUrl", $BaseUrl, "-AdminPhone", $AdminPhone)
      Detail = "餐食、饮水、午休、情绪、异常关注、图片与家长隔离通过"
    },
    @{
      Module = "日报、寄语、历史与一致性 CP-36"
      File = "verify-daily-report.ps1"
      Args = @("-BaseUrl", $BaseUrl, "-AdminPhone", $AdminPhone)
      Detail = "89 个日报用例：无数据、实时刷新、寄语、20 人、历史转班和污染隔离通过"
    },
    @{
      Module = "本地文件存储"
      File = "verify-storage-api.ps1"
      Args = @("-BaseUrl", $BaseUrl, "-AdminPhone", $AdminPhone, "-ExpectedDriver", "local")
      Detail = "local driver 上传、元数据与访问策略通过"
    },
    @{
      Module = "Workflow 图片权限"
      File = "verify-workflow-images.ps1"
      Args = @("-BaseUrl", $BaseUrl, "-AdminPhone", $AdminPhone)
      Detail = "个人图片可见、班级图片不泄漏、跨教师图片拒绝通过"
    },
    @{
      Module = "消息与 Care 图片权限"
      File = "verify-message-images.ps1"
      Args = @("-BaseUrl", $BaseUrl, "-TeacherPhone", $TeacherPhone, "-ParentPhone", $ParentPhone)
      Detail = "图片场景和会话参与者权限通过"
    }
  )
}

foreach ($suite in $suites) {
  $suiteFile = [string]$suite.File
  $suiteArgs = [string[]]$suite.Args
  Invoke-Check -Module ([string]$suite.Module) -SuccessDetail ([string]$suite.Detail) -Action {
    Invoke-VerificationScript -FileName $suiteFile -Arguments $suiteArgs
  } | Out-Null
}

if (-not $KeepVerificationData) {
  Invoke-Check -Module "清理自动验收隔离数据" -SuccessDetail "verify-* 临时账号、班级、学生及关联事实已删除" -Action {
    Invoke-VerificationCleanup
  } | Out-Null
}

exit (Complete-Run)
