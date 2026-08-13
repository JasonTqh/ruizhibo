# 分阶段开发计划

本计划将项目拆成一组可独立完成、独立验证、独立提交的变更提案。每个提案都应遵循同一节奏：

1. 明确本次只改哪些模块。
2. 实现一个可运行的最小闭环。
3. 补充或更新 seed 数据、接口示例、必要文档。
4. 运行最小相关验证命令。
5. 确认通过后再进入下一个提案。

## 当前基线

- 当前主线：`main`
- 后端：NestJS + Prisma + PostgreSQL
- 管理后台：React + Vite + Ant Design
- 小程序：Taro React 教师端、家长端
- CP-01 到 CP-20 的核心代码主线已落地并进入联调阶段。
- 其中 CP-17 目前是后端微信登录/手机号绑定占位实现，小程序端仍默认使用 dev-login；生产微信登录闭环放入 CP-23 继续完成。
- CP-18 目前是本地文件存储实现；生产对象存储放入 CP-26 继续完成。
- CP-21 小程序体验回归和 CP-22 环境配置抽离已完成第一轮实现。
- 额外已完成家长提交作业与独立聊天页：
  - 家长端 `POST /api/parent/homework-submissions/:submissionId/submit`
  - 家长小程序 `homework` 页面提交作业
  - 教师/家长小程序 `messages` 列表与 `chat` 详情页
- 额外已完成通知/任务回执能力：
  - 教师端 `GET/POST /api/teacher/notices`
  - 教师端 `GET /api/teacher/notices/:noticeId/receipts`
  - 家长端 `GET /api/parent/notices`
  - 家长端 `POST /api/parent/notice-receipts/:receiptId/view`
  - 家长端 `POST /api/parent/notice-receipts/:receiptId/confirm`
- UI-01 至 UI-09 已完成，并通过微信开发者工具与真机人工验收；当前优先执行 CP-23 微信登录生产闭环。

## 阶段 1：后端基础能力补齐

### CP-01 管理后台基础数据 CRUD

目标：让管理员可以维护老师、班级、学生和家长绑定关系，为后续教师端和家长端提供真实业务数据。

范围：

- 新增 `apps/api/src/modules/admin`
- 管理老师：
  - `GET /api/admin/teachers`
  - `POST /api/admin/teachers`
  - `PATCH /api/admin/teachers/:id`
- 管理班级：
  - `GET /api/admin/classes`
  - `POST /api/admin/classes`
  - `PATCH /api/admin/classes/:id`
- 管理学生：
  - `GET /api/admin/students`
  - `POST /api/admin/students`
  - `PATCH /api/admin/students/:id`
- 管理家长绑定：
  - `POST /api/admin/students/:studentId/guardians`
  - `DELETE /api/admin/students/:studentId/guardians/:guardianId`

实现要点：

- 只有 `admin` 角色可访问。
- 老师和家长复用 `User` 表，学生只使用 `Student` 表。
- 手机号需要唯一性校验。
- 删除家长绑定只删除 `StudentGuardian`，不要删除家长用户。
- 返回结构统一使用 `{ data: ... }`。
- 先实现列表、创建、局部更新，不做复杂分页；如数据量变大再补分页。

验收：

- 管理员 token 可以创建老师、班级、学生、家长绑定。
- 老师和家长 token 访问管理接口会被拒绝。
- 创建后的数据能在列表接口查到。
- 重复手机号、无效班级 ID、无效学生 ID 有明确错误。

验证命令：

```powershell
pnpm --filter @ruizhibo/api typecheck
pnpm --filter @ruizhibo/api build
pnpm --filter @ruizhibo/api seed
```

建议提交信息：

```text
feat(api): add admin master data endpoints
```

### CP-02 统一角色权限与错误格式

目标：把鉴权、角色权限和错误响应整理成可复用基础设施，避免后续每个模块重复写判断。

范围：

- 新增或完善角色 Guard / Decorator：
  - `@Roles("admin")`
  - `@Roles("teacher")`
  - `@Roles("parent")`
- 统一错误响应格式：

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "无权访问该资源"
  }
}
```

实现要点：

- 保留现有 `AuthGuard` 的 token 验证职责。
- 角色判断独立出来，供 admin、teacher、parent 模块复用。
- 常见错误映射：
  - 未登录：`UNAUTHORIZED`
  - 无权限：`FORBIDDEN`
  - 参数错误：`BAD_REQUEST`
  - 资源不存在：`NOT_FOUND`
  - 业务冲突：`CONFLICT`

验收：

- `/api/me` 行为不回退。
- 管理接口继续只允许 admin。
- 错误响应格式稳定。
- 前端可以根据 `error.code` 做统一提示。

验证命令：

```powershell
pnpm --filter @ruizhibo/api typecheck
pnpm --filter @ruizhibo/api build
```

建议提交信息：

```text
feat(api): standardize roles and error responses
```

### CP-03 API 文档与本地验证脚本

目标：让每个已完成接口都能被快速验证，减少手工试接口的成本。

范围：

- 更新 `docs/api.md`
- 可选新增 `apps/api/http` 或 `docs/http` 示例请求文件
- 补充本地验证步骤：
  - 管理员登录
  - 老师登录
  - 家长登录
  - 创建老师、班级、学生、绑定家长

实现要点：

- 文档中写清楚请求体、响应体、错误码。
- 示例使用 seed 数据手机号：
  - 管理员：`13800000000`
  - 老师：`13800000001`
  - 家长：`13800000002`
- 不把真实密钥写入文档。

验收：

- 新开发者可以只看文档完成本地启动和接口验证。
- 文档示例与真实接口一致。

验证命令：

```powershell
pnpm --filter @ruizhibo/api build
```

建议提交信息：

```text
docs(api): add local verification examples
```

## 阶段 2：教师端工作闭环

### CP-04 教师工作台和班级接口

目标：让教师登录后能看到自己负责的班级、学生和今日待办，为小程序教师端首页提供数据。

范围：

- `GET /api/teacher/dashboard`
- `GET /api/teacher/classes`
- `GET /api/teacher/classes/:classId/students`

实现要点：

- 只有 `teacher` 角色可访问。
- 老师只能看到自己负责的班级。
- 学生列表只返回必要摘要字段。
- dashboard 先返回今日班级、学生数、待打卡流程数等基础统计。

验收：

- 老师 token 可以看到自己的班级。
- 老师访问不属于自己的班级学生列表会被拒绝或返回不存在。
- 管理员、家长不能访问教师端接口。

验证命令：

```powershell
pnpm --filter @ruizhibo/api typecheck
pnpm --filter @ruizhibo/api build
```

建议提交信息：

```text
feat(api): add teacher dashboard and class endpoints
```

### CP-05 一日流程模板管理

目标：让管理员可以维护一日流程模板，为教师端每日流程实例提供来源。

范围：

- `GET /api/admin/workflow-templates`
- `POST /api/admin/workflow-templates`
- `PATCH /api/admin/workflow-templates/:id`

实现要点：

- 一个模板包含多个步骤 `WorkflowTemplateStep`。
- 步骤字段包括：`stepKey`、`name`、`timeRange`、`sortOrder`、`requirePhoto`。
- 同一个模板内 `stepKey` 唯一。
- 更新模板时要谨慎处理历史流程；第一版可以只允许编辑模板自身，不回写历史 session。

验收：

- 管理员能创建模板和步骤。
- 模板列表能返回步骤。
- 禁用模板后不再用于新建今日流程。

验证命令：

```powershell
pnpm --filter @ruizhibo/api typecheck
pnpm --filter @ruizhibo/api build
pnpm --filter @ruizhibo/api seed
```

建议提交信息：

```text
feat(api): add workflow template management
```

### CP-06 教师一日流程打卡

目标：教师可以获取今日流程并完成步骤打卡，刷新后状态保留。

范围：

- `GET /api/teacher/workflow/today`
- `POST /api/teacher/workflow/:sessionId/steps/:stepId/check`

实现要点：

- 老师只能操作自己负责班级的流程。
- 如果当天没有 `WorkflowSession`，可基于激活模板自动创建。
- 创建 session 时复制模板步骤到 `WorkflowStep`。
- 打卡时记录：
  - `checked = true`
  - `checkedAt`
  - `teacherId`
  - 可选 `photoUrls`
- 打卡后可同步生成 `GrowthRecord`，类型为 `workflow`。

验收：

- 第一次访问今日流程会返回可打卡步骤。
- 打卡后再次查询，步骤状态仍为已打卡。
- 非负责老师不能打卡该班级流程。
- 家长后续可以从成长记录看到流程摘要。

验证命令：

```powershell
pnpm --filter @ruizhibo/api typecheck
pnpm --filter @ruizhibo/api build
```

建议提交信息：

```text
feat(api): add teacher workflow check-in
```

### CP-07 教学记录与成长反馈

目标：教师能记录教学内容和学生成长反馈，为家长端时间线提供核心内容。

范围：

- `GET /api/teacher/teaching-records`
- `POST /api/teacher/teaching-records`
- 可选新增：
  - `POST /api/teacher/students/:studentId/growth-records`

实现要点：

- 老师只能给自己班级的学生写记录。
- 教学记录写入 `TeachingRecord`。
- 成长反馈写入 `GrowthRecord`，类型为 `teacher_feedback`。
- 支持 `visibleToParent` 控制家长是否可见。

验收：

- 老师可以创建班级教学记录。
- 老师可以给学生写可见或不可见的成长反馈。
- 非本班学生不能被该老师写反馈。

验证命令：

```powershell
pnpm --filter @ruizhibo/api typecheck
pnpm --filter @ruizhibo/api build
```

建议提交信息：

```text
feat(api): add teaching records and growth feedback
```

## 阶段 3：家长端查看闭环

### CP-08 家长孩子列表与成长时间线

目标：家长登录后可以看到绑定孩子，并查看孩子的成长记录。

范围：

- `GET /api/parent/children`
- `GET /api/parent/children/:studentId/timeline`

实现要点：

- 只有 `parent` 角色可访问。
- 家长只能看到自己绑定的孩子。
- 时间线只返回 `visibleToParent = true` 的记录。
- 按 `happenedAt` 倒序返回。
- 可先不做分页，保留 `limit` 参数。

验收：

- seed 家长可以看到张小明。
- 家长能看到教师打卡、成长反馈产生的记录。
- 家长访问未绑定学生会被拒绝或返回不存在。

验证命令：

```powershell
pnpm --filter @ruizhibo/api typecheck
pnpm --filter @ruizhibo/api build
```

建议提交信息：

```text
feat(api): add parent children and timeline endpoints
```

### CP-09 家长端作业与出勤查询

目标：补齐家长端首页常用信息：出勤状态和作业提醒。

范围：

- `GET /api/parent/children/:studentId/attendance`
- `GET /api/parent/children/:studentId/homework`

实现要点：

- 仍然复用家长-学生绑定权限。
- 出勤来自 `AttendanceEvent`。
- 作业来自 `HomeworkAssignment` 和 `HomeworkSubmission`。
- 第一版可按最近 7 天返回。

验收：

- 家长能看到绑定孩子的出勤记录。
- 家长能看到作业标题、状态、截止时间、批改备注。
- 未绑定学生不可访问。

验证命令：

```powershell
pnpm --filter @ruizhibo/api typecheck
pnpm --filter @ruizhibo/api build
```

建议提交信息：

```text
feat(api): add parent attendance and homework endpoints
```

## 阶段 4：作业与沟通闭环

### CP-10 教师作业管理

目标：教师能发布作业并维护学生作业状态。

范围：

- `GET /api/teacher/homework`
- `POST /api/teacher/homework`
- `PATCH /api/teacher/homework-submissions/:submissionId`

实现要点：

- 老师只能给自己班级发布作业。
- 创建作业时为班级学生生成 `HomeworkSubmission`。
- 当前已扩展为家长可提交文字/图片，老师负责批改或更新状态。
- 状态支持：`pending`、`submitted`、`reviewed`、`overdue`。
- 作业状态变化可同步写入 `GrowthRecord`，类型为 `homework`。

验收：

- 老师发布作业后，班级每个学生都有提交记录。
- 老师能批改或更新状态。
- 家长端作业查询能看到最新状态。

验证命令：

```powershell
pnpm --filter @ruizhibo/api typecheck
pnpm --filter @ruizhibo/api build
```

建议提交信息：

```text
feat(api): add teacher homework management
```

### CP-11 家校沟通消息

目标：家长和老师围绕学生建立会话并互发消息。

范围：

- `GET /api/parent/conversations`
- `GET /api/parent/conversations/:conversationId/messages`
- `POST /api/parent/conversations/:conversationId/messages`
- `GET /api/teacher/conversations`
- `GET /api/teacher/conversations/:conversationId/messages`
- `POST /api/teacher/conversations/:conversationId/messages`

实现要点：

- 会话维度：`studentId + parentId + teacherId`。
- 家长只能访问自己的会话。
- 老师只能访问自己班级学生的会话。
- 当前主要支持文本消息，同时数据模型和 DTO 预留图片/文件 URL。
- `readAt` 可以先简单处理为读取消息列表时标记已读，或先留到下一提案。

验收：

- 家长能看到与老师的会话。
- 老师能看到负责班级学生对应的会话。
- 双方能发送和读取消息。
- 越权访问会被拒绝。

验证命令：

```powershell
pnpm --filter @ruizhibo/api typecheck
pnpm --filter @ruizhibo/api build
```

建议提交信息：

```text
feat(api): add parent teacher conversations
```

### CP-12 未读数与已读状态

目标：让沟通模块能在小程序里显示未读数。

范围：

- 会话列表返回 `unreadCount`
- 消息读取后更新 `readAt`
- 可选新增：
  - `POST /api/*/conversations/:conversationId/read`

实现要点：

- 只统计对方发送且当前用户未读的消息。
- 不要把自己发送的消息算未读。
- 先做轮询友好的接口，不接 WebSocket。

验收：

- 家长发送消息后，老师会话未读数增加。
- 老师读取后未读数清零。
- 老师回复后，家长端未读数增加。

验证命令：

```powershell
pnpm --filter @ruizhibo/api typecheck
pnpm --filter @ruizhibo/api build
```

建议提交信息：

```text
feat(api): add conversation unread counts
```

## 阶段 5：前端接入最小闭环

### CP-13 管理后台接入基础数据

目标：让 `admin-web` 能使用真实 API 管理老师、班级、学生和绑定关系。

范围：

- 登录或开发期 token 输入方式
- 老师管理页面
- 班级管理页面
- 学生管理页面
- 家长绑定操作

实现要点：

- 使用已有 React + Ant Design。
- 页面以表格和弹窗表单为主。
- 暂不做复杂视觉重构。
- API 请求统一封装，统一处理 token 和错误提示。

验收：

- 管理后台可以完成 CP-01 的核心操作。
- 刷新页面后数据仍然存在。
- 权限错误和参数错误能提示。

验证命令：

```powershell
pnpm --filter @ruizhibo/admin-web typecheck
pnpm --filter @ruizhibo/admin-web build
```

建议提交信息：

```text
feat(admin): connect master data pages to api
```

### CP-14 教师小程序接入工作台和流程打卡

目标：教师端小程序能显示真实班级和流程，并完成打卡。

范围：

- `apps/teacher-miniapp`
- 工作台页面接入 `GET /api/teacher/dashboard`
- 班级/学生页面接入教师班级接口
- 流程页面接入今日流程和打卡接口

实现要点：

- 开发期可先使用 dev-login 获取 token。
- Taro 请求封装放在统一位置。
- 流程打卡后立即刷新本地状态。

验收：

- 教师能看到自己的班级和学生。
- 教师能完成今日流程打卡。
- 打卡后重新进入页面状态仍然正确。

验证命令：

```powershell
pnpm --filter @ruizhibo/teacher-miniapp typecheck
pnpm --filter @ruizhibo/teacher-miniapp build
```

建议提交信息：

```text
feat(teacher-miniapp): connect dashboard and workflow api
```

### CP-15 家长小程序接入孩子和时间线

目标：家长端小程序能显示绑定孩子、今日成长、作业提醒，并支持进入作业页面提交。

范围：

- `apps/parent-miniapp`
- 首页接入孩子列表和时间线
- 成长页接入时间线
- 作业模块接入家长作业查询和提交接口

实现要点：

- 开发期可先使用 dev-login 获取 token。
- 一个家长多个孩子时提供切换能力。
- 时间线按类型显示不同样式。

验收：

- 家长能看到绑定孩子。
- 教师流程打卡或成长反馈后，家长端能看到记录。
- 未绑定学生不会出现在家长端。

验证命令：

```powershell
pnpm --filter @ruizhibo/parent-miniapp typecheck
pnpm --filter @ruizhibo/parent-miniapp build
```

建议提交信息：

```text
feat(parent-miniapp): connect children and timeline api
```

### CP-16 小程序家校沟通接入

目标：家长端和教师端都能使用会话和消息接口。

范围：

- `apps/parent-miniapp`
- `apps/teacher-miniapp`
- 会话列表
- 消息列表
- 发送文本消息
- 未读数展示

实现要点：

- 第一版使用轮询或手动刷新。
- 文本输入和发送状态要处理 loading。
- 错误时保留用户输入，避免消息丢失。

验收：

- 家长和老师能互发文本消息。
- 未读数能正确变化。
- 越权会话不会展示。

验证命令：

```powershell
pnpm --filter @ruizhibo/parent-miniapp build
pnpm --filter @ruizhibo/teacher-miniapp build
```

建议提交信息：

```text
feat(miniapps): add parent teacher messaging
```

## 阶段 6：生产化准备

### CP-17 微信登录接入

目标：替换开发期登录，接入微信小程序登录身份。

范围：

- `POST /api/auth/wechat-login`
- `POST /api/auth/bind-phone`
- 小程序端登录流程

实现要点：

- 后端使用微信 `code2Session` 获取 `openid`。
- 不在前端保存 `session_key`。
- 用户绑定逻辑以手机号或管理员预建用户为准。
- dev-login 保留为开发环境能力，生产环境关闭或限制。

验收：

- 家长/老师可通过微信登录进入对应端。
- 未绑定身份的微信用户有明确提示。
- 生产环境不能任意使用 dev-login。

验证命令：

```powershell
pnpm --filter @ruizhibo/api build
pnpm --filter @ruizhibo/parent-miniapp build
pnpm --filter @ruizhibo/teacher-miniapp build
```

建议提交信息：

```text
feat(auth): add wechat miniapp login
```

### CP-18 文件上传

目标：支持作业图片、流程打卡照片、沟通图片。

范围：

- `POST /api/files`
- `FileAsset` 写入
- 小程序上传接入

实现要点：

- 开发期可本地存储。
- 生产期预留腾讯云 COS 或阿里云 OSS 配置。
- 限制文件大小、mime type 和上传场景。
- 返回可访问 URL 和文件元数据。

验收：

- 老师流程打卡可以带照片。
- 沟通消息可以附带图片。
- 非法文件类型会被拒绝。

验证命令：

```powershell
pnpm --filter @ruizhibo/api build
```

建议提交信息：

```text
feat(api): add file upload endpoint
```

### CP-19 审计日志

目标：记录关键运营操作，便于后续追溯。

范围：

- 管理后台关键操作：
  - 修改学生资料
  - 修改家长绑定
  - 修改老师/班级
- 教师关键操作：
  - 补打卡
  - 修改作业状态
  - 删除或隐藏成长记录
- 可选新增：
  - `GET /api/admin/audit-logs`

实现要点：

- 复用 `AuditLog` 模型。
- 记录操作者、动作、目标类型、目标 ID、变更详情。
- 不记录敏感密钥或完整 token。

验收：

- 关键操作后能查到审计记录。
- 审计记录能说明谁在何时改了什么。

验证命令：

```powershell
pnpm --filter @ruizhibo/api build
```

建议提交信息：

```text
feat(api): add audit logging for critical actions
```

### CP-20 部署配置与上线检查

目标：准备一个可部署、可回滚、可排查的版本。

范围：

- 环境变量文档
- 数据库迁移流程
- 生产启动命令
- 健康检查
- 日志和错误排查说明

实现要点：

- 明确 `DATABASE_URL`、`JWT_SECRET`、微信 AppID/AppSecret 等变量。
- 确认 `.env` 不进 Git。
- 增加上线前 checklist。
- 后端保留 `/api/health`。

验收：

- 新环境可以按文档完成部署。
- 健康检查正常。
- 迁移和 seed 策略清楚。

验证命令：

```powershell
pnpm build
pnpm typecheck
```

建议提交信息：

```text
docs: add deployment checklist
```

## 阶段 7：真实试用版打磨

这一阶段不再追求大面积新增业务表，而是把已串通的核心链路打磨到可以让老师和家长试用。

### CP-21 小程序体验回归与细节修复

目标：围绕已接入真实 API 的小程序页面做体验回归，消除中文、状态提示和核心交互细节问题。

范围：

- 教师端和家长端所有页面中文文案。
- 加载态、空状态、错误态、重试入口。
- 表单必填校验和提交中状态。
- 作业提交/批改、通知回执、消息列表和聊天详情。

验收：

- 微信开发者工具中所有页面中文显示正常。
- API 请求失败时页面明确提示原因或可重试。
- 没有数据时不误导为业务数据为 0。
- 家长提交作业、教师批改、双方进入聊天详情的路径可顺畅完成。

验证命令：

```powershell
pnpm --filter @ruizhibo/teacher-miniapp typecheck
pnpm --filter @ruizhibo/teacher-miniapp build
pnpm --filter @ruizhibo/parent-miniapp typecheck
pnpm --filter @ruizhibo/parent-miniapp build
```

### CP-22 环境配置抽离

目标：移除前端硬编码 `http://localhost:3000/api`，支持本地、真机、测试和生产环境切换。

范围：

- `apps/admin-web`
- `apps/teacher-miniapp`
- `apps/parent-miniapp`
- `.env.example` 和相关文档

验收：

- 本地开发继续可用。
- 真机预览可配置为电脑局域网 IP。
- 测试/生产可配置为 HTTPS API 域名。

验证命令：

```powershell
pnpm typecheck
pnpm build
```

### 页面与功能完善支线（当前主线）

目标：解决历史静态原型与正式 Taro 小程序画面差异较大、部分底部导航页仍为占位页、已有 API 未完整接入前端的问题。

详细开发范围、状态、验收标准和验证要求统一记录在：

```text
docs/ui-development-path.md
```

提案顺序：

- UI-01：双端首页与视觉基线。
- UI-02：教师教学记录、学生成长反馈和作业管理整合。
- UI-03：教师流程进度、分组打卡和拍照凭证。
- UI-04：家长成长、作业和“我的”页面完善。
- UI-05：通知、消息和聊天体验完善。
- UI-06：教师备课真实数据与页面。
- UI-07：教师教研真实数据与页面。
- UI-08：管理后台业务查询和配置入口补齐。
- UI-09：全页面回归、真机适配和最终人工验收。

状态：UI-01 至 UI-09 已全部完成，真机已跑通流程、作业、通知和聊天主链路。

约束：

- `archive/apps/teacher-app` 和 `archive/apps/parent-app` 只作为视觉与信息架构参考。
- 不把原型中的静态数量、假活动和仅弹提示的按钮复制到正式工程。
- UI-02 至 UI-05 优先复用现有 API；UI-06 至 UI-08 涉及新模型和接口时必须独立设计、迁移和验证。
- UI-09 通过后再继续 CP-23。

### CP-23 微信登录生产闭环

状态：代码实现与生产模式回归已完成，等待教师端、家长端配置正式 AppSecret 后各完成一次真机绑定验收。

目标：让小程序端从开发登录过渡到真实微信登录和手机号绑定。

范围：

- 小程序端调用 `wx.login`。
- 后端 `POST /api/auth/wechat-login` 与 `POST /api/auth/bind-phone` 联调。
- 生产环境关闭或限制 `POST /api/auth/dev-login`。
- 未绑定用户使用 10 分钟短期凭证和微信手机号授权完成后台预建账号匹配，不接受客户端明文手机号或 `openid`。

验收：

- 已绑定老师/家长可以通过微信进入对应端。
- 未绑定微信用户得到明确提示。
- 生产环境不能任意伪造角色登录。

验证命令：

```powershell
pnpm --filter @ruizhibo/api build
pnpm --filter @ruizhibo/teacher-miniapp build
pnpm --filter @ruizhibo/parent-miniapp build
```

### CP-24 教师/家长自动验证脚本

状态：已完成。

目标：把人工联调中的关键 API 链路沉淀成脚本，降低回归成本。

范围：

- 新增教师端验证脚本：工作台、流程、作业批改、通知/任务、消息和聊天详情。
- 新增家长端验证脚本：孩子、时间线、出勤、作业提交、通知查看确认、消息和聊天详情。
- 在 `apps/api/package.json` 增加对应脚本。

实现结果：

- 默认只读验证接口结构、身份、角色权限和家长数据隔离。
- `-IncludeWrites` 使用带时间戳数据验证教师发布、家长提交/确认及双向消息闭环。
- `verify:all` 串行执行管理员、教师和家长三套只读检查，供测试环境部署后运行。

验收：

- 本地 seed 后可以一键验证 admin、teacher、parent 三类 API。
- 脚本失败时能输出明确接口和错误内容。

验证命令：

```powershell
pnpm --filter @ruizhibo/api verify:admin
pnpm --filter @ruizhibo/api verify:teacher
pnpm --filter @ruizhibo/api verify:parent
```

### CP-25 测试环境部署

状态：部署基础设施已完成，待真实服务器、域名和微信公众平台配置后上线验收。

目标：准备一个可供内部试用的测试环境。

范围：

- 测试数据库。
- 后端服务。
- 管理后台访问地址。
- 微信小程序体验版合法域名。
- 上传目录或对象存储。

实现结果：

- 新增 PostgreSQL、API、管理后台/Caddy 的 Docker Compose 测试环境。
- API 容器启动时执行 Prisma migrations，数据库与上传目录使用持久化卷。
- Caddy 统一提供管理后台、API 和上传文件入口，真实域名下自动启用 HTTPS。
- `/api/health` 增加数据库连通性检查，并新增部署后验证脚本。
- 部署参数、微信合法域名、体验版构建、备份和回滚步骤见 `docs/test-environment-deployment.md`。

验收：

- `GET /api/health` 正常。
- 管理后台可通过测试域名访问。
- 微信开发者工具体验版可以访问测试 API。
- `docs/deployment-checklist.md` 可以逐项打勾。

### CP-26 文件存储生产化

状态：已完成。local 驱动与 S3 兼容驱动均已通过自动验证，MinIO 已完成真实上传、公开访问和元数据集成验收。

目标：把本地上传扩展为可用于测试/生产的存储方案。

范围：

- 保留当前 `POST /api/files` 接口协议。
- 增加 COS/OSS 或等价对象存储驱动。
- 补充上传失败、大小限制、类型限制的前端提示。

实现结果：

- 保留 `/api/files` 协议，新增 `local` 与 `s3` 可切换存储驱动。
- S3 兼容配置可用于 COS、OSS、AWS S3 和 MinIO，返回可配置的公开/CDN 地址。
- `FileAsset` 新增 `storageDriver`、`storageKey`，入库失败会补偿删除已上传对象。
- 后端校验 MIME 白名单、内容签名、声明大小和 10 MB 上限。
- 教师流程打卡和家长作业图片增加大小、格式和上传失败提示。
- 新增 `verify:storage` 及 MinIO Compose 覆盖配置。

验收：

- 流程打卡、消息或作业图片可上传并可访问。
- 上传文件元数据写入 `FileAsset`。
- 非法类型和超大文件被拒绝。

## 推荐执行顺序

严格建议按以下顺序推进：

```text
CP-01 -> CP-02 -> CP-03
CP-04 -> CP-05 -> CP-06 -> CP-07
CP-08 -> CP-09
CP-10 -> CP-11 -> CP-12
CP-13 -> CP-14 -> CP-15 -> CP-16
CP-17 -> CP-18 -> CP-19 -> CP-20
CP-21 -> CP-22
UI-01 -> UI-02 -> UI-03 -> UI-04 -> UI-05 -> UI-06 -> UI-07 -> UI-08 -> UI-09
CP-23 -> CP-24 -> CP-25 -> CP-26
```

当前建议优先执行：

```text
CP-23 微信登录生产闭环
CP-24 教师/家长自动验证脚本
```

## 每个提案的完成定义

一个变更提案只有同时满足以下条件，才算完成：

- 相关接口或页面功能可用。
- 权限校验通过正向和反向验证。
- seed 或文档能支撑本地手动验证。
- `typecheck` 和 `build` 通过。
- 没有无关重构和无关格式化。
- Git 工作区只包含本提案相关改动。

## 给 Codex 的通用任务模板

```text
请实现 CP-XX：<提案名称>。

要求：
- 只修改本提案相关文件。
- 先阅读 Prisma schema、现有 auth/prisma 模块和相关 docs。
- 遵循现有 NestJS/Taro/React 风格。
- 后端接口必须做角色权限校验。
- 返回结构保持 { data: ... }。
- 参数使用 DTO 校验。
- 补充必要 seed 数据或接口示例。
- 完成后运行相关 typecheck/build。
- 最后总结改动文件、验证命令和结果。
```
