# 数据库设计

后端使用 PostgreSQL + Prisma。Schema 初稿位于：

```text
apps/api/prisma/schema.prisma
```

## 1. 核心实体

```mermaid
erDiagram
  User ||--o{ Class : teaches
  Campus ||--o{ Class : has
  Class ||--o{ Student : has
  Student ||--o{ StudentGuardian : binds
  User ||--o{ StudentGuardian : parent
  Student ||--o{ AttendanceEvent : has
  Class ||--o{ WorkflowSession : has
  WorkflowSession ||--o{ WorkflowStep : has
  Class ||--o{ HomeworkAssignment : has
  HomeworkAssignment ||--o{ HomeworkSubmission : has
  Student ||--o{ GrowthRecord : has
  Student ||--o{ Conversation : has
  Conversation ||--o{ Message : has
```

## 2. 用户与权限

`User` 同时承载管理员、老师、家长。

关键字段：

- `role`: `admin`、`teacher`、`parent`
- `phone`: 手机号，可用于绑定和登录
- `wechatOpenid`: 微信登录身份
- `status`: 启用/禁用

权限原则：

- 家长只能访问自己绑定孩子的数据。
- 老师只能访问自己负责班级的数据。
- 管理员可以管理全校区数据。

## 3. 学生和家长绑定

`Student` 不登录系统，只与班级、家长、记录关联。

`StudentGuardian` 维护孩子和家长关系：

- 一个孩子可以绑定多个家长。
- 一个家长可以绑定多个孩子。

## 4. 一日流程

流程采用模板 + 每日实例：

- `WorkflowTemplate`: 流程模板。
- `WorkflowTemplateStep`: 模板步骤。
- `WorkflowSession`: 某班级某一天的流程实例。
- `WorkflowStep`: 实际打卡步骤。

这样可以保留历史记录，也能在未来调整模板。

## 5. 作业

作业分两层：

- `HomeworkAssignment`: 老师发布给班级的作业。
- `HomeworkSubmission`: 每个学生对应的提交和批改状态。

第一版可以由老师代录提交状态，后续再开放家长上传。

## 6. 成长记录

`GrowthRecord` 是家长端“今日成长”和“成长记录”的统一数据源。

来源可以是：

- 出勤事件
- 流程打卡摘要
- 作业状态
- 老师反馈
- 中心通知

## 7. 家校沟通

`Conversation` 以学生、家长、老师为维度创建会话。

`Message` 支持文本、图片、文件和系统消息。第一版可使用轮询，后续再升级 WebSocket 或实时推送。

## 8. 审计日志

`AuditLog` 记录关键操作：

- 删除或修改学生资料
- 修改家长绑定
- 补打卡
- 删除消息或记录

这对托管机构运营很重要。
