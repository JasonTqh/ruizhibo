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
  Student ||--o{ AuthorizedPickupPerson : authorizes
  Student ||--o{ PickupRecord : has
  StudentGuardian ||--o{ PickupRecord : hands_off
  AuthorizedPickupPerson ||--o{ PickupRecord : hands_off
  Student ||--o{ AttendanceEvent : has
  AttendanceEvent ||--o| PickupRecord : mirrors
  Class ||--o{ WorkflowSession : has
  WorkflowSession ||--o{ WorkflowStep : has
  WorkflowStep ||--o{ StudentWorkflowStep : tracks
  Student ||--o{ StudentWorkflowStep : performs
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
- `canReceiveNotice`、`canSubmitHomework`、`canViewGrowth`、`canPickup` 分别控制通知回执、作业提交、成长与考勤查看、正常离店接送授权。`canPickup` 是儿童交接权限，数据库默认值为 `false`，只能由管理员明确开启。
- `status` 支持 `active`、`pending`、`unlinked`；解绑采用状态变更而不是物理删除，以保留历史关系和审计记录。

## 4. 一日流程

流程采用模板 + 每日实例：

- `WorkflowTemplate`: 流程模板。
- `WorkflowTemplateStep`: 模板步骤。
- `WorkflowSession`: 某班级某一天的流程实例。
- `WorkflowStep`: 实际打卡步骤。
- `StudentWorkflowStep`: 该班当天某一步骤下，单个学生的执行事实。

这样可以保留历史记录，也能在未来调整模板。

CP-34 保留原有班级模板、每日实例和班级步骤，在 `WorkflowStep` 下增加学生维度，不新增平行的学生 session。`StudentWorkflowStep.status` 支持 `pending`、`completed`、`skipped`、`exception`；处理时间、经办教师、个人照片和备注随事实保存，`@@unique([workflowStepId, studentId])` 防止同一步骤产生重复学生事实。

缺勤不写入 workflow 状态枚举。当天 `AttendanceEvent.absence` 在查询时动态合成为 `effectiveStatus = absent`，因此考勤更正后无需批量修改 workflow 数据，且缺勤学生不能执行正常流程操作。

`WorkflowStep.checked` 保留并重新定义为：该步骤所有 active、非缺勤学生均已离开 `pending`。`completed`、`skipped`、`exception` 都算已处理，inactive/graduated 与当天缺勤学生不参与待处理计数。每次单人或批量操作后都会同步 `checked`、`checkedAt` 和最后经办教师，教师 Dashboard 继续通过它统计未完成步骤。

`WorkflowStep.photoUrls` 是班级步骤凭证，`StudentWorkflowStep.photoUrls` 是个人凭证，两者不互相复制。两类照片都复用 `FileAsset` 的 `ownerId + scene=workflow + imageOnly` 校验。学生事实对 `WorkflowStep` 和 `Student` 使用 `ON DELETE RESTRICT`，教师关系使用 `SET NULL` 保留事实本身。

### 4.1 安全接送与到离店

CP-33 在复用 `AttendanceEvent` 的基础上增加两个领域模型：

- `AuthorizedPickupPerson`：学生的非账号型授权接送人；姓名、关系使用枚举、电话、启停状态和备注由管理员维护。父母等已有家长继续复用 `StudentGuardian`，通过 `canPickup` 控制是否可正常接走。
- `PickupRecord`：不可随意修改或删除的接送事实，事件类型为 `picked_up_from_school`、`arrived_at_center`、`left_center`。记录学生、当时校区/班级、业务日期、发生时间、经办教师、操作者、到店方式、接送人快照、交接状态、异常原因和处理结果。

离店记录可关联 `StudentGuardian` 或 `AuthorizedPickupPerson`，但同时保存姓名、关系、电话快照，因此授权资料后续修改不会改变历史责任记录。`parent_delivered` 到店记录复用同一组关联和快照字段保存具体送达人；送达事实只要求 active 关系，不会错误地把 `canPickup = false` 理解为“不能送孩子到店”。临时授权和异常交接必须保存接送人信息、确认方式/处理结果；异常交接额外要求异常原因。

`serviceDate` 使用 UTC+8 中国业务日的零点表示。`@@unique([studentId, serviceDate, type])` 阻止同一学生同一天重复写入同一节点；学生、班级、教师、校区、交接状态和异常查询均有对应组合索引。

到店、离店创建时在同一数据库事务内复用或生成 `AttendanceEvent.arrive` / `AttendanceEvent.leave`，并由 `attendanceEventId` 关联，保持原有家长考勤和管理端查询兼容。学校接到不生成考勤事件。

当天的 `AttendanceEvent.absence` 同时参与教师和家长今日接送状态推导，并从管理员“今日未到店”候选中排除。CP-33.1 增加双向一致性保护：存在缺勤时不能写入任何 `PickupRecord`，存在任意接送事实时不能再写入缺勤；单个和批量接送使用同一规则。

由于互斥关系跨越 `AttendanceEvent` 和 `PickupRecord` 两张表，migration `20260817190000_harden_pickup_authorization_and_attendance` 使用两个 PostgreSQL trigger 和相同的 transaction-scoped advisory lock 做数据库兜底，避免“同时登记接送与缺勤”的竞态。服务层仍在事务内执行明确检查并返回业务 `409`。migration 不删除或覆盖升级前已经存在的冲突责任记录；这类历史数据只报告并停止继续流转，后续需要独立的人工核查/冲正提案。

同一 migration 将所有缺少明确授权证据的历史 `StudentGuardian.canPickup` 收紧为 `false`。升级后管理员需要逐位重新确认正常离店接送资格；seed 和验证数据必须显式写入 `canPickup: true`，不得依赖默认值。

当前不提供 `PickupRecord` 更新或删除 API。教师、家长、学生或班级一旦关联安全接送责任记录，管理端强制删除会被拒绝，应改为停用或结业；完整的纠错/冲正机制留待独立提案。

### 4.2 生活照护与异常记录

CP-35 新增统一 `StudentCareRecord`，不为用餐、饮水、休息、情绪和异常分别建表。`type` 使用 `meal`、`water`、`rest`、`mood`、`exception`，并通过受控字段 `mealSlot`、`value`、`quantity`、`durationMinutes`、`exceptionCategory`、`remark`、`resolution`、`needsAttention` 和 `photoUrls` 表达对应事实，不使用万能 JSON。

对应 migration 为 `20260818130000_add_student_care_records` 和 `20260818131000_require_care_exception_remark`。后者在第一条已应用 migration 之后追加严格的异常备注非空数据库约束，不修改或删除任何既有业务数据。

用餐餐次只覆盖当前托管业务的 `snack`、`dinner`；数据库 partial unique index 保证同一学生、同一中国业务日和同一餐次只有一条记录。休息同样通过 partial unique index 保证每天一条主要记录。饮水、情绪与异常允许多条；饮水每条 `quantity = 1`，当天次数由记录聚合得到。用餐和休息允许当天更新并保留 `updatedAt` 与最后经办教师，异常第一版只允许追加。

数据库 CHECK 约束限制不同类型可使用的字段组合，并保证异常备注非空。应用层进一步限制用餐、休息和情绪的受控值、休息时长、备注/处理结果长度，以及 `scene=care` 图片归属。`serviceDate` 使用现有 Asia/Shanghai 业务日工具计算，不依赖数据库会话时区。

学生外键使用 `ON DELETE RESTRICT` 保留历史事实；教师外键使用 `ON DELETE SET NULL`，教师被停用或移除后仍保留原始照护记录。常用查询在学生/日期、类型/日期、教师/日期和关注状态/日期上建索引。管理端删除学生时也会把已有照护事实作为历史引用阻止强制删除。

`StudentCareRecord` 不关联或复制 `PickupRecord`、`StudentWorkflowStep`，也不自动生成 `GrowthRecord`。接送、日流程、生活照护仍是三类独立事实，后续每日托管报告通过查询聚合。

## 5. 作业

作业分两层：

- `HomeworkAssignment`: 老师发布给班级的作业。
- `HomeworkSubmission`: 每个学生对应的提交、图片附件和批改状态。

当前已支持家长提交文字或最多 6 个作业图片 URL。作业图片必须先通过 `POST /api/files` 以 `scene = homework` 上传，并属于当前家长。老师可将提交状态更新为 `reviewed` 并写入批改备注。

## 6. 成长记录

`GrowthRecord` 是家长端“今日成长”和“成长记录”的统一数据源。

来源可以是：

- 出勤事件
- CP-34 以前已经生成的历史流程打卡摘要（保留但不清理）
- 作业状态
- 老师反馈
- 中心通知

CP-34 起，普通一日流程完成、跳过或异常只写 `StudentWorkflowStep`；CP-35 的普通照护和异常也只写 `StudentCareRecord`，两者都不自动生成 `GrowthRecord`。`GrowthRecord` 继续用于值得长期保留和家长关注的成长事件，避免被日常操作日志污染。

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
- `scene`: 使用场景，例如 `workflow`、`homework`、`message`、`care`。
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
- 教师单个完成、跳过、异常处理和批量完成学生流程
- 教师创建教学记录、备课计划、教研活动、成长反馈、作业
- 教师更新教案状态
- 家长提交或重新提交作业
- 教师更新作业提交状态
- 教师发布通知/任务
- 家长确认通知/任务
- 教师创建、编辑和变更教研活动状态
- 教师报名或取消报名教研活动
- 管理员新增或停用非账号型授权接送人
- 教师登记学校接到、安全到店、正常/临时/异常离店
- 教师创建单学生生活照护/异常记录；异常必须审计
- 教师批量记录用餐、饮水或休息；每次批量请求只写一条汇总审计

这对托管机构运营很重要。
