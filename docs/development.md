# Codex 开发计划

本项目适合按小步任务交给 Codex 推进。每次只做一个闭环，包含实现、验证和说明。

## 1. 当前骨架

```text
apps/api              NestJS + Prisma 后端
apps/admin-web        React + Ant Design 后台
apps/parent-miniapp   Taro 家长端小程序
apps/teacher-miniapp  Taro 教师端小程序
packages/shared       公共类型
```

当前静态原型仍保留：

```text
apps/parent-app
apps/teacher-app
apps/website
```

## 2. 推荐开发顺序

### 任务 1：安装依赖并验证骨架

```text
pnpm install
pnpm typecheck
```

如果依赖下载受限，先只做文件级验证。

### 任务 2：后端认证和测试登录

让 Codex 实现：

```text
POST /api/auth/dev-login
GET /api/me
```

验收：

- admin、teacher、parent 三种角色可登录。
- 返回 token 和用户资料。

### 任务 3：基础数据 CRUD

让 Codex 实现：

```text
admin teachers/classes/students/guardian-bindings
```

验收：

- 管理后台能维护老师、班级、学生、家长绑定。

### 任务 4：教师流程打卡

让 Codex 实现：

```text
GET  /api/teacher/workflow/today
POST /api/teacher/workflow/:sessionId/steps/:stepId/check
```

验收：

- 老师只能操作自己的班级。
- 打卡状态写入数据库。
- 刷新后状态保留。

### 任务 5：家长成长时间线

让 Codex 实现：

```text
GET /api/parent/children
GET /api/parent/children/:studentId/timeline
```

验收：

- 家长只能看到绑定孩子。
- 老师流程打卡和反馈能进入家长时间线。

### 任务 6：家校沟通

让 Codex 实现：

```text
GET  /api/*/conversations
GET  /api/*/conversations/:id/messages
POST /api/*/conversations/:id/messages
```

验收：

- 家长和老师能互发消息。
- 有未读数和已读状态。

## 3. 给 Codex 的任务模板

```text
请在 apps/api 中实现教师端一日流程打卡 API：
1. GET /api/teacher/workflow/today
2. POST /api/teacher/workflow/:sessionId/steps/:stepId/check

要求：
- 使用 Prisma schema 中的 WorkflowSession 和 WorkflowStep。
- 做角色和班级权限校验。
- 增加 seed 数据或测试数据。
- 给出验证命令和接口示例。
```

## 4. 质量要求

- 每个模块先跑通最小闭环，再美化页面。
- 后端接口必须做角色权限校验。
- 写入类接口要有审计日志规划。
- 文件上传、微信登录、订阅消息放到第二阶段。
