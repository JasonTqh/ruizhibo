# API 设计

后端工程目录：`apps/api`

默认 API 前缀：

```text
/api
```

### 健康状态与部署版本

```http
GET /api/health
```

响应包含数据库、文件存储驱动和部署版本：

```json
{
  "data": {
    "status": "ok",
    "service": "ruizhibo-api",
    "version": "<APP_VERSION>",
    "database": "ok",
    "fileStorage": "local",
    "checkedAt": "2026-08-14T00:00:00.000Z"
  }
}
```

Docker 测试/正式环境应把 `APP_VERSION` 设置为当前 Git 提交 SHA，并通过 `pnpm verify:release` 防止验证到旧版本。

## 1. 认证

小程序通过 `TARO_APP_AUTH_MODE` 切换认证模式：开发联调使用 `dev`，微信真机联调和生产构建使用 `wechat`。生产环境需要配置教师端、家长端各自的 AppID/AppSecret，并关闭 `dev-login`。

```http
POST /api/auth/dev-login
POST /api/auth/admin-login
GET  /api/me
```

### 开发登录

请求：

```http
POST /api/auth/dev-login
Content-Type: application/json

{
  "role": "admin",
  "phone": "13800000000"
}
```

seed 数据内置账号：

| 角色      | 手机号        | 说明       |
| --------- | ------------- | ---------- |
| `admin`   | `13800000000` | 系统管理员 |
| `teacher` | `13800000001` | 李老师     |
| `parent`  | `13800000002` | 张小明家长 |

响应：

```json
{
  "data": {
    "token": "<jwt>",
    "user": {
      "id": "<user-id>",
      "role": "admin",
      "name": "系统管理员",
      "phone": "13800000000"
    }
  }
}
```

后续访问受保护接口时携带：

```http
Authorization: Bearer <jwt>
```

微信登录相关接口：

```http
POST /api/auth/wechat-login
POST /api/auth/bind-phone
```

`POST /api/auth/dev-login` 默认只在非生产环境开放。可通过 `ENABLE_DEV_LOGIN=true|false` 显式控制；生产配置必须为 `false` 或不设置。

### 管理员正式登录

管理后台使用独立的手机号与密码登录：

```http
POST /api/auth/admin-login
Content-Type: application/json

{
  "phone": "13800000000",
  "password": "<管理员密码>"
}
```

成功响应结构与开发登录一致，管理员令牌有效期为 8 小时。错误手机号、错误密码、停用账号和未初始化密码统一返回 `UNAUTHORIZED`；失败次数超限返回 HTTP 429。密码初始化、重置、限流和验证命令见 `docs/admin-authentication.md`。

## 2. 家长端 API

```http
GET  /api/parent/children
GET  /api/parent/children/:studentId/timeline
GET  /api/parent/children/:studentId/attendance
GET  /api/parent/children/:studentId/pickup/today
GET  /api/parent/children/:studentId/pickup-records
GET  /api/parent/children/:studentId/homework
POST /api/parent/homework-submissions/:submissionId/submit

GET  /api/parent/notices
POST /api/parent/notice-receipts/:receiptId/view
POST /api/parent/notice-receipts/:receiptId/confirm

GET  /api/parent/conversations
GET  /api/parent/conversations/:conversationId/messages
POST /api/parent/conversations/:conversationId/messages
```

### 成长时间线响应示例

```json
{
  "data": [
    {
      "id": "gr_001",
      "type": "attendance",
      "title": "已到校",
      "content": "李老师已确认张小明到达中心。",
      "happenedAt": "2026-06-16T08:30:00.000Z"
    }
  ]
}
```

### 家长查看并确认通知/任务

`GET /api/parent/notices` 按当前登录家长返回发布回执。每个已绑定孩子各有一条独立回执，状态由 `viewedAt` 和 `confirmedAt` 推导。

```json
{
  "data": [
    {
      "id": "<receipt-id>",
      "status": "pending",
      "viewedAt": null,
      "confirmedAt": null,
      "student": { "id": "<student-id>", "name": "张小明" },
      "notice": {
        "id": "<notice-id>",
        "kind": "task",
        "title": "亲子阅读确认",
        "content": "今晚完成 20 分钟亲子阅读后请确认。",
        "dueAt": "2026-08-07T12:00:00.000Z",
        "createdAt": "2026-08-06T04:00:00.000Z",
        "class": { "id": "<class-id>", "name": "晚托 A 班" },
        "teacher": { "id": "<teacher-id>", "name": "李老师" }
      }
    }
  ]
}
```

家长打开详情时标记查看，完成阅读或任务后显式确认：

```http
POST /api/parent/notice-receipts/:receiptId/view
POST /api/parent/notice-receipts/:receiptId/confirm
Authorization: Bearer <parent-token>
```

两个写接口均幂等，并保留首次查看、首次确认时间。确认会在尚未查看时同时补上 `viewedAt`。家长只能操作自己当前仍绑定孩子的回执，跨家长访问返回 `NOT_FOUND`。

## 3. 教师端 API

```http
GET  /api/teacher/dashboard
GET  /api/teacher/classes
GET  /api/teacher/classes/:classId/students

GET  /api/teacher/workflow/today
POST /api/teacher/workflow/:sessionId/steps/:stepId/check
POST /api/teacher/workflow/:sessionId/steps/:stepId/batch-complete
POST /api/teacher/workflow/:sessionId/steps/:stepId/students/:studentId/complete
POST /api/teacher/workflow/:sessionId/steps/:stepId/students/:studentId/skip
POST /api/teacher/workflow/:sessionId/steps/:stepId/students/:studentId/exception

GET  /api/teacher/pickup/today
POST /api/teacher/pickup/batch/picked-up
POST /api/teacher/pickup/batch/arrived
POST /api/teacher/pickup/students/:studentId/picked-up
POST /api/teacher/pickup/students/:studentId/arrived
POST /api/teacher/pickup/students/:studentId/left

GET  /api/teacher/teaching-records
POST /api/teacher/teaching-records
GET  /api/teacher/growth-records
POST /api/teacher/students/:studentId/growth-records

GET   /api/teacher/lesson-plans
POST  /api/teacher/lesson-plans
PATCH /api/teacher/lesson-plans/:lessonPlanId
PATCH /api/teacher/lesson-plans/:lessonPlanId/status

GET   /api/teacher/research-activities
POST  /api/teacher/research-activities
PATCH /api/teacher/research-activities/:activityId
PATCH /api/teacher/research-activities/:activityId/participation

GET  /api/teacher/homework
POST /api/teacher/homework
PATCH /api/teacher/homework-submissions/:submissionId

GET  /api/teacher/notices
POST /api/teacher/notices
GET  /api/teacher/notices/:noticeId/receipts

GET  /api/teacher/conversations
GET  /api/teacher/conversations/:conversationId/messages
POST /api/teacher/conversations/:conversationId/messages
```

教师端接口必须登录，且角色必须是 `teacher`。老师只能访问自己负责班级的数据。

### 家校沟通图片消息

教师端与家长端的消息发送接口同时支持文字和图片。图片必须先由当前发送者通过 `POST /api/files` 上传，且上传场景必须为 `scene: "message"`。

```http
POST /api/teacher/conversations/:conversationId/messages
POST /api/parent/conversations/:conversationId/messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "kind": "image",
  "fileUrls": ["/uploads/message/example.png"]
}
```

- 每条图片消息最多包含 3 张图片。
- 图片资源必须属于当前发送者，不能引用另一位用户或其他上传场景的文件。
- 用户只能发送 `text` 或 `image`；`system` 消息不能由客户端伪造。
- 图片消息可选填 `content` 作为说明；未填写时服务端保存为 `[图片]`，便于会话列表展示摘要。
- 对方读取会话详情后，图片消息与文字消息一样更新 `readAt`。

教研活动按教师任教班级所属校区隔离。查询支持 `type=all|discussion|observation|training` 和 `scope=upcoming|mine|all`；草稿仅组织者可见。活动只有组织者可以编辑、发布、结束或取消，同校区其他教师可以报名和取消报名，出席状态由后续管理能力确认。

教师成长反馈列表：

```http
GET /api/teacher/growth-records
Authorization: Bearer <teacher-token>
```

只返回当前教师创建的 `teacher_feedback` 类型成长记录，按发生时间倒序排列，并包含学生及班级摘要。响应中的 `visibleToParent` 用于区分“家长可见”和“仅内部可见”；其他教师无法通过该接口读取这些记录。

流程打卡：

```http
GET /api/teacher/workflow/today
Authorization: Bearer <teacher-token>
```

如果当天没有流程实例，后端会使用激活的流程模板为老师负责的班级创建今日实例。
每个步骤会返回 `requirePhoto`、`checkedAt`、班级 `photoUrls`、`studentSummary` 和 `students`。学生项包含持久状态、动态 `effectiveStatus`、处理时间、经办教师、个人照片、备注，以及由 CP-33 接送事实聚合出的到店状态。缺勤来自当天 `AttendanceEvent.absence`，不会重复写入 workflow enum。

```http
POST /api/teacher/workflow/:sessionId/steps/:stepId/check
Authorization: Bearer <teacher-token>
Content-Type: application/json

{
  "photoUrls": ["/uploads/workflow/example.jpg"]
}
```

- `photoUrls` 最多包含 3 张图片。
- 当步骤的 `requirePhoto` 为 `true` 时，未提供照片会返回 `400`，不会写入打卡结果。
- 旧 `/check` 保持兼容，重新解释为批量完成所有 active、非缺勤且仍为 `pending` 的学生；不会覆盖已完成、跳过或异常事实。
- `WorkflowStep.checked` 表示所有需要处理的学生均已离开 `pending`，每次操作后自动同步；普通流程不再自动生成 `GrowthRecord`。

学生级操作：

```http
POST /api/teacher/workflow/:sessionId/steps/:stepId/batch-complete
POST /api/teacher/workflow/:sessionId/steps/:stepId/students/:studentId/complete
POST /api/teacher/workflow/:sessionId/steps/:stepId/students/:studentId/skip
POST /api/teacher/workflow/:sessionId/steps/:stepId/students/:studentId/exception
Authorization: Bearer <teacher-token>
```

- `batch-complete` 可选传 `studentIds`；不传表示当前步骤全部 eligible + pending 学生。整批在同一事务完成，非法学生或显式包含缺勤学生时整批失败。
- 单人只允许 `pending → completed|skipped|exception`。重复处理或试图改写终态返回 `409`；`skip`、`exception` 的 `remark` 必填。
- 个人 `photoUrls` 最多 3 张，去重后必须属于当前教师、`scene=workflow` 且是图片；个人操作不机械继承班级 `requirePhoto`。
- 所有写接口验证 session、step、负责教师、学生班级与 active 状态，拒绝跨班 IDOR；当天缺勤学生返回 `409`。

家长今日托管进度：

```http
GET /api/parent/children/:studentId/workflow/today
Authorization: Bearer <parent-token>
```

仅 active `StudentGuardian` 可读取。响应聚合“安全到店”和学生流程步骤，展示 `completed`、`pending`、`skipped`、`exception`、`absent`、老师备注及个人照片；跨家庭读取返回 `404`。响应只返回家长页面需要的展示字段，不返回其他学生、内部 Workflow 记录编号、教师编号或 `FileAsset` 存储元数据。

管理端只读查询：

```http
GET /api/admin/business/student-workflows?from=<date>&to=<date>&classId=<id>&teacherId=<id>&studentId=<id>&status=<status>
Authorization: Bearer <admin-token>
```

支持按日期、班级、教师、学生和 `pending|completed|skipped|exception|absent` 筛选，返回学生日汇总与完整步骤。未提供日期时只查询当前中国业务日；只提供一侧日期时按该单日查询；显式日期范围最多 31 天，避免将全部历史记录加载到内存。CP-34 不提供修改、删除或重置历史事实的管理端接口。

### 生活照护与异常记录

教师今日照护与写入接口：

```http
GET  /api/teacher/care/today?classId=<optional-class-id>
POST /api/teacher/care/meal/batch
POST /api/teacher/care/water/batch
POST /api/teacher/care/rest/batch
POST /api/teacher/students/:studentId/care-records/meal
POST /api/teacher/students/:studentId/care-records/water
POST /api/teacher/students/:studentId/care-records/rest
POST /api/teacher/students/:studentId/care-records/mood
POST /api/teacher/students/:studentId/care-records/exception
Authorization: Bearer <teacher-token>
```

各类型使用独立 DTO：用餐要求 `mealSlot=snack|dinner` 和受控 `value`；饮水每次新增数量 1；休息要求受控状态并可带合理范围的 `durationMinutes`；情绪允许当天多次；异常必须填写事实备注，可带受控类别、非医疗处理、`needsAttention` 和照片。用餐/休息在同一业务日更新原记录，异常无更新或删除接口。

批量接口必须显式传 `classId` 与 `studentIds`，不会因省略学生列表而危险地提交全班。服务会先完整验证教师班级、学生 active 状态、当天缺勤和离店时间，再在同一事务内全部写入；用餐/休息只补齐尚无记录的学生，不覆盖已有 `little/refused` 等例外。

所有图片必须先通过 `POST /api/files` 使用 `scene=care` 上传。保存记录时会验证 URL 对应的 `FileAsset` 存在、属于当前教师、scene 正确且 MIME 为图片；`message/homework/workflow/care` 之间不能交叉引用。

家长今日生活摘要：

```http
GET /api/parent/children/:studentId/care/today
Authorization: Bearer <parent-token>
```

仅 active `StudentGuardian` 可读取。响应聚合餐食、饮水次数、主要休息、最新情绪和按时间排序的异常；只返回页面所需的展示字段与安全图片 URL，不返回其他学生、教师内部编号或 `FileAsset.ownerId/scene/storageKey` 等元数据。

管理端只读查询：

```http
GET /api/admin/business/care-records?from=<date>&to=<date>&classId=<id>&teacherId=<id>&studentId=<id>&type=<type>&needsAttention=<boolean>&quickFilter=<today_exception|needs_attention>&page=<n>&pageSize=<n>
Authorization: Bearer <admin-token>
```

未提供日期时只查当前中国业务日，显式日期范围最多 31 天；筛选与分页均在数据库执行。接口只读，不提供修改、删除或异常覆盖能力。

### 每日托管报告

CP-36 使用统一 `DailyReportService` 实时聚合现有事实，不创建完整日报快照。所有报告 GET 均只读，不写入 Pickup、Attendance、Workflow、Care、Homework、Growth 或 AuditLog。

家长完整日报：

```http
GET /api/parent/students/:studentId/daily-report?date=YYYY-MM-DD
Authorization: Bearer <parent-token>
```

必须存在 active `StudentGuardian`；跨家庭和无效学生统一返回 `404`。默认今天，最多查询最近 90 天。响应只包含当前学生的展示字段、教师姓名及安全图片 URL，不返回其他学生、内部记录 ID、教师 ID、电话、FileAsset 元数据或未发布寄语。

教师班级摘要、学生详情和寄语：

```http
GET /api/teacher/daily-reports?date=YYYY-MM-DD&classId=<id>&status=<status>&needsAttention=<boolean>
GET /api/teacher/students/:studentId/daily-report?date=YYYY-MM-DD
PUT /api/teacher/students/:studentId/daily-report-note
Authorization: Bearer <teacher-token>
```

教师只可访问自己负责班级中的 active 学生；跨班学生和不属于自己的 `classId` 返回 `404`。列表只返回状态、关注数、流程/照护/作业摘要和寄语发布状态，详情才加载备注、个人图片、附件与成长内容。教师报告最多查询最近 31 天；寄语第一版只允许当前业务日，正文最多 500 字：

```json
{
  "date": "2026-08-18",
  "comment": "今天整体状态平稳。",
  "publish": true
}
```

`publish=false` 保存草稿或取消发布，`publish=true` 要求非空正文。每次保存、发布或取消发布均写 AuditLog；同一学生同一业务日只保留一条当前寄语。草稿仅教师与管理员可见。

管理端只读日报：

```http
GET /api/admin/business/daily-reports?date=YYYY-MM-DD&campusId=<id>&classId=<id>&teacherId=<id>&studentId=<id>&status=<status>&hasException=<boolean>&needsAttention=<boolean>&published=<boolean>&page=<n>&pageSize=<1..50>
GET /api/admin/business/daily-reports/:studentId?date=YYYY-MM-DD
Authorization: Bearer <admin-token>
```

管理端一次只查询一个业务日，默认今天；候选学生的筛选、计数和分页在数据库完成，再对当前页 studentIds 批量查询各类事实。详情只读，可查看寄语草稿/发布状态，但没有修改任何日报或底层事实的接口。

三端日期统一为严格 `YYYY-MM-DD` 和 Asia/Shanghai 业务日；非法日期和未来日期返回 `400`。总体状态实时按 `absence > left_center > arrived_at_center > picked_up_from_school > waiting_pickup` 推导。缺勤进入专用模式，不把没有门店事实推断为流程失败、未进食或异常；`processed` 明确包含 completed、skipped、exception，且不等于 completed。

### 安全接送与到离店

CP-33 使用事实事件而不是可覆盖的单一状态：

```http
GET  /api/teacher/pickup/today?classId=<optional-class-id>
POST /api/teacher/pickup/batch/picked-up
POST /api/teacher/pickup/batch/arrived
POST /api/teacher/pickup/students/:studentId/picked-up
POST /api/teacher/pickup/students/:studentId/arrived
POST /api/teacher/pickup/students/:studentId/left
Authorization: Bearer <teacher-token>
```

`GET /teacher/pickup/today` 返回当前教师负责班级的活跃学生、今日事件，以及由事件/请假事实推导的 `waiting_pickup`、`picked_up`、`in_care`、`left`、`absent` 状态。`pickupPeople` 只包含可以接走学生的人，`deliveryPeople` 还包含 active 但无接走权限的监护人，用于准确记录“谁把孩子送到”。指定不属于当前教师的 `classId` 返回 `404`。

学校接到可直接提交空对象或备注。到店必须明确到店方式：

```json
{
  "arrivalMethod": "teacher_pickup",
  "remark": "全员安全抵达"
}
```

`arrivalMethod` 支持 `teacher_pickup`、`parent_delivered`、`self_arrived`、`other`。教师接送方式必须先存在“学校接到”事实；家长送达或自行到店不要求前置接送事实。

家长送达时可选填具体送达人，后端会验证其必须是该学生的 active 监护人或有效授权人，并保存当时的姓名、关系和电话快照；其他到店方式携带送达人编号会返回 `400`：

```json
{
  "arrivalMethod": "parent_delivered",
  "deliveryPersonType": "guardian",
  "deliveryPersonId": "<student-guardian-id>"
}
```

高峰期可一次提交 1–50 个当前教师班级内的学生：

```json
{
  "studentIds": ["<student-a-id>", "<student-b-id>"]
}
```

`batch/picked-up` 只接受待接学生，`batch/arrived` 只接受已登记学校接到的学生。整批先完成权限、请假和状态预检，再在一个事务内写入；任一学生不合法时整批拒绝，不会部分成功。

正常离店必须选择当前有效且已授权的监护人或非账号型授权接送人：

```json
{
  "status": "normal",
  "pickupPersonType": "guardian",
  "pickupPersonId": "<student-guardian-id>",
  "remark": "已核验身份"
}
```

临时或异常接送不允许伪装为正常授权，必须填写接送人姓名、关系、联系方式和确认/处理结果；`exception` 还必须填写异常原因：

```json
{
  "status": "temporary_authorization",
  "temporaryName": "王女士",
  "temporaryRelationship": "relative",
  "temporaryPhone": "13800000000",
  "resolution": "已电话联系主要监护人确认",
  "remark": "临时授权一次"
}
```

同一学生同一中国业务日的同类事件只能写入一次。服务预检、数据库唯一约束和事务共同阻止重复点击；教师小程序另用同步请求锁在发出第二个请求前阻断连点。到店和离店会在同一事务内同步兼容的 `AttendanceEvent.arrive` / `AttendanceEvent.leave`。系统不提供接送事实更新或删除接口。

家长查询：

```http
GET /api/parent/children/:studentId/pickup/today
GET /api/parent/children/:studentId/pickup-records?page=1&pageSize=30&from=2026-08-01&to=2026-08-31
Authorization: Bearer <parent-token>
```

家长必须与学生存在 active `StudentGuardian` 关系；跨家庭访问返回 `404`。今日接口同时读取当天 `AttendanceEvent.absence`，返回 `status = absent` 和可选 `absenceRemark`，确保与教师端一致。历史记录保留送达人/接送人快照和经办教师，电话在家长响应中掩码展示，临时/异常状态、原因和处理结果不会被隐藏。

### 发布通知/家长任务

这里的 `task` 表示需要家长查看并确认的待办事项；学生学业作业仍使用 `HomeworkAssignment`。

```http
POST /api/teacher/notices
Authorization: Bearer <teacher-token>
Content-Type: application/json

{
  "classId": "<class-id>",
  "kind": "task",
  "title": "亲子阅读确认",
  "content": "今晚完成 20 分钟亲子阅读后请确认。",
  "dueAt": "2026-08-07T12:00:00.000Z"
}
```

`kind` 支持 `notice`、`task`；`dueAt` 可选。发布时会为班级内每个有效学生的每位有效家长创建一条回执快照。没有任何有效接收家长时返回 `BAD_REQUEST`，部分学生未绑定家长时通过 `unboundStudentCount` 提醒教师。

教师发布列表包含回执汇总：

```json
{
  "id": "<notice-id>",
  "kind": "task",
  "title": "亲子阅读确认",
  "content": "今晚完成 20 分钟亲子阅读后请确认。",
  "dueAt": "2026-08-07T12:00:00.000Z",
  "createdAt": "2026-08-06T04:00:00.000Z",
  "unboundStudentCount": 1,
  "class": { "id": "<class-id>", "name": "晚托 A 班" },
  "receiptSummary": {
    "totalCount": 8,
    "viewedCount": 5,
    "confirmedCount": 3,
    "pendingCount": 5
  }
}
```

查看逐位家长回执：

```http
GET /api/teacher/notices/:noticeId/receipts
Authorization: Bearer <teacher-token>
```

```json
{
  "data": {
    "notice": {
      "id": "<notice-id>",
      "kind": "task",
      "title": "亲子阅读确认",
      "class": { "id": "<class-id>", "name": "晚托 A 班" }
    },
    "summary": {
      "totalCount": 8,
      "viewedCount": 5,
      "confirmedCount": 3,
      "pendingCount": 5
    },
    "receipts": [
      {
        "id": "<receipt-id>",
        "student": { "id": "<student-id>", "name": "张小明" },
        "parent": { "id": "<parent-id>", "name": "张小明家长" },
        "status": "confirmed",
        "viewedAt": "2026-08-06T04:10:00.000Z",
        "confirmedAt": "2026-08-06T04:12:00.000Z"
      }
    ]
  }
}
```

教师只能发布到自己负责的班级，也只能查看自己发布内容的回执。

作业发布：

```http
POST /api/teacher/homework
Authorization: Bearer <teacher-token>
Content-Type: application/json

{
  "classId": "<class-id>",
  "title": "数学每日练习",
  "subject": "数学",
  "content": "完成口算练习一页",
  "dueAt": "2026-07-07T12:00:00.000Z"
}
```

家长提交作业（`fileUrls` 必须来自当前家长通过 `scene: "homework"` 上传的文件）：

```http
POST /api/parent/homework-submissions/:submissionId/submit
Authorization: Bearer <parent-token>
Content-Type: application/json

{
  "content": "已和孩子一起完成。",
  "fileUrls": ["/uploads/homework/example.png"]
}
```

文字和图片至少提交一项。家长只能提交自己绑定孩子的作业；待提交、已逾期或待批改状态可以提交/重新提交，已批改状态返回 `409 Conflict`。

教师批改已提交作业：

```http
PATCH /api/teacher/homework-submissions/:submissionId
Authorization: Bearer <teacher-token>
Content-Type: application/json

{
  "status": "reviewed",
  "remark": "完成认真，继续保持！"
}
```

批改后家长重新请求 `GET /api/parent/children/:studentId/homework` 即可看到 `reviewedAt` 和 `remark`。

## 4. 管理后台 API

管理后台接口必须登录，并且当前用户角色必须是 `admin`。

```http
GET    /api/admin/teachers
POST   /api/admin/teachers
PATCH  /api/admin/teachers/:id
GET    /api/admin/teachers/:id/references
DELETE /api/admin/teachers/:id

GET    /api/admin/parents
POST   /api/admin/parents
PATCH  /api/admin/parents/:id
GET    /api/admin/parents/:id/references
DELETE /api/admin/parents/:id

GET    /api/admin/classes
POST   /api/admin/classes
PATCH  /api/admin/classes/:id
GET    /api/admin/classes/:id/references
DELETE /api/admin/classes/:id

GET    /api/admin/students
POST   /api/admin/students
PATCH  /api/admin/students/:id
GET    /api/admin/students/:id/references
DELETE /api/admin/students/:id

POST   /api/admin/students/:studentId/guardians
PATCH  /api/admin/students/:studentId/guardians/:guardianId
DELETE /api/admin/students/:studentId/guardians/:guardianId

GET    /api/admin/students/:studentId/pickup-persons
POST   /api/admin/students/:studentId/pickup-persons
PATCH  /api/admin/pickup-persons/:personId

GET    /api/admin/workflow-templates
POST   /api/admin/workflow-templates
PATCH  /api/admin/workflow-templates/:id
GET    /api/admin/workflow-templates/:id/references
DELETE /api/admin/workflow-templates/:id

GET    /api/admin/business/homework
GET    /api/admin/business/teaching-records
GET    /api/admin/business/growth-records
GET    /api/admin/business/attendance
GET    /api/admin/business/workflows
GET    /api/admin/business/lesson-plans
PATCH  /api/admin/business/lesson-plans/:id/status
GET    /api/admin/business/research-activities
PATCH  /api/admin/business/research-activities/:id/status
GET    /api/admin/business/pickup-records

GET    /api/admin/audit-logs
```

### 老师管理

创建老师：

```http
POST /api/admin/teachers
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "name": "王老师",
  "phone": "13900000001",
  "status": "active"
}
```

更新老师：

```http
PATCH /api/admin/teachers/:id
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "name": "王老师",
  "status": "disabled"
}
```

删除老师前可查询其业务引用：

```http
GET /api/admin/teachers/:id/references
Authorization: Bearer <admin-token>
```

返回负责班级、考勤、流程、作业、教学记录、备课计划、组织/参与教研、成长记录、消息、通知和会话的数量。无引用时可直接删除；存在引用时普通删除返回 `409 Conflict`。需要清理引用时必须先停用老师，再显式确认强制删除：

```http
DELETE /api/admin/teachers/:id?force=true
Authorization: Bearer <admin-token>
```

强制删除会保留班级、考勤、成长反馈和审计历史并解除老师引用，同时永久删除该老师私有的流程、作业、教学、备课、教研、通知及家校会话数据。管理后台会在操作前展示逐项引用统计；该操作不可撤销。

### 班级管理

创建班级：

```http
POST /api/admin/classes
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "campusId": "seed-campus-main",
  "name": "晚托 B 班",
  "teacherId": "<teacher-id>"
}
```

`teacherId` 可为空，表示班级暂未分配老师。

### 学生管理

创建学生：

```http
POST /api/admin/students
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "classId": "<class-id>",
  "name": "李小红",
  "gender": "女",
  "birthday": "2017-09-01",
  "status": "active"
}
```

### 家长绑定

绑定已有家长：

```http
POST /api/admin/students/:studentId/guardians
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "parentId": "<parent-user-id>",
  "relation": "妈妈",
  "isPrimary": true,
  "canReceiveNotice": true,
  "canSubmitHomework": true,
  "canViewGrowth": true,
  "canPickup": true,
  "status": "active",
  "remark": "主要联系人"
}
```

按手机号创建或复用家长并绑定：

```http
POST /api/admin/students/:studentId/guardians
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "parentName": "李小红家长",
  "parentPhone": "13900000002",
  "relation": "爸爸"
}
```

更新绑定关系：

```http
PATCH /api/admin/students/:studentId/guardians/:guardianId
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "relation": "父亲",
  "isPrimary": false,
  "canReceiveNotice": true,
  "canSubmitHomework": false,
  "canViewGrowth": true,
  "canPickup": true,
  "status": "active",
  "remark": "仅接收通知和查看成长"
}
```

同一孩子只有一位正常绑定家长可以是主要联系人。`canReceiveNotice` 控制通知回执，`canSubmitHomework` 控制作业提交，`canViewGrowth` 控制成长时间线和考勤读取，`canPickup` 控制该监护人能否作为正常离店接送人；权限不足时业务接口按不可见资源返回 `404`。

`canPickup` 属于显式安全授权。创建或重新绑定监护关系时如果请求省略该字段，后端固定保存为 `false`；管理后台新增绑定也默认关闭。只有管理员明确提交 `canPickup: true` 后，该监护人才会出现在正常离店接送人列表中。`canPickup: false` 不影响 active 监护人作为“家长送达”的送达人事实记录。

解绑家长：

```http
DELETE /api/admin/students/:studentId/guardians/:guardianId
Authorization: Bearer <admin-token>
```

解绑会将 `StudentGuardian.status` 更新为 `unlinked` 并取消主要联系人标记，保留历史关系和审计记录，不删除家长用户。解绑后孩子、通知和家校会话立即不可访问；重新绑定同一位家长会复用并恢复原关系记录。

管理后台还提供老师、家长、班级、学生和流程模板的引用检查与安全删除接口。存在业务引用时普通删除返回 `409`；需要强制清理的数据必须先将对应家长、学生或流程模板停用，再显式使用 `?force=true`，页面会展示引用统计和不可撤销提示。

### 4.6 业务记录查询与状态管理

管理员可查询以下业务数据：

```http
GET /api/admin/business/homework
GET /api/admin/business/teaching-records
GET /api/admin/business/growth-records
GET /api/admin/business/attendance
GET /api/admin/business/workflows
GET /api/admin/business/lesson-plans
GET /api/admin/business/research-activities
GET /api/admin/business/pickup-records
```

通用查询参数包括 `page`、`pageSize`、`classId`、`teacherId`、`studentId`、`status`、`type`、`from` 和 `to`。各接口按业务实际字段使用适用参数，统一返回：

```json
{
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "pageSize": 10
  }
}
```

管理员还可调整教案与教研活动状态：

```http
PATCH /api/admin/business/lesson-plans/:id/status
PATCH /api/admin/business/research-activities/:id/status
```

请求体为 `{ "status": "<目标状态>" }`。教案支持 `draft`、`published`、`archived`；教研活动支持 `draft`、`open`、`completed`、`cancelled`。每次状态变化均写入审计日志。

### 4.7 授权接送人与接送记录

非账号型授权接送人由管理员按学生维护：

```http
GET  /api/admin/students/:studentId/pickup-persons
POST /api/admin/students/:studentId/pickup-persons
PATCH /api/admin/pickup-persons/:personId
Authorization: Bearer <admin-token>
```

创建示例：

```json
{
  "name": "张爷爷",
  "relationship": "grandfather",
  "phone": "13800000000",
  "isActive": true,
  "remark": "长期授权"
}
```

`relationship` 支持 `father`、`mother`、`grandfather`、`grandmother`、`maternal_grandfather`、`maternal_grandmother`、`sibling`、`relative`、`other`。停用后不能用于正常离店，历史记录仍使用当时快照展示。

管理员接送记录查询：

```http
GET /api/admin/business/pickup-records?from=2026-08-17&to=2026-08-17
GET /api/admin/business/pickup-records?quickFilter=missing_arrival_today
GET /api/admin/business/pickup-records?quickFilter=missing_leave_today
GET /api/admin/business/pickup-records?quickFilter=exception
```

除通用分页与日期外，支持 `campusId`、`classId`、`teacherId`、`studentId`、`type`、`status`、`isException`。`missing_arrival_today` 会排除当天已登记请假/缺勤的学生；未到店/未离店占位项的 `happenedAt` 为 `null`，不得把 `serviceDate` 伪装成 08:00 的事件时间。管理员仅查询和追溯，当前没有修改或删除历史接送事实的 API。已有接送责任记录会阻止教师、家长、班级和学生的强制删除，只能停用或结业。

## 5. 文件上传

第一版接口：

```http
POST /api/files
```

请求：

```http
POST /api/files
Authorization: Bearer <token>
Content-Type: application/json

{
  "fileName": "workflow.jpg",
  "mimeType": "image/jpeg",
  "base64": "<base64>",
  "size": 12345,
  "scene": "workflow"
}
```

响应：

```json
{
  "data": {
    "id": "<file-id>",
    "url": "/uploads/workflow/<file-name>.jpg",
    "mimeType": "image/jpeg",
    "size": 12345,
    "scene": "workflow",
    "storageDriver": "local",
    "storageKey": "workflow/<uuid>.jpg"
  }
}
```

用途：

- 作业图片
- 流程打卡照片
- 家校沟通图片

单个文件解码后最大为 10 MB；支持 JPG、PNG、WebP、GIF 和 PDF，并校验文件内容签名是否与 `mimeType` 一致。API 请求体已为 Base64 编码开销预留空间。请求体过大时返回 `413 PAYLOAD_TOO_LARGE`，小程序会显示可读错误信息。

`FILE_STORAGE_DRIVER=local` 时返回 `/uploads/*` 相对地址；设置为 `s3` 时写入 COS、OSS、AWS S3、MinIO 等 S3 兼容对象存储，并返回 `S3_PUBLIC_BASE_URL` 下的绝对地址。配置和验证步骤见 `docs/file-storage.md`。

## 6. 错误格式

统一错误响应格式：

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "无权访问该学生信息",
    "requestId": "18c0538f-5c2e-4ca1-83c6-4f982e32d95e"
  }
}
```

所有响应同时返回 `X-Request-Id` 响应头，错误体内的 `requestId` 与响应头一致。用户报障时可以提供该 ID 查询服务端日志，详见 `docs/observability.md`。

常见错误码：

| HTTP 状态 | code                    | 场景                                   |
| --------- | ----------------------- | -------------------------------------- |
| 400       | `BAD_REQUEST`           | 参数格式错误、DTO 校验失败             |
| 401       | `UNAUTHORIZED`          | 缺少 token、token 无效、用户已禁用     |
| 403       | `FORBIDDEN`             | 当前角色无权访问                       |
| 404       | `NOT_FOUND`             | 资源不存在                             |
| 409       | `CONFLICT`              | 重复事实、绑定冲突、受保护历史阻止删除 |
| 500       | `INTERNAL_SERVER_ERROR` | 未预期服务端错误                       |

## 7. 本地验证

准备数据库并写入 seed 数据：

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ruizhibo"
pnpm --filter @ruizhibo/api seed
```

启动后端：

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ruizhibo"
$env:JWT_SECRET="change-me-in-production"
pnpm dev:api
```

另开一个终端运行管理接口验证：

```powershell
pnpm --filter @ruizhibo/api verify:admin
```

验证请求 ID 和错误关联：

```powershell
pnpm --filter @ruizhibo/api verify:observability
```

默认验证内容：

- `/api/health`
- 管理员、老师开发登录
- `GET /api/me`
- 管理员读取老师、班级、学生列表
- 老师访问管理接口返回 `FORBIDDEN`
- 未登录访问管理接口返回 `UNAUTHORIZED`
- 参数错误返回 `BAD_REQUEST`

如果需要验证写入类接口，追加 `-IncludeWrites`：

```powershell
pnpm --filter @ruizhibo/api verify:admin -- -IncludeWrites
```

该模式会创建一组本地验证老师、班级、学生和家长用户，测试家长绑定/解绑，并覆盖老师无引用删除、引用保护、启用状态强制删除保护以及停用后关联清理。它适合本地开发库，不建议对生产数据库运行。

### 教师端与家长端自动验证

API 启动且开发登录开启后，运行只读验证：

```powershell
pnpm --filter @ruizhibo/api verify:teacher
pnpm --filter @ruizhibo/api verify:parent
```

教师端覆盖身份、工作台、班级与学生、今日流程、教学记录、成长反馈、备课、教研、作业、通知回执、会话消息，以及未登录、跨角色和错误参数响应。家长端覆盖身份、孩子绑定、成长时间线、出勤、作业、通知、会话消息，以及未登录、跨角色和非本人孩子数据隔离。

### 安全接送自动验证

在本地或专用测试数据库运行：

```powershell
pnpm --filter @ruizhibo/api verify:pickup
```

脚本创建隔离的教师、班级、家长、学生和授权接送人，覆盖学校接到、到店、授权离店、家长读取、教师跨班拒绝、家长跨家庭拒绝、停用接送人拒绝、非法学生、重复到店/离店、临时异常交接、管理员异常筛选、`AttendanceEvent` 兼容以及接送历史阻止强制删除。验收回归还覆盖请假在教师/家长/后台三端一致、请假学生不进入“今日未到店”、具体送达人快照及跨学生引用拒绝、批量学校接到/安全到店的原子写入与幂等、后台班级数据层级和无虚假事件时间。结束时只停用测试主体，不删除不可变的接送事实，因此仅可在开发或专用测试数据库运行。

### 学生级一日流程自动验证

在本地或专用测试数据库运行：

```powershell
pnpm --filter @ruizhibo/api verify:student-workflow
```

脚本创建隔离主体并覆盖 CP-34 的 24 个场景：初始化、单人三种终态、缺勤保护、跨教师/跨班/跨家庭拒绝、重复与终态改写拒绝、图片 owner/scene、部分与全班批量原子性、旧 `/check` 与 `requirePhoto` 兼容、家长今日时间线、管理端只读查询、停止生成 `GrowthRecord` 和 Dashboard `uncheckedStepCount` 一致性。脚本结束会停用测试教师、家长和学生，不得对生产数据库运行。

### 生活照护自动验证

在本地或专用测试数据库运行：

```powershell
pnpm --filter @ruizhibo/api verify:care-records
```

脚本创建隔离教师、班级、家长和学生，覆盖 CP-35 规定的 30 个场景：五类记录及字段校验、用餐更新、饮水累计、批量原子性和例外保护、跨教师/跨班/跨家庭拒绝、缺勤保护、`scene=care` 图片 owner/scene、家长安全投影、管理端默认今日/31 天上限/异常筛选，以及不生成 `GrowthRecord`、不修改 Pickup/Workflow。脚本结束停用验证主体，但保留照护事实，因此不得在生产数据库运行。

### 每日托管报告自动验证

在本地或专用测试数据库运行：

```powershell
pnpm --filter @ruizhibo/api verify:daily-report
```

脚本创建隔离教师、班级、家长和 20 名学生，覆盖 CP-36 的 80 个场景：总体状态和缺勤模式、接送时间线/快照/Attendance fallback、学生流程五态与个人照片、照护无数据语义和实时刷新、作业日期归属/当前状态、成长可见性、GET 零副作用、寄语草稿/发布/唯一性/Audit、家长与教师隔离、严格日期、管理端数据库分页及筛选。脚本会写入隔离测试事实并在结束时停用验证主体，不得对生产数据库运行。

需要验证完整写入闭环时显式追加 `-IncludeWrites`：

```powershell
pnpm --filter @ruizhibo/api verify:teacher -- -IncludeWrites
pnpm --filter @ruizhibo/api verify:parent -- -IncludeWrites
```

写入模式会创建带 `verify-*` 时间戳的教学记录、成长反馈、作业、通知和消息；家长脚本还会完成作业提交、通知查看/确认，并验证教师收到家长消息。该模式只用于本地或专用测试数据库。

默认使用 seed 教师 `13800000001`、家长 `13800000002`。账号手机号调整后可显式传参；家长写入验证的教师必须是所选孩子班级的任课教师：

```powershell
pnpm --filter @ruizhibo/api verify:teacher -- -TeacherPhone <teacher-phone> -ParentPhone <parent-phone>
pnpm --filter @ruizhibo/api verify:parent -- -ParentPhone <parent-phone> -TeacherPhone <class-teacher-phone> -IncludeWrites
```

统一验证也支持环境变量 `VERIFY_API_BASE_URL`、`VERIFY_ADMIN_PHONE`、`VERIFY_TEACHER_PHONE`、`VERIFY_PARENT_PHONE`。这适合联调库已修改测试手机号，但仍希望一次运行全部只读检查的场景。

部署到使用 seed 数据的测试环境后，可一次运行现有 API 回归、CP-33 接送、CP-34 学生流程、CP-35 生活照护和 CP-36 每日报告验证：

```powershell
pnpm --filter @ruizhibo/api verify:all
```

`verify:all` 现已包含 `verify:pickup`、`verify:student-workflow`、`verify:care-records` 与 `verify:daily-report`，会写入并保留已停用的隔离验证主体及业务事实；不要对生产数据库运行。

## 8. 微信登录

微信登录接口：

```http
POST /api/auth/wechat-login
Content-Type: application/json

{
  "code": "<wx.login code>",
  "role": "teacher"
}
```

`role` 仅支持 `teacher` 或 `parent`。后端按角色读取以下配置并调用 `code2Session`：

- 教师端：`WECHAT_TEACHER_APP_ID`、`WECHAT_TEACHER_APP_SECRET`
- 家长端：`WECHAT_PARENT_APP_ID`、`WECHAT_PARENT_APP_SECRET`
- 兼容回退：`WECHAT_APP_ID`、`WECHAT_APP_SECRET`

已绑定用户返回正式访问令牌：

```json
{
  "data": {
    "status": "authenticated",
    "token": "<jwt>",
    "user": {
      "id": "<user-id>",
      "role": "teacher",
      "name": "李老师",
      "phone": "13800000001"
    }
  }
}
```

未绑定的微信账号返回 10 分钟有效的短期绑定凭证，不签发业务访问令牌：

```json
{
  "data": {
    "status": "binding_required",
    "bindingToken": "<short-lived-token>",
    "expiresIn": 600
  }
}
```

手机号绑定接口：

```http
POST /api/auth/bind-phone
Content-Type: application/json

{
  "bindingToken": "<short-lived-token>",
  "phoneCode": "<getPhoneNumber event.detail.code>",
  "role": "teacher"
}
```

后端使用微信手机号接口换取可信手机号，再匹配管理后台预先创建的同角色用户。绑定成功返回 `authenticated` 响应并记录 `auth.wechat.bind` 审计日志；账号不存在、已停用、角色不符或已绑定其他微信时拒绝绑定。客户端不能直接提交手机号或 `openid`。

## 9. 审计日志

管理员可查看近期审计日志：

```http
GET /api/admin/audit-logs
Authorization: Bearer <admin-token>
```

当前记录的关键操作包括：

- 老师、班级、学生创建和更新
- 家长绑定和解绑
- 流程模板创建和更新
- 教师流程打卡
- 教学记录、成长反馈、作业创建、家长提交和教师批改
- 教师发布通知/任务
- 家长确认通知/任务
