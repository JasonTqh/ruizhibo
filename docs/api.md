# API 设计

后端工程目录：`apps/api`

默认 API 前缀：

```text
/api
```

## 1. 认证

开发期先使用 dev-login，微信登录第二阶段接入。

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

| 角色 | 手机号 | 说明 |
| --- | --- | --- |
| `admin` | `13800000000` | 系统管理员 |
| `teacher` | `13800000001` | 李老师 |
| `parent` | `13800000002` | 张小明家长 |

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

后续微信登录：

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

## 3. 教师端 API

```http
GET  /api/teacher/dashboard
GET  /api/teacher/classes
GET  /api/teacher/classes/:classId/students

GET  /api/teacher/workflow/today
POST /api/teacher/workflow/:sessionId/steps/:stepId/check

GET  /api/teacher/teaching-records
POST /api/teacher/teaching-records

GET  /api/teacher/homework
POST /api/teacher/homework
PATCH /api/teacher/homework-submissions/:submissionId

GET  /api/teacher/conversations
GET  /api/teacher/conversations/:conversationId/messages
POST /api/teacher/conversations/:conversationId/messages
```

教师端接口必须登录，且角色必须是 `teacher`。老师只能访问自己负责班级的数据。

流程打卡：

```http
GET /api/teacher/workflow/today
Authorization: Bearer <teacher-token>
```

如果当天没有流程实例，后端会使用激活的流程模板为老师负责的班级创建今日实例。

```http
POST /api/teacher/workflow/:sessionId/steps/:stepId/check
Authorization: Bearer <teacher-token>
Content-Type: application/json

{
  "photoUrls": ["/uploads/workflow/example.jpg"]
}
```

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

| HTTP 状态 | code | 场景 |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | 参数格式错误、DTO 校验失败 |
| 401 | `UNAUTHORIZED` | 缺少 token、token 无效、用户已禁用 |
| 403 | `FORBIDDEN` | 当前角色无权访问 |
| 404 | `NOT_FOUND` | 资源不存在 |
| 409 | `CONFLICT` | 手机号重复、绑定关系重复 |
| 500 | `INTERNAL_SERVER_ERROR` | 未预期服务端错误 |

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
pnpm --filter @ruizhibo/api start
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
- 教学记录、成长反馈、作业创建和作业状态更新
