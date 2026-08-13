# 开发状态与下一步计划

本项目已经从“工程骨架”推进到“核心业务链路可联调”的阶段。当前暂停生产登录和部署工作，优先把正式 Taro 小程序的页面、占位功能和视觉体验完善到可持续试用状态。

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

- 开发登录、微信登录占位、手机号绑定、`GET /api/me`。
- JWT 鉴权、角色权限 Guard、统一错误响应格式。
- 管理后台基础数据 CRUD：老师、班级、学生、家长绑定。
- 一日流程模板管理、教师端今日流程实例、流程步骤打卡。
- 教学记录、成长反馈、作业发布、家长提交作业、教师批改。
- 家长端孩子列表、成长时间线、出勤、作业查询。
- 家校会话、聊天详情、文本消息、未读数和读取后已读。
- 教师发布通知/家长任务，家长查看与确认，教师查看逐位回执。
- JSON/base64 文件上传、本地静态访问、`FileAsset` 记录。
- 审计日志记录和管理端查询。

前端：

- 管理后台已接入真实 API，可维护基础数据、流程模板并查看审计日志。
- 教师小程序已接入工作台、流程、教学记录、作业、通知/任务、消息列表和聊天详情；教研功能已通过人工验收，备课功能已完成开发。
- 家长小程序已接入孩子首页、作业提交、成长、通知/任务确认、消息列表和聊天详情；“我的”仍是占位页。
- 教师端、家长端首页正在按历史原型方向重构，但只使用真实 API 数据。

文档和工具：

- `docs/api.md` 记录当前接口。
- `docs/database.md` 记录当前 Prisma 数据模型。
- `docs/deployment-checklist.md` 记录部署检查项。
- `docs/ui-development-path.md` 记录当前页面与功能完善批次。
- `apps/api/scripts/verify-admin-api.ps1` 可验证管理端核心 API。

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
```

小程序验证：

```powershell
pnpm --filter @ruizhibo/teacher-miniapp typecheck
pnpm --filter @ruizhibo/teacher-miniapp build
pnpm --filter @ruizhibo/parent-miniapp typecheck
pnpm --filter @ruizhibo/parent-miniapp build
```

## 6. 下一阶段优先级

CP-21、CP-22 与 UI-01 至 UI-09 均已完成，并通过微信开发者工具与真机人工验收。当前进入生产化阶段，下一步执行 CP-23 微信登录生产闭环。

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

- 将本地上传替换或扩展为 COS/OSS。
- 保留 `FileAsset` 元数据。
- 补齐图片上传入口和大小/类型提示。

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
