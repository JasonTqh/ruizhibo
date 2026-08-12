# API 设计

后端工程目录：`apps/api`

默认 API 前缀：

```text
/api
```

## 1. 认证

开发期小程序仍默认使用 dev-login；后端已提供微信登录和手机号绑定接口，生产联调时需要配置微信 AppID/AppSecret，并关闭或限制 dev-login。

```http
POST /api/auth/dev-login
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

## 2. 家长端 API

```http
GET  /api/parent/children
GET  /api/parent/children/:studentId/timeline
GET  /api/parent/children/:studentId/attendance
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
每个步骤会返回 `requirePhoto`、`checkedAt` 和 `photoUrls`，前端据此展示照片要求、完成时间和已上传凭证。

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
- 已完成步骤再次提交会返回 `409`，用于阻止重复打卡和重复生成成长记录。

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

GET    /api/admin/classes
POST   /api/admin/classes
PATCH  /api/admin/classes/:id

GET    /api/admin/students
POST   /api/admin/students
PATCH  /api/admin/students/:id

POST   /api/admin/students/:studentId/guardians
DELETE /api/admin/students/:studentId/guardians/:guardianId

GET    /api/admin/workflow-templates
POST   /api/admin/workflow-templates
PATCH  /api/admin/workflow-templates/:id

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
  "relation": "妈妈"
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

解绑家长：

```http
DELETE /api/admin/students/:studentId/guardians/:guardianId
Authorization: Bearer <admin-token>
```

解绑只删除 `StudentGuardian` 绑定关系，不删除家长用户。

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
    "scene": "workflow"
  }
}
```

用途：

- 作业图片
- 流程打卡照片
- 家校沟通图片

单个文件解码后最大为 10 MB；API 请求体已为 Base64 编码开销预留空间。请求体过大时返回 `413 PAYLOAD_TOO_LARGE`，小程序会显示可读错误信息。

开发期可以本地存储，生产期接腾讯云 COS 或阿里云 OSS。

## 6. 错误格式

统一错误响应格式：

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "无权访问该学生信息"
  }
}
```

常见错误码：

| HTTP 状态 | code                    | 场景                               |
| --------- | ----------------------- | ---------------------------------- |
| 400       | `BAD_REQUEST`           | 参数格式错误、DTO 校验失败         |
| 401       | `UNAUTHORIZED`          | 缺少 token、token 无效、用户已禁用 |
| 403       | `FORBIDDEN`             | 当前角色无权访问                   |
| 404       | `NOT_FOUND`             | 资源不存在                         |
| 409       | `CONFLICT`              | 手机号重复、绑定关系重复           |
| 500       | `INTERNAL_SERVER_ERROR` | 未预期服务端错误                   |

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

该模式会创建一组本地验证老师、班级、学生和家长用户，并测试家长绑定/解绑。它适合本地开发库，不建议对生产数据库运行。

## 8. 微信登录

微信登录接口：

```http
POST /api/auth/wechat-login
Content-Type: application/json

{
  "code": "<wx.login code>"
}
```

后端使用 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET` 调用 `code2Session`。如果 `openid` 尚未绑定已有用户，会返回 `UNAUTHORIZED`。

手机号绑定接口：

```http
POST /api/auth/bind-phone
Authorization: Bearer <token>
Content-Type: application/json

{
  "phone": "13900000000",
  "wechatOpenid": "<openid>"
}
```

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
