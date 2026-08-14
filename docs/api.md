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
  "status": "active",
  "remark": "仅接收通知和查看成长"
}
```

同一孩子只有一位正常绑定家长可以是主要联系人。`canReceiveNotice` 控制通知回执，`canSubmitHomework` 控制作业提交，`canViewGrowth` 控制成长时间线和考勤读取；权限不足时业务接口按不可见资源返回 `404`。

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

部署到使用 seed 数据的测试环境后，可一次运行三套只读检查：

```powershell
pnpm --filter @ruizhibo/api verify:all
```

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
