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
- CP-01 到 CP-20 的核心业务代码主线已落地。
- CP-21、CP-22 与 UI-01 至 UI-09 已完成，并通过微信开发者工具与真机主链路验收。
- CP-23 至 CP-31 的生产化能力已完成代码实现和本地/隔离环境验证，覆盖微信登录、自动验证脚本、测试环境部署配置、local/S3 文件存储、图片消息、备份恢复、观测性、管理后台正式登录和发布门禁。
- CP-32 代码加固、最新重新定义的 CP-33/CP-33.1 安全接送、CP-34 学生级一日托管流程、CP-35 生活照护，以及 CP-36 每日托管报告代码闭环已完成；仍有真实 HTTPS、微信体验版、真机与门店业务验收项。
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
- 当前优先事项是接入真实 HTTPS 测试域名、微信公众平台合法域名和正式 AppSecret，执行 `verify:release`、备份恢复演练、体验版真机绑定，以及 CP-33 至 CP-36 的小范围业务试运行。

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
- 历史 CP-06 曾在班级打卡后同步生成 `GrowthRecord.workflow`；CP-34 已停止该自动行为，日常步骤改由 `StudentWorkflowStep` 保存，旧历史记录保留。

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

目标：解决历史静态原型与正式 Taro 小程序画面差异较大、底部导航页占位和已有 API 未完整接入前端的问题。该目标已在 UI-01 至 UI-09 中完成，后续 UI 工作应来自测试环境或试运行反馈。

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
- UI-01 至 UI-09 已通过后，项目已继续完成 CP-23 至 CP-31。后续不应再按旧 UI 阶段重复实现，除非试运行反馈明确要求微调。

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

### CP-27 家校沟通图片消息

状态：已完成，已通过自动业务闭环和微信开发者工具人工验收。

目标：在现有文字会话中补齐真实图片沟通能力，并复用 CP-26 文件存储。

范围：

- 教师端和家长端聊天页选择、拍摄、上传与预览图片。
- 消息接口支持 `kind = image` 和最多 3 个 `fileUrls`。
- 校验图片资源的上传场景、文件类型与发送者归属。
- 图片消息沿用会话未读数和 `readAt` 已读状态。

验收：

- 教师发送图片后，家长端刷新会话可以查看并预览。
- 家长发送图片后，教师端刷新会话可以查看并预览。
- 单张图片超过 10 MB 或格式不支持时显示明确提示。
- 其他用户上传的图片 URL 和伪造的系统消息被 API 拒绝。

验证命令：

```powershell
pnpm --filter @ruizhibo/api verify:message-images
pnpm --filter @ruizhibo/teacher-miniapp build
pnpm --filter @ruizhibo/parent-miniapp build
```

### CP-28 数据库与上传文件备份/恢复

状态：已完成实现、本地 Docker 备份/恢复回归和人工验收。

目标：降低 Docker 卷被误删、服务器故障或发布回滚时的业务数据丢失风险。

范围：

- 备份 PostgreSQL custom format 转储。
- local 存储模式同时备份 `uploads_data`。
- 生成包含时间、Git 版本、文件大小和 SHA-256 的清单。
- 恢复前强制校验，必须显式确认，并默认创建安全备份。
- S3/COS/OSS 模式明确使用桶版本控制或云平台快照。

验收：

- 运行备份后产生 `backup.json`、`database.dump` 和 local 模式的 `uploads.tar.gz`。
- `-ValidateOnly` 可校验正常备份，并拒绝损坏或与清单不一致的文件。
- 不传 `-ConfirmRestore` 时绝不写入数据库。
- 恢复前自动备份当前数据，恢复后 API 可重新启动。

验证命令：

```powershell
pnpm backup:deployment -- -ValidateOnly
pnpm backup:deployment
pnpm restore:deployment -- -BackupDirectory <backup-path> -ValidateOnly
pnpm restore:deployment -- -BackupDirectory <backup-path> -ConfirmRestore
```

### CP-29 请求追踪与结构化运行日志

状态：已完成实现、本地运行回归和人工验收。

目标：让小程序报障可以通过请求 ID 关联服务端日志，并防止容器日志无限增长。

范围：

- 为每个 HTTP 请求生成或透传受限格式的 `X-Request-Id`。
- 错误 JSON 返回同一 `requestId`，方便用户报障。
- 单行 JSON 访问日志记录方法、路径、状态码、耗时和可选用户标识。
- 日志不记录查询串、请求体、Authorization、微信 code 或密钥。
- Docker `json-file` 日志轮转同时覆盖 db、api 和 web。

验收：

- 安全客户端 ID 原样透传，过长或非法 ID 被 UUID 替换。
- 正常和错误响应都包含 `X-Request-Id`。
- 错误体 `requestId` 与响应头一致。
- API 日志可按 `requestId` 检索，且不包含请求体或 Token。
- Compose 配置校验通过，日志轮转大小和数量可配置。

验证命令：

```powershell
pnpm --filter @ruizhibo/api typecheck
pnpm --filter @ruizhibo/api build
pnpm --filter @ruizhibo/api verify:observability
docker compose --env-file deploy/.env -f deploy/docker-compose.test.yml config --quiet
```

### CP-30 管理后台正式登录

状态：已完成实现、自动回归和人工验收。

目标：关闭开发登录后，管理后台仍可通过独立、安全且可运维的管理员认证进入。

范围：

- `POST /api/auth/admin-login` 手机号/密码认证。
- 管理员密码初始化与重置 CLI，不把明文密码写入仓库或长期环境配置。
- 带随机盐的 scrypt 密码哈希、统一失败提示和登录限流。
- 8 小时管理员令牌、浏览器会话级存储和主动退出。
- 生产构建隐藏开发登录入口。

验收：

- 错误密码返回 401，正确密码可访问 `/api/me` 与管理员接口。
- 密码哈希不以明文存储，设置密码和登录成功均有审计记录。
- 连续失败达到阈值后返回 429，手机号与来源 IP 分别计数。
- 刷新当前标签页后会话保留，退出或关闭标签页后需要重新登录。
- `ENABLE_DEV_LOGIN=false` 时管理后台完整可用，生产包不包含开发登录按钮。

验证命令：

```powershell
pnpm --filter @ruizhibo/api typecheck
pnpm --filter @ruizhibo/api build
pnpm --filter @ruizhibo/admin-web typecheck
pnpm --filter @ruizhibo/admin-web build
$env:VERIFY_ADMIN_PASSWORD="<管理员密码>"
pnpm --filter @ruizhibo/api verify:admin-auth
```

### CP-31 测试环境正式发布闭环

状态：已完成实现和隔离 Docker 自动回归，等待真实 HTTPS 域名人工验收。

目标：在关闭开发登录后，用一条命令确认部署版本、认证、代理、安全配置和文件存储可以正式对外提供服务。

范围：

- 新增 `verify:release`，与保留给封闭开发环境的 `verify:deployment -RunApiSuite` 分离。
- `/api/health` 返回 `APP_VERSION`，验收时与预期 Git 提交比对。
- 检查 HTTPS、HSTS、常用安全响应头、CORS 允许/拒绝行为和请求 ID。
- 检查管理员正式登录、开发登录禁用和生产前端包不含开发入口。
- 使用管理员身份上传极小验证图片，并检查存储驱动和公开读取。
- 发布前创建并校验数据库/上传文件备份；恢复演练只在隔离环境执行。

验收：

- 预期版本不一致、缺少管理员密码或开发登录仍开启时门禁失败。
- 后台域名获得正确 CORS 响应，随机非法域名不获得授权。
- 正式管理员登录可访问受保护接口，生产包不包含 `/auth/dev-login`。
- local 或 s3 存储上传后可通过 HTTPS 公开读取。
- 教师端和家长端体验版各完成一次微信登录与数据隔离检查。

验证命令：

```powershell
$env:VERIFY_APP_VERSION="<git-commit-sha>"
$env:VERIFY_ADMIN_PASSWORD="<管理员密码>"
pnpm verify:release -- `
  -BaseUrl https://test.example.com/api `
  -AdminUrl https://test.example.com `
  -ExpectedCorsOrigin https://test.example.com `
  -ExpectedStorageDriver local `
  -RequireHttps
```

### CP-32 真实上线验收与儿童数据安全加固

状态：**代码已完成；整体为 `WAITING_FOR_EXTERNAL_ACCEPTANCE`。**

本节 CP-32 以 `docs/project-audit-and-next-roadmap.md` 第 12 节为唯一来源，不沿用任何历史同号提案。

代码完成范围：

- workflow 图片保存前要求 FileAsset 存在、ownerId 为当前教师、scene 为 `workflow` 且 MIME 为图片。
- message、homework、workflow 复用统一的 FileAsset 归属策略。
- 教师端上传固定使用 `scene=workflow`，上传失败保留照片并给出明确反馈。
- 自动回归覆盖当前教师 workflow 成功、message/homework scene 拒绝、跨教师拒绝和不存在资产拒绝。
- `verify:all` 增加完整 HTTP 回归；`verify:release` 增加策略门禁和生产配置审计。
- 管理后台深度回归改为从环境变量读取管理员密码和预期版本，不再在代码中保存测试密码。

不包含：管理员账号管理、学生级流程、安全接送、生活记录、日报/周报、招生收费、经营看板、订阅消息或 AI。

外部验收项（`WAITING_FOR_EXTERNAL_ACCEPTANCE`）：

- 真实 HTTPS 测试域名、可信证书和 Caddy 外网入口。
- 微信公众平台 request、uploadFile、downloadFile 合法域名。
- 教师端、家长端正式 AppID/AppSecret 部署配置。
- 两端体验版真机登录/绑定、数据隔离与 workflow 图片链路。
- 隔离环境完整恢复演练。

验证命令：

```powershell
pnpm --filter @ruizhibo/api verify:workflow-image-policy
pnpm --filter @ruizhibo/api verify:workflow-images
pnpm --filter @ruizhibo/api verify:all
pnpm verify:production-config -- -EnvPath deploy/.env -RequireHttps
pnpm verify:release -- -DeploymentEnvPath deploy/.env -RequireHttps <其他发布参数>
```

### CP-33 安全接送与到离店闭环

状态：**代码已完成；真机和真实门店交接为 `WAITING_FOR_EXTERNAL_ACCEPTANCE`；该轮完成后曾停止，CP-34 后续另行授权。**

编号说明：本节是 2026-08-17 最新路线重新定义的业务 CP-33，替代历史同编号“发布流水线与回滚演练”。历史提案不再是 CP-33 的任务来源。

目标：

- 形成“学校接到 → 安全到店 → 托管中 → 离店 → 接送人确认 → 家长查看”的可追溯责任链。
- 复用 `AttendanceEvent` 作为到离店兼容事实，同时用安全接送领域模型保存经办人、授权、快照与异常。

数据库与安全：

- `StudentGuardian` 增加 `canPickup`；新增 `AuthorizedPickupPerson`、`PickupRecord` 及接送关系/事件/到店方式/交接状态枚举。
- 接送事实按 UTC+8 中国业务日保存，唯一约束阻止同一学生同日同节点重复创建，并为学生、班级、教师、校区、状态和异常高频查询建立索引。
- 离店保存接送人姓名、关系、电话快照；正常离店只允许 active 且有权限的监护人或有效授权人。
- 家长送达到店可关联具体 active 监护人/授权人并保存送达人快照；后端拒绝跨学生送达人引用。
- `AttendanceEvent.absence` 统一驱动教师/家长“请假”状态，并从管理员“今日未到店”中排除。
- 临时/异常交接强制记录人员、联系方式和处理结果；异常额外要求原因。
- 创建接送事实、同步 `AttendanceEvent`、写审计日志在同一事务完成；不提供修改或删除接送事实 API。
- 历史接送记录会阻止关联教师、家长、班级或学生被强制删除，管理操作应改为停用或结业。

API 与界面：

- 教师：今日班级/学生状态列表，学校接到、安全到店、直接到店和严格离店确认；支持状态快速分组、整组多选、批量学校接到/安全到店，临时授权与异常接送使用明确标签。
- 家长：首页今日状态及历史时间线，仅允许 active 监护关系读取，电话快照掩码显示；到店/离店卡片展示经办教师，并可显示具体送达人。
- 管理员：维护非账号型授权接送人；按日期、学生、班级、教师、状态、异常查询；快捷查看今日未到店、今日未离店和异常接送；班级读取根层快照，占位项无虚假事件时间。
- 客户端用同步请求锁在网络请求发出前阻断重复确认，服务校验和数据库唯一约束继续作为后端兜底。

自动验收：

```powershell
pnpm --filter @ruizhibo/api verify:pickup
pnpm --filter @ruizhibo/api verify:all
pnpm typecheck
pnpm build
```

`verify:pickup` 覆盖规定的 14 个正常、权限、重复、异常与考勤兼容场景，并增加请假三端一致、具体送达人/跨学生拒绝、批量原子写入及重复拒绝、管理员正确班级与空事件时间、快捷筛选和历史不可删除保护。脚本保留不可变事实并停用隔离测试主体，只能在本地或专用测试数据库运行。

不包含：学生级完整一日 workflow、接送照片、历史纠错/冲正、生活记录、日报/周报、AI、招生、套餐、收费、续费、经营看板、订阅消息、CI/CD、SaaS 或多租户。

外部验收项（`WAITING_FOR_EXTERNAL_ACCEPTANCE`）：

- 教师端和家长端在微信开发者工具及真机完成今日接送、历史查看、重复点击和失败反馈验收。
- 两个真实微信账号验证跨班级、跨家庭数据隔离和停用接送人保护。
- 在真实门店交接流程中核对学校接到、家长送达、授权离店、临时/异常离店与管理端追溯。
- 使用 10 名真实/脱敏测试学生完成一次批量学校接到、批量安全到店和逐人离店的放学高峰试运行。

### CP-33.1 安全接送审查修复

状态：**代码已完成；外部界面/真机确认仍为 `WAITING_FOR_EXTERNAL_ACCEPTANCE`；CP-34 后续另行授权。**

范围严格限定为两项安全修复：

- 监护人正常接送权改为显式授权：schema、后端和管理后台新增绑定均默认 `canPickup=false`；新 migration 撤销 CP-33 默认值带来的历史自动授权，seed 和验证数据按需要显式授权。
- 缺勤与接送事实双向互斥：所有单个/批量接送节点在服务事务内检查缺勤，数据库 trigger 以同一学生/中国业务日的 advisory lock 阻止并发写入；任意接送事实存在时，数据库拒绝新增 `AttendanceEvent.absence`。

验证补充：

- active 但 `canPickup=false` 的 Guardian 正常离店被拒绝，管理员明确授权后成功。
- absence 后学校接到被拒绝，学校接到后新增 absence 被拒绝。
- 模拟升级前 `picked_up + absence` 冲突后，单个到店被拒绝；包含冲突学生的批量到店整体失败且无半成功。

限制：migration 不删除历史责任数据，升级前已存在的冲突需要人工审查；当前产品没有登记缺勤的业务写 API，数据库保护覆盖现有验证 fixture、直接 Prisma 写入和未来遵循数据库的写入口。

### CP-34 学生级一日托管流程

状态：**代码已完成；真实微信、真机高频操作和管理端人工验收为 `WAITING_FOR_EXTERNAL_ACCEPTANCE`；CP-35 后续已获单独授权。**

目标与模型：

- 保留班级级 `WorkflowTemplate`、`WorkflowSession`、`WorkflowStep`，只在 `WorkflowStep` 下新增 `StudentWorkflowStep`，不创建平行的学生 session。
- 学生步骤支持 `pending`、`completed`、`skipped`、`exception`；缺勤继续来自 `AttendanceEvent.absence` 并动态合成 `absent`。
- 学生事实保存完成/处理时间、经办教师、个人照片和备注；唯一约束保证一个学生在同一步骤只有一条事实，历史删除使用 `RESTRICT` 保护。
- `WorkflowStep.checked` 重新定义为 active、非缺勤学生均不再 pending；完成、跳过和异常均视为已处理，状态变化后同步 `checkedAt` 与最后经办教师。

API 与安全：

- `GET /api/teacher/workflow/today` 在旧结构上增加学生明细与汇总，并对当天已有 session 幂等补齐缺失事实。
- 新增单学生 `complete`、`skip`、`exception` 和可选 `studentIds` 的 `batch-complete`；旧 `/check` 继续作为全班批量兼容入口。
- 单人状态只允许从 pending 进入终态；跳过/异常原因必填；重复和终态改写返回 `409`。
- 批量操作使用事务、步骤级 advisory lock 和 pending 条件更新，不覆盖 completed/skipped/exception；显式列表包含非法或缺勤学生时整批失败。
- 教师权限检查 session、step、负责班级、学生班级和 active 状态；家长查询通过 active `StudentGuardian` 隔离。
- 班级与个人照片分别保存，继续复用 `FileAsset ownerId + scene=workflow + imageOnly` 策略。

界面：

- 教师端以步骤为中心展示完成/待处理/跳过/异常/缺勤汇总，支持全部/待处理/已完成/异常等快捷筛选、批量完成、个人轻量详情及今日时间线。
- 家长首页增加“今日托管进度”，聚合安全到店与真实步骤，可查看异常说明和个人照片。
- 管理后台增加只读“学生托管流程”，支持日期、班级、教师、学生、状态筛选和完整步骤详情，不提供历史修改/删除。

数据语义：

- 普通 workflow 操作不再自动生成 `GrowthRecord`；旧历史记录不删除。
- `StudentWorkflowStep` 是日常执行事实，`GrowthRecord` 继续用于值得长期保留的成长事件，后续日报可直接聚合前者。

自动验收：

```powershell
pnpm --filter @ruizhibo/api verify:student-workflow
pnpm --filter @ruizhibo/api verify:all
pnpm typecheck
pnpm build
```

`verify:student-workflow` 覆盖规定 24 个初始化、状态转换、缺勤、权限、图片、批量原子性、旧接口、家长隔离、GrowthRecord 停写与 Dashboard 一致性场景，并已接入 `verify:all`。

外部验收项（`WAITING_FOR_EXTERNAL_ACCEPTANCE`）：

- 真机验证 completed/skipped/exception/absent 同步显示和家长隔离。
- 20 名脱敏学生执行“批量 17 人 + 1 跳过 + 1 异常 + 1 缺勤”的高频操作试运行。
- 真机验证个人 workflow 图片上传、预览和失败反馈；管理后台确认筛选与详情只读。

### CP-35 生活照护与异常记录

状态：**代码已完成；真实微信、20 人班高频操作及跨端展示为 `WAITING_FOR_EXTERNAL_ACCEPTANCE`；CP-36 后续已另行授权。**

目标与模型：

- 使用统一 `StudentCareRecord` 保存 `meal/water/rest/mood/exception`，字段受控且不使用万能 JSON；历史学生关系 `RESTRICT`、经办教师 `SET NULL`，不级联删除照护事实。
- 用餐只覆盖托管业务需要的 `snack/dinner`，值为 `good/normal/little/refused`；数据库 partial unique index 保证学生/业务日/餐次唯一。
- 主要休息每天一条，值为 `slept/rested/no_rest`，时长有合理范围；饮水每次生成数量 1 的事实，情绪和异常允许一天多条。
- 异常要求原始备注，可保存受控类别、非医疗处理、`needsAttention` 和可选照片；异常不提供更新/删除接口。

API 与安全：

- 教师查询一次返回负责班级学生、当天所有照护事实、缺勤和接送上下文，避免逐学生 N+1。
- 单学生按类型拆分明确 DTO；教师只能操作自己负责班级中的 active 学生，缺勤学生全部拒绝。所有照护类型（含异常）均以 `happenedAt` 受离店时间限制；离店后仍可补录发生于离店前的历史事实。
- 批量用餐、饮水、休息必须显式传 `studentIds`，在同一事务中预检并全部提交；用餐/休息只补齐未处理学生，不覆盖既有例外。
- 照护图片使用 `scene=care`，保存前统一验证当前教师 owner、scene、图片 MIME 和文件存在；家长只通过 active 监护关系读取安全展示字段。
- 管理端接口只读、默认中国业务日、显式范围最多 31 天并数据库分页，支持日期、班级、教师、学生、类型、今日异常和需要关注筛选。

界面：

- 教师首页新增“今日照护”，页面按班级展示汇总、接送提示、批量正常操作和单学生例外/异常编辑，前端锁阻止重复点击。
- 家长首页“今日托管进度”下新增“今日生活”，展示餐食、饮水次数、休息、最近情绪及全部异常；需要关注的异常优先突出。
- 管理后台业务面板新增“生活照护记录”，提供只读筛选和详细字段展示，无历史修改/删除入口。

数据语义与边界：

- `StudentCareRecord` 是日常事实，不自动写 `GrowthRecord`，不复制或修改 Pickup/Workflow；CP-36 每日托管报告只做查询聚合。
- 本 CP 不做医疗诊断、用药、每日/周报、AI、复杂营养或其他后续业务。

自动验收：

```powershell
pnpm --filter @ruizhibo/api verify:care-records
pnpm --filter @ruizhibo/api verify:all
pnpm typecheck
pnpm build
```

`verify:care-records` 覆盖规定的 30 个正反向场景，并已接入 `verify:all`：类型/字段校验、更新与追加语义、批量原子性和例外保护、教师/家长权限、缺勤、图片 owner/scene、家长安全投影、管理端日期范围，以及不生成 GrowthRecord、不修改 Pickup/Workflow。

外部验收项（`WAITING_FOR_EXTERNAL_ACCEPTANCE`）：

- 20 名脱敏学生执行“17 正常 + 1 少量 + 1 未进食 + 1 缺勤”，确认批量 normal 不覆盖例外/缺勤，并验证 10 秒级操作目标。
- 真机确认家长今日生活摘要、异常关注提示、照护图片上传/预览/失败反馈和离店后的操作限制。
- 模拟 17:20 学生表示头疼，验证教师记录、家长查看及管理端“今日异常/需要关注”筛选一致。

### CP-36 每日托管报告

状态：**代码已完成；真实微信、真实儿童数据及 20 人班体验为 `WAITING_FOR_EXTERNAL_ACCEPTANCE`；完成后停止，不进入 CP-37。**

架构与语义：

- 新增共享 `DailyReportModule` / `DailyReportService`，按 Asia/Shanghai 业务日实时聚合现有 Pickup/Attendance、StudentWorkflowStep、StudentCareRecord、HomeworkSubmission 和家长可见 GrowthRecord。
- 不建立日报事实快照，不复制或改写底层事实；报告 GET 严格零写入。唯一持久化新增是教师文本寄语 `StudentDailyReportNote`。
- 总体状态优先级为 `absence > left_center > arrived_at_center > picked_up_from_school > waiting_pickup`；缺勤使用专用模式，不把无数据解释为失败或异常。
- 流程区分 completed、skipped、exception、pending，生活照护区分“无记录”和正常；接送使用历史快照且 Attendance 只作不重复 fallback。
- 作业按明确业务日规则归属并只出现一次；GrowthRecord 只包含当天 `visibleToParent=true` 的记录。关注项按接送安全、Care needsAttention、其他 Care exception、Workflow exception、Homework overdue 排序。

API 与安全：

- 家长日报仅 active 监护关系可访问，默认今天、历史最多 90 天，跨家庭返回 `404`；不返回草稿、其他学生、内部记录 ID、电话或 FileAsset 元数据。
- 教师列表、详情与寄语接口只允许本人负责班级，列表摘要/详情分离，历史查看最多 31 天，寄语只允许编辑当前业务日。
- 管理端列表/详情只读，一次查询一个业务日；筛选、计数和候选学生分页在数据库完成，再批量聚合当前页。
- `StudentDailyReportNote` 以学生+业务日唯一，学生外键 `RESTRICT`、教师外键 `SET NULL`；保存、发布、取消发布均审计，家长只看 `publishedAt != null` 的寄语。

三端界面：

- 教师工作台新增“今日报告”，支持班级/状态/关注筛选、摘要、学生完整预览和寄语草稿/发布，并阻止重复提交。
- 家长首页新增今日摘要入口，完整报告支持上一天、下一天和日期选择，明确展示缺勤、无记录、异常和个人图片。
- 管理后台业务面板新增每日托管报告，支持校区、班级、教师、学生、状态、异常、关注、发布及分页筛选，详情只读。

自动验收：

- 新增 `verify:daily-report` 80 场景并接入 `verify:all`，覆盖聚合规则、历史日期、权限、隐私、零副作用、实时刷新、分页和无数据语义。
- API、教师端、家长端和管理端 typecheck/build、Prisma validate/migration status 作为完成门禁。

外部验收项（`WAITING_FOR_EXTERNAL_ACCEPTANCE`）：

- 真实 20 人班教师日报列表操作速度、异常识别与信息密度。
- 真实微信教师/家长日报、历史日期切换、个人图片/失败反馈、临时授权接送和寄语草稿/发布。
- 使用脱敏的真实业务样例核对儿童数据最小化及三端事实一致性。

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
CP-23 -> CP-24 -> CP-25 -> CP-26 -> CP-27 -> CP-28 -> CP-29 -> CP-30 -> CP-31 -> CP-32 -> CP-33（安全接送） -> CP-33.1 -> CP-34（学生级流程） -> CP-35（生活照护） -> CP-36（每日托管报告）
```

当前建议优先执行：

```text
CP-32 外部验收、CP-33 接送真机/真实门店验收、CP-34 学生流程、CP-35 生活照护及 CP-36 日报真机高频验收；不自动进入 CP-37
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
