# 开发状态与下一步计划

本项目已经从“核心业务链路可联调”推进到“测试环境上线前验收”阶段。正式 Taro 小程序、管理后台、后端生产化能力、发布门禁、CP-33 安全接送，以及 CP-34 学生级一日托管流程代码闭环均已实现；当前重点是接入真实 HTTPS 测试域名、微信公众平台配置、体验版真机绑定、接送与学生流程真机验收、备份恢复演练和小范围业务试运行。

## 1. 当前正式工程

```text
apps/api              NestJS + Prisma 后端 API
apps/admin-web        React + Ant Design 管理后台
apps/parent-miniapp   Taro 家长端微信小程序
apps/teacher-miniapp  Taro 教师端微信小程序
packages/shared       公共类型
```

历史静态原型已归档：

```text
archive/apps/parent-app
archive/apps/teacher-app
archive/apps/website
```

## 2. 已完成能力

后端：

- 开发登录、管理员密码登录、分角色微信登录、手机号绑定、`GET /api/me`。
- JWT 鉴权、角色权限 Guard、统一错误响应格式。
- 管理后台基础数据 CRUD：老师、班级、学生、家长绑定。
- 一日流程模板与班级每日实例、学生级完成/跳过/异常事实、班级批量完成、缺勤动态合成及家长今日托管进度。
- 教学记录、备课计划、教研活动、成长反馈、作业发布、家长提交作业、教师批改。
- 家长端孩子列表、成长时间线、出勤、作业查询。
- 安全接送事实链：学校接到、安全到店、正常/临时/异常离店、授权接送人快照、家长历史查询与考勤兼容。
- 家校会话、聊天详情、文本/图片消息、未读数和读取后已读。
- 教师发布通知/家长任务，家长查看与确认，教师查看逐位回执。
- JSON/base64 文件上传、local/S3 兼容存储、`FileAsset` 元数据记录。
- 请求追踪、结构化运行日志、审计日志记录和管理端查询。

前端：

- 管理后台已接入真实 API，可正式登录、维护基础数据和流程模板、配置家长与接送权限、维护非账号型授权接送人、执行引用检查，并只读查询接送/异常及学生托管步骤等业务记录。
- 教师小程序已接入工作台、今日接送、备课、教研、教学记录、学生级流程、作业、通知/任务、消息列表和聊天详情；学生流程支持按步骤查看全部/待处理/已完成/异常、班级批量完成与单人完成/跳过/异常。
- 家长小程序已接入首页今日接送状态、今日托管进度、接送历史、作业提交、成长、“我的”、通知/任务确认、消息列表和聊天详情；今日托管可查看老师备注与个人凭证。
- 教师端、家长端已按历史原型方向完成首轮真实 API 页面迁移，不再保留底部导航占位页。

文档和工具：

- `docs/api.md` 记录当前接口。
- `docs/database.md` 记录当前 Prisma 数据模型。
- `docs/deployment-checklist.md` 记录部署检查项。
- `docs/environment.md` 记录前端 API 地址、认证模式和真机联调环境配置。
- `docs/ui-development-path.md` 记录当前页面与功能完善批次。
- `docs/test-environment-deployment.md` 记录 Docker 测试环境、HTTPS 和微信合法域名配置。
- `docs/file-storage.md` 记录 local/S3 文件存储配置和验证。
- `docs/admin-authentication.md` 记录管理员正式登录、密码初始化和限流。
- `docs/release-verification.md` 记录生产模式发布门禁。
- `apps/api/scripts/verify-*.ps1` 与根目录部署脚本可覆盖管理端、教师端、家长端、文件存储、观测性、发布门禁、备份和恢复验证。

## 3. 本地联调流程

准备数据库和 seed：

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ruizhibo"
$env:JWT_SECRET="change-me-in-production"
pnpm --filter @ruizhibo/api seed
```

启动后端：

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ruizhibo"
$env:JWT_SECRET="change-me-in-production"
pnpm dev:api
```

启动管理后台：

```powershell
pnpm dev:admin
```

启动小程序构建监听：

```powershell
pnpm dev:teacher
pnpm dev:parent
```

微信开发者工具导入目录：

```text
apps/teacher-miniapp/dist
apps/parent-miniapp/dist
```

开发者工具中需要勾选“详情 -> 本地设置 -> 不校验合法域名、web-view、TLS 版本以及 HTTPS 证书”。

## 4. 人工验收主链路

建议每次跨端功能调整后按以下顺序走一遍：

```text
1. 管理后台开发登录。
2. 创建或确认老师、班级、学生和家长绑定。
3. 教师小程序查看工作台、班级和学生。
4. 教师端进入流程页，生成今日流程并完成一次打卡。
5. 教师端发布作业或成长反馈。
6. 家长端查看孩子、成长时间线、出勤和作业。
7. 家长端提交一次作业，教师端批改。
8. 教师端发布通知或任务。
9. 家长端查看通知/任务并确认。
10. 教师端查看逐位回执汇总。
11. 家长端发送消息，教师端进入聊天详情查看并回复。
12. 管理后台查看审计日志。
13. 管理后台为学生确认 `canPickup` 监护人，并新增一个非账号型授权接送人。
14. 教师端“今日接送”依次登记学校接到、安全到店、选择授权人办理离店。
15. 再用一名学生验证家长送达，以及临时/异常接送的必填保护。
16. 家长端首页和接送历史确认时间线、经办教师、接送人及异常提示。
17. 管理后台“接送记录”验证今日未到店、今日未离店和异常接送筛选。
```

## 5. 自动验证

基础验证：

```powershell
pnpm typecheck
pnpm build
```

后端验证：

```powershell
pnpm --filter @ruizhibo/api typecheck
pnpm --filter @ruizhibo/api build
pnpm --filter @ruizhibo/api seed
pnpm --filter @ruizhibo/api verify:admin
pnpm --filter @ruizhibo/api verify:workflow-image-policy
pnpm --filter @ruizhibo/api verify:workflow-images
pnpm --filter @ruizhibo/api verify:pickup
```

`verify:workflow-images` 会创建并清理隔离的临时教师/班级，需要封闭开发环境开启 dev login；生产发布门禁不依赖 dev login，而是自动执行 `verify:workflow-image-policy`。生产配置可单独执行：

```powershell
pnpm verify:production-config -- -EnvPath deploy/.env -RequireHttps
```

小程序验证：

```powershell
pnpm --filter @ruizhibo/teacher-miniapp typecheck
pnpm --filter @ruizhibo/teacher-miniapp build
pnpm --filter @ruizhibo/parent-miniapp typecheck
pnpm --filter @ruizhibo/parent-miniapp build
```

## 6. 下一阶段优先级

CP-21、CP-22、UI-01 至 UI-09、CP-23 至 CP-31、最新路线图定义的 CP-32 代码部分、重新定义的 CP-33/CP-33.1 安全接送，以及 CP-34 学生级一日托管流程均已完成本地/隔离环境自动验证。CP-32 外部项、CP-33 门店接送，以及 CP-34 真机高频操作仍为 `WAITING_FOR_EXTERNAL_ACCEPTANCE`；本轮完成后不自动进入 CP-35。

建议优先顺序：

1. 准备真实 HTTPS 测试域名、Caddy 入口、微信 request/uploadFile/downloadFile 合法域名。
2. 配置教师端、家长端正式 AppID/AppSecret，构建 `TARO_APP_AUTH_MODE=wechat` 体验版。
3. 执行 `pnpm verify:release`、管理后台人工验收、文件上传验收和备份/恢复演练。
4. 组织老师、家长按真实学校接人、家长送达、授权接走、临时/异常接走场景小范围试运行，记录身份核验与操作路径问题。
5. 根据试运行反馈再拆分 UI/流程微调提案。

### UI-01 双端首页与视觉基线

- 教师端首页增加问候、统计、快捷入口、今日待办和负责班级。
- 家长端首页增加孩子切换、快捷入口、今日提醒和成长预览。
- 已通过微信开发者工具与真机人工验收。

### UI-02 至 UI-05 复用现有 API 补齐页面

- UI-02：教师教学记录、学生成长反馈和作业管理整合。
- UI-03：教师流程进度、分组打卡和拍照凭证。
- UI-04：家长成长、作业和“我的”页面完善。
- UI-05：通知、消息和聊天体验完善。

### UI-06 至 UI-08 新增缺失业务能力

- UI-06：新增真实的教师备课数据、接口和页面。
- UI-07：新增真实的教师教研活动数据、接口和页面。
- UI-08：补齐管理后台业务查询和配置入口。

### UI-09 全页面回归与真机适配

- 对照历史原型检查正式小程序的信息架构和视觉语言。
- 覆盖空数据、弱网、超长文本、重复点击和不同设备安全区。
- 确保所有底部导航页面不再显示“规划中”占位内容。
- 已完成底部安全区、聊天动态视口、横向筛选滚动、窄屏布局和重复刷新保护，并在真机跑通流程、作业、通知与聊天主链路。
- 微信开发者工具 v2.02 关闭 SWC 编译，避免真机调试打包器缺失运行时文件。

完整范围、验收标准和验证命令见 `docs/ui-development-path.md`。

页面与功能完善已经通过，按以下顺序进入生产化提案：

### CP-23 微信登录生产闭环

- 教师端和家长端通过 `TARO_APP_AUTH_MODE=wechat` 调用 `wx.login`，开发环境继续使用 `TARO_APP_AUTH_MODE=dev`。
- 后端分别使用 `WECHAT_TEACHER_APP_ID` / `WECHAT_TEACHER_APP_SECRET` 与 `WECHAT_PARENT_APP_ID` / `WECHAT_PARENT_APP_SECRET` 完成 `code2Session`。
- 未绑定用户只获得 10 分钟短期凭证，必须通过微信 `getPhoneNumber` 授权码匹配后台预建账号后才能获得业务 token。
- 已补角色校验、重复绑定保护和绑定审计；生产环境设置 `ENABLE_DEV_LOGIN=false`。
- 仍需在微信公众平台配置 AppSecret 后完成教师端、家长端各一次真机绑定验收。

### CP-24 教师/家长 API 验证脚本

- 已新增 `verify:teacher`，覆盖工作台、班级、流程、教学、成长反馈、作业、通知回执和消息。
- 已新增 `verify:parent`，覆盖孩子、时间线、出勤、作业、通知确认、消息与数据隔离。
- 默认模式只读；`-IncludeWrites` 验证教师发布到家长提交/确认的完整写入闭环。
- 测试环境部署后运行 `pnpm --filter @ruizhibo/api verify:all` 作为部署前 API 检查。

### CP-25 测试环境部署

- 已准备 PostgreSQL、API、管理后台/Caddy 的 Docker Compose 部署配置。
- 已实现数据库和上传目录持久化、启动迁移、HTTPS 入口与部署后健康检查。
- 真实服务器、域名和微信公众平台合法域名仍需按 `docs/test-environment-deployment.md` 完成外部配置和验收。
- 上线时继续逐项执行 `docs/deployment-checklist.md`。

### CP-26 文件存储生产化

- 已增加 local/S3 兼容双驱动，可接入 COS、OSS、AWS S3 或 MinIO。
- `FileAsset` 已保留驱动与对象 key，数据库写入失败时补偿删除对象。
- 已补齐 MIME/内容签名/10 MB 校验，以及流程打卡和作业图片的可读错误提示。
- local 自动验证与 MinIO 真实上传、公开访问和元数据集成验收均已通过。
- 配置与验证命令见 `docs/file-storage.md`。

### CP-27 家校沟通图片消息

- 教师端和家长端聊天页已支持从相册或相机选择最多 3 张图片并发送。
- 图片复用 `scene = message` 文件上传，支持 10 MB、格式和内容签名校验。
- 后端校验文件必须属于发送者，禁止引用他人文件或客户端伪造系统消息。
- 图片消息支持点击预览，并沿用未读数和 `readAt` 已读状态。
- `verify:message-images` 已通过双向图片与数据隔离自动验证，并完成微信开发者工具人工验收。

### CP-28 数据库与上传文件备份/恢复

- 新增 `backup:deployment`，备份 PostgreSQL 与 local 上传文件，并生成 SHA-256 清单。
- 新增 `restore:deployment`，支持非写入校验、显式恢复确认和恢复前安全备份。
- 已在本地 Docker 环境通过备份、校验、安全备份和恢复回归。
- S3/COS/OSS 文件依赖桶版本控制或云平台快照，操作说明见 `docs/backup-and-restore.md`。

### CP-29 请求追踪与结构化运行日志

- 所有 API 响应返回 `X-Request-Id`，错误 JSON 同时返回相同 `requestId`。
- 访问日志改为单行 JSON，记录请求方法、路径、状态码、耗时和可选用户标识。
- 日志不记录查询串、请求体、Token、微信 code 或密钥。
- Docker 为 db、api 和 web 配置可调整的 `json-file` 日志轮转。
- `verify:observability` 已通过请求 ID 透传、替换和错误关联验证，并完成人工验收。

### CP-30 管理后台正式登录

- 新增管理员手机号/密码登录，密码使用带随机盐的 scrypt 哈希保存。
- 管理员令牌有效期为 8 小时，Web 端使用 `sessionStorage` 并支持主动退出。
- 登录失败按手机号和来源 IP 执行 15 分钟窗口限流，错误响应不泄露账号状态。
- 新增管理员密码初始化/重置命令与 `verify:admin-auth` 自动回归。
- 管理后台生产构建隐藏开发登录入口；自动验证和人工验收均已通过。

### CP-31 测试环境正式发布闭环

- 新增 `verify:release` 生产发布门禁，不依赖开发登录。
- 健康接口和 Compose 增加 `APP_VERSION`，可校验部署提交与预期 Git 版本一致。
- Caddy 补充 HSTS 与 `Permissions-Policy`，门禁同时验证已有安全响应头。
- 自动检查正式管理员登录、开发登录禁用、CORS、生产前端包和真实文件上传。
- 已在隔离的 Docker 生产模式环境通过自动回归，等待真实 HTTPS 域名人工验收。

### CP-32 真实上线验收与儿童数据安全加固

**代码已完成**

- workflow 打卡保存图片前校验 FileAsset 必须存在、属于当前教师、scene 为 `workflow` 且 MIME 为图片。
- message、homework、workflow 复用同一 FileAsset 校验策略；错误引用统一返回明确的 400。
- 教师端上传明确使用 `scene=workflow`；上传失败会显示原因并保留照片供重试。
- 新增五类策略回归与完整 HTTP 回归，并接入 `verify:all` 和 `verify:release`。
- 发布配置审计覆盖 dev login、CORS、JWT、管理员密码入口、PostgreSQL、文件存储、持久化、备份/恢复资产、Caddy 和微信凭据完整性。

**WAITING_FOR_EXTERNAL_ACCEPTANCE**

- 真实域名 HTTPS/Caddy 证书与安全响应头。
- 微信教师端/家长端 AppID、AppSecret 的部署环境配置。
- 微信公众平台 request、uploadFile、downloadFile 合法域名。
- 教师端、家长端体验版真机登录/绑定、数据隔离和 workflow 图片链路。
- 隔离环境的实际恢复演练；正式环境只执行备份和 `-ValidateOnly`。

CP-32 代码完成与外部验收状态必须分开记录。其外部验收尚未完成，但用户已单独授权执行最新路线重新定义的 CP-33。

### CP-33 安全接送与到离店闭环

> 编号说明：本 CP-33 是 2026-08-17 最新业务路线定义，替代历史 roadmap 中同编号的“发布流水线与回滚演练”；旧任务不得再按 CP-33 执行。

**代码已完成**

- 新增 `AuthorizedPickupPerson` 与不可随意修改/删除的 `PickupRecord`，家长账号型接送人复用 `StudentGuardian.canPickup`。
- 按中国 UTC+8 业务日记录学校接到、到店、离店三个事实节点；数据库唯一约束、服务校验和事务共同阻止重复操作。
- 到店支持教师接送、家长送达、自行到店和其他方式；到店/离店与原有 `AttendanceEvent` 在同一事务内保持兼容。
- 家长送达可选择具体监护人/授权人并保存送达人快照；家长首页的到店、离店卡片明确展示“经办：教师姓名”。
- 请假/缺勤由同一 `AttendanceEvent.absence` 同步驱动教师、家长和管理端视图，请假学生不再出现在“今日未到店”。
- 正常离店必须选择有效授权人；临时/异常离店必须保存姓名、关系、电话、确认/处理结果，异常还必须填写原因；历史记录保存接送人快照。
- 教师端“今日接送”增加按状态快速分组、整组多选、批量学校接到和批量安全到店；批量写入原子提交，适合放学高峰操作。
- 教师端临时授权和异常离店显示明确文字标签；确认离店使用同步请求锁，连续点击不会再触发第二个失败提示。
- 家长端新增今日状态和历史时间线，管理后台新增授权接送人与接送记录/异常筛选；后台正确显示记录根层班级，占位记录不再显示虚假的 08:00 时间。
- 教师仅能操作负责班级学生，家长仅能读取 active 监护关系学生；父母/接送人停用后不能用于正常离店。
- 不提供接送记录更新/删除 API；接送历史会阻止关联教师、家长、班级和学生被强制删除。
- 新增 `verify:pickup` 并接入 `verify:all`，覆盖 14 个规定场景、请假三端一致、具体送达人、批量原子写入、管理端快捷筛选/占位时间和历史不可删除保护。

**已明确留待后续独立提案**

- 不支持历史接送事实的更正/冲正；当前只允许保留原始事实，不能删除。
- 本 CP 不采集接送照片，不新增 `pickup` 文件场景。
- 本 CP 不包含学生级完整 workflow、生活记录、日报/周报、收费、经营看板、订阅消息或 AI。

**WAITING_FOR_EXTERNAL_ACCEPTANCE**

- 在微信开发者工具和真机分别验证教师端大按钮操作、重复点击无二次错误、异常标签/必填和弱网请求失败反馈。
- 用 10 名真实/脱敏测试学生验证“待接 → 全选本组 → 批量学校接到”和“已接到 → 全选本组 → 批量安全到店”的高峰操作、滚动与刷新体验。
- 使用两个真实微信账号验证教师跨班被拒绝、家长跨家庭不可见，以及停用授权人无法正常离店。
- 按门店真实交接规程，由老师和管理员核对学校接到、到店、授权离店、临时/异常离店及管理端追溯结果。

该 CP 当时完成后停止；CP-34 后续经用户单独授权启动。

### CP-33.1 安全接送审查修复

**代码已完成；CP-34 后续经用户单独授权启动。**

- `StudentGuardian.canPickup` 的 schema、后端绑定接口和管理后台新增表单均改为默认 `false`；正常离店接送必须由管理员明确授权。
- 新 migration 保持已发布 CP-33 migration 不变，将历史自动获得的 `canPickup=true` 安全收紧为 `false`，升级后需要管理员重新确认授权；seed/验证数据中的正常接送人继续显式设置 `true`。
- 缺勤与接送事实改为双向互斥：缺勤后不能学校接到、到店或离店，已有任意接送事实后也不能新增缺勤。
- 单个与批量接送都在事务内复查缺勤；数据库 trigger 配合 transaction-scoped advisory lock 兜住直接 Prisma 写入和并发竞态。
- migration 不删除升级前已经存在的冲突责任记录；遗留冲突会被阻止继续到店，并等待独立的人工核查/冲正方案。
- `verify:pickup` 增加未授权拒绝/显式授权成功、absence → pickup 拒绝、pickup → absence 拒绝、遗留冲突不能继续到店及批量整体失败场景。

**WAITING_FOR_EXTERNAL_ACCEPTANCE**

- 管理员在真实后台新建监护关系，确认“授权接送”默认关闭，并手动开启后才可正常离店。
- 教师端真机刷新接送人列表，确认未授权监护人不出现、明确授权后出现。
- CP-33 原有微信真机和真实门店责任链验收仍未完成，本修复不改变其外部验收状态。

### CP-34 学生级一日托管流程

**代码已完成；真机与真实高频业务验收为 `WAITING_FOR_EXTERNAL_ACCEPTANCE`；不进入 CP-35。**

- 保留 `WorkflowTemplate`、`WorkflowTemplateStep`、`WorkflowSession`、`WorkflowStep`，新增 `StudentWorkflowStep` 承载同一班级步骤下每名学生独立的 `pending/completed/skipped/exception` 事实。
- 缺勤继续以 `AttendanceEvent.absence` 为唯一事实，API 动态返回 `effectiveStatus=absent`，并拒绝缺勤学生的流程操作。
- `WorkflowStep.checked` 改为“所有 active、非缺勤学生均已处理”；单人或批量操作后自动同步，Dashboard 未完成数继续兼容。
- 旧 `/check` 保留为全体 eligible pending 学生的批量完成入口；新增可选 `studentIds` 的批量接口，以及单学生完成、跳过、异常接口。批量事务原子提交，不覆盖已处理状态；重复/终态改写返回 `409`。
- 班级与个人照片分开保存，均复用 `FileAsset` 的当前教师 owner、`scene=workflow`、图片类型与文件存在校验。
- 教师端以步骤为中心展示五类汇总、快捷筛选、学生到店上下文、个人时间线、备注和照片；正常学生可一键批量完成，只为例外学生单独处理。
- 家长首页新增“今日托管进度”，只通过 active 监护关系读取；管理后台新增按日期、班级、教师、学生、状态筛选的只读“学生托管流程”。
- 普通 workflow 完成、跳过或异常不再自动生成 `GrowthRecord`；旧历史记录保留，长期成长事件继续由明确的成长反馈等入口产生。
- 新 migration `20260817210000_add_student_workflow_steps` 只新增 enum、表、唯一约束、必要索引与安全外键，不改旧 migration、不回填或删除历史数据；当天已有班级 session 在读取时幂等补齐。
- 新增 `verify:student-workflow` 并接入 `verify:all`，覆盖规定的 24 个状态、权限、并发/原子性、图片、兼容、家长隔离、GrowthRecord 与 Dashboard 场景。

本地验证：

```powershell
pnpm --filter @ruizhibo/api exec prisma validate
pnpm --filter @ruizhibo/api exec prisma migrate status
pnpm typecheck
pnpm build
pnpm --filter @ruizhibo/api verify:student-workflow
pnpm --filter @ruizhibo/api verify:all
pnpm --filter @ruizhibo/api verify:message-images
pnpm --filter @ruizhibo/api verify:storage
pnpm --filter @ruizhibo/api verify:storage-drivers
pnpm --filter @ruizhibo/api verify:observability
```

**WAITING_FOR_EXTERNAL_ACCEPTANCE**

- 微信开发者工具与真机准备一个 `completed / skipped / exception / absent` 各一人的班级，确认步骤自动变为 `checked=true`，家长只看到自己的孩子。
- 用约 20 名脱敏学生模拟批量完成 17 人，再分别处理跳过、异常、缺勤，确认页面滚动、反馈与操作耗时满足放学高峰。
- 真机验证个人 workflow 图片上传、预览、失败反馈，以及不同教师文件不能被引用。
- 管理后台人工确认日期/班级/学生/状态筛选与步骤详情只读，无修改或删除入口。

## 7. 给 Codex 的任务模板

```text
请实现 CP-XX：<提案名称>。

要求：
- 先阅读 AGENT.md、docs/api.md、docs/database.md 和相关模块源码。
- 只修改本提案相关文件。
- 后端接口必须做角色权限校验。
- 返回结构保持 { data: ... }。
- 参数使用 DTO 校验。
- 写入类关键操作要考虑审计日志。
- 补充必要 seed、验证脚本或文档。
- 完成后运行相关 typecheck/build。
- 最后总结改动文件、验证命令和结果。
```
