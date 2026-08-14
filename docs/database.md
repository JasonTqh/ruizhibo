# 数据库设计

后端使用 PostgreSQL + Prisma。当前 schema 位于：

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
  Class ||--o{ Notice : receives
  User ||--o{ Notice : publishes
  Notice ||--o{ NoticeReceipt : tracks
  Student ||--o{ NoticeReceipt : for
  User ||--o{ NoticeReceipt : confirms
  Campus ||--o{ ResearchActivity : hosts
  User ||--o{ ResearchActivity : organizes
  ResearchActivity ||--o{ ResearchParticipant : has
  User ||--o{ ResearchParticipant : joins
```

## 2. 用户与权限

`User` 同时承载管理员、老师、家长。

关键字段：

- `role`: `admin`、`teacher`、`parent`
- `phone`: 手机号，可用于绑定和登录
- `wechatOpenid`: 微信登录身份
- `passwordHash`: 管理员正式登录密码哈希，使用带随机盐的 scrypt 格式保存
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
- `isPrimary` 标记主要联系人，同一孩子只允许一个正常绑定关系为主要联系人。
- `canReceiveNotice`、`canSubmitHomework`、`canViewGrowth` 分别控制通知回执、作业提交、成长与考勤查看。
- `status` 支持 `active`、`pending`、`unlinked`；解绑采用状态变更而不是物理删除，以保留历史关系和审计记录。

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
- `HomeworkSubmission`: 每个学生对应的提交、图片附件和批改状态。

当前已支持家长提交文字或最多 6 个作业图片 URL。作业图片必须先通过 `POST /api/files` 以 `scene = homework` 上传，并属于当前家长。老师可将提交状态更新为 `reviewed` 并写入批改备注。

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

## 8. 通知、任务与家长回执

班级广播使用独立的 `Notice`，不复用一对一聊天消息：

- `kind = notice`：家长知晓类通知。
- `kind = task`：需要家长处理并确认的待办任务。
- `dueAt`：任务可选截止时间。
- `unboundStudentCount`：发布当时尚未绑定有效家长的学生数量。

发布时按当前 `StudentGuardian` 绑定为每个孩子、每位家长创建一条 `NoticeReceipt`。这是一份受众快照，因此同一家长的两个孩子需要分别确认，一个孩子的两位家长也各自拥有回执。

回执状态不额外存枚举：

- `viewedAt` 为空：未查看。
- `viewedAt` 有值、`confirmedAt` 为空：已查看待确认。
- `confirmedAt` 有值：已确认。

家长访问回执时仍会检查当前 `StudentGuardian` 绑定，解绑后的历史家长不能继续读取或确认。

## 9. 备课与教研

`LessonPlan` 保存教师教案，按教师和班级隔离，支持草稿、发布和归档状态。

`ResearchActivity` 保存校区范围内的教研活动，类型包括教学研讨、听课评课和教师培训，状态包括草稿、开放报名、已结束和已取消。`ResearchParticipant` 记录教师报名、参加或取消状态；活动草稿只对组织者可见，同校区教师只能维护自己的参与状态。

## 10. 文件资源

`FileAsset` 记录上传文件元数据：

- `url`: 静态访问地址或未来对象存储 URL。
- `mimeType`: 文件类型。
- `size`: 文件大小。
- `ownerId`: 上传用户。
- `scene`: 使用场景，例如 `workflow`、`homework`、`message`。
- `storageDriver`: 当前文件使用的存储驱动，例如 `local` 或 `s3`。
- `storageKey`: 本地相对路径或对象存储 key。

后端已支持 local 与 S3 兼容双驱动。开发和封闭测试环境可使用本地上传目录；生产或需要独立静态域名时可通过 S3 协议接入 COS、OSS、AWS S3 或 MinIO。配置和验证流程见 `docs/file-storage.md`。

## 11. 审计日志

`AuditLog` 记录关键操作：

- 管理员创建/更新老师、班级、学生
- 管理员绑定/解绑家长
- 管理员创建/更新流程模板
- 管理员正式登录
- 管理员调整教案和教研活动状态
- 教师流程打卡
- 教师创建教学记录、备课计划、教研活动、成长反馈、作业
- 教师更新教案状态
- 家长提交或重新提交作业
- 教师更新作业提交状态
- 教师发布通知/任务
- 家长确认通知/任务
- 教师创建、编辑和变更教研活动状态
- 教师报名或取消报名教研活动

这对托管机构运营很重要。
