# 开发状态与下一步计划

本项目已经从“核心业务链路可联调”推进到“测试环境上线前验收”阶段。正式 Taro 小程序、管理后台、后端生产化能力和发布门禁均已完成代码实现；当前重点是接入真实 HTTPS 测试域名、微信公众平台配置、体验版真机绑定、备份恢复演练和小范围业务试运行。

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
- 一日流程模板管理、教师端今日流程实例、流程步骤打卡。
- 教学记录、备课计划、教研活动、成长反馈、作业发布、家长提交作业、教师批改。
- 家长端孩子列表、成长时间线、出勤、作业查询。
- 家校会话、聊天详情、文本/图片消息、未读数和读取后已读。
- 教师发布通知/家长任务，家长查看与确认，教师查看逐位回执。
- JSON/base64 文件上传、local/S3 兼容存储、`FileAsset` 元数据记录。
- 请求追踪、结构化运行日志、审计日志记录和管理端查询。

前端：

- 管理后台已接入真实 API，可正式登录、维护基础数据和流程模板、配置家长绑定权限、执行引用检查与安全删除、查询业务记录并查看审计日志。
- 教师小程序已接入工作台、备课、教研、教学记录、流程、作业、通知/任务、消息列表和聊天详情；图片聊天与主链路已通过开发者工具和真机验收。
- 家长小程序已接入首页、作业提交、成长、“我的”、通知/任务确认、消息列表和聊天详情；图片聊天与主链路已通过开发者工具和真机验收。
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

CP-21、CP-22、UI-01 至 UI-09、CP-23 至 CP-31，以及最新路线图定义的 CP-32 代码部分均已完成本地/隔离环境验证。CP-32 整体状态为 `WAITING_FOR_EXTERNAL_ACCEPTANCE`，在真实 HTTPS、微信合法域名和体验版真机验收完成前不进入后续 CP。

建议优先顺序：

1. 准备真实 HTTPS 测试域名、Caddy 入口、微信 request/downloadFile 合法域名。
2. 配置教师端、家长端正式 AppID/AppSecret，构建 `TARO_APP_AUTH_MODE=wechat` 体验版。
3. 执行 `pnpm verify:release`、管理后台人工验收、文件上传验收和备份/恢复演练。
4. 组织老师、家长小范围试运行，记录文案、权限、通知触达和操作路径问题。
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

CP-32 代码完成与外部验收状态必须分开记录，当前不进入 CP-33。

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
