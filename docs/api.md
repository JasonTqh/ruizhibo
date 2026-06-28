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

## 4. 管理后台 API

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

## 5. 文件上传

第一版接口：

```http
POST /api/files
```

用途：

- 作业图片
- 流程打卡照片
- 家校沟通图片

开发期可以本地存储，生产期接腾讯云 COS 或阿里云 OSS。

## 6. 错误格式

统一错误响应：

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "无权访问该学生信息"
  }
}
```
