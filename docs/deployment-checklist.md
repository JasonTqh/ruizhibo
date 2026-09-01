# 部署检查清单

## 环境变量

后端至少需要：

```text
NODE_ENV=production
APP_VERSION=<git-commit-sha>
DATABASE_URL=postgresql://...
JWT_SECRET=<strong-secret>
TRAINING_MEDIA_SIGNING_SECRET=<independent-strong-secret>
TRAINING_MEDIA_URL_SECONDS=900
CORS_ORIGINS=https://test.example.com,https://admin.example.com
ENABLE_DEV_LOGIN=false
WECHAT_TEACHER_APP_ID=<teacher-miniapp-app-id>
WECHAT_TEACHER_APP_SECRET=<teacher-miniapp-app-secret>
WECHAT_PARENT_APP_ID=<parent-miniapp-app-id>
WECHAT_PARENT_APP_SECRET=<parent-miniapp-app-secret>
FILE_STORAGE_DRIVER=local|s3
S3_TRAINING_PRIVATE_BUCKET=<private-training-media-bucket-when-s3>
BACKUP_RETENTION_DAYS=30
```

要求：

- `JWT_SECRET` 生产环境必须替换为强随机值。
- `TRAINING_MEDIA_SIGNING_SECRET` 必须是独立强随机值，不能与 `JWT_SECRET` 相同，用于教师培训媒体短期访问签名。
- `TRAINING_MEDIA_URL_SECONDS` 必须在 60 到 1800 秒之间，推荐 900 秒。
- `APP_VERSION` 建议设置为当前 Git 提交 SHA，供 `/api/health` 与 `verify:release` 校验。
- `.env`、微信密钥、数据库密码不得提交到 Git。
- 教师端、家长端微信 AppID/AppSecret 分开配置，只放后端环境变量。
- `ENABLE_DEV_LOGIN` 在测试公网和生产环境必须为 `false` 或不设置。
- `FILE_STORAGE_DRIVER=local` 时需要持久化挂载上传目录；`s3` 时按 `docs/file-storage.md` 配置 S3/COS/OSS/MinIO 兼容对象存储和公开访问域名。
- `FILE_STORAGE_DRIVER=s3` 时，教师培训图片/视频必须配置独立的 `S3_TRAINING_PRIVATE_BUCKET`，不能与普通公开文件桶相同，也不得配置匿名读。
- `BACKUP_RETENTION_DAYS` 生产或试运营环境不得小于 30；教师培训数据库和私有媒体桶必须作为同一恢复点管理。
- 管理后台正式登录前，需要通过 `pnpm --filter @ruizhibo/api admin:set-password` 初始化或重置管理员密码。

## 数据库

上线前执行：

```powershell
pnpm --filter @ruizhibo/api prisma:generate
pnpm --filter @ruizhibo/api prisma:migrate
```

`prisma:migrate` 使用 `prisma migrate deploy`，只应用仓库中已提交的迁移。创建或调整本地开发迁移时使用 `prisma:migrate:dev`，不要在生产环境运行 `prisma migrate dev`。

首次部署测试环境可以执行：

```powershell
pnpm --filter @ruizhibo/api seed
```

生产环境 seed 只允许写入必要的系统配置和管理员账号，不应写入演示学生、家长或消息数据。

## 构建

上线前必须通过：

```powershell
pnpm typecheck
pnpm build
```

也可以按应用分开检查：

```powershell
pnpm --filter @ruizhibo/api build
pnpm --filter @ruizhibo/admin-web build
pnpm --filter @ruizhibo/teacher-miniapp typecheck
pnpm --filter @ruizhibo/teacher-miniapp build:h5
pnpm --filter @ruizhibo/parent-miniapp typecheck
```

## 健康检查

服务启动后检查：

```http
GET /api/health
```

期望返回 2xx，并包含 `version`、`database` 和 `fileStorage` 状态。若失败，优先检查：

- `DATABASE_URL`
- Prisma migration 状态
- 服务端口和反向代理
- Node.js 运行目录是否正确
- 上传目录是否可写
- `FILE_STORAGE_DRIVER` 与对象存储配置是否正确

生产模式发布门禁：

```powershell
pnpm verify:production-config -- -EnvPath deploy/.env -RequireHttps

pnpm verify:release -- `
  -BaseUrl https://test.example.com/api `
  -ExpectedVersion <git-commit-sha> `
  -AdminPhone <admin-phone> `
  -AdminPassword <admin-password>
```

`verify:deployment -RunApiSuite` 只用于封闭开发环境；公网测试环境不要为了运行它开启 `dev-login`。

教师培训上线前专项验证：

```powershell
pnpm test:training
pnpm verify:training-api
pnpm verify:training-media
pnpm verify:training-isolation
pnpm verify:training-feature-flag
pnpm verify:training-load
pnpm build:teacher:h5
pnpm verify:dev-acceptance
```

`verify:dev-acceptance` 会生成 `tmp/dev-acceptance/latest.md`，用于开发环境视觉与 20 人固定数据验收；它不替代真实 HTTPS、微信体验版、真机上传和真实账号验收。

## 上线前人工验收

- 管理员可以登录后台并维护老师、班级、学生、家长绑定。
- 管理后台生产包不展示开发登录入口，`POST /api/auth/dev-login` 不可用。
- 管理员可设置主要联系人及通知、作业、成长权限；软解绑后家长立即失去对应孩子和会话访问权。
- 管理员删除有业务引用的家长、班级、学生或流程模板时能看到引用统计和安全提示，未经停用或显式确认不能清理。
- 老师只能看到自己的班级和学生。
- 教师端、家长端可使用微信体验版完成登录和手机号绑定。
- 老师可以创建今日流程并完成打卡。
- 家长只能看到绑定孩子的成长时间线、作业和出勤。
- 家长可以提交作业，老师可以批改，家长刷新后能看到批改备注。
- 老师可以向自己的班级发布通知或任务，家长端能查看并确认。
- 老师刷新回执后能看到逐位家长的查看、确认状态；其他家长和教师不能访问该回执。
- 家长和老师可以进入聊天详情互发文本和图片消息，未读数正确变化。
- 文件上传拒绝非法类型和超大文件。
- 教师培训普通文件接口不能上传 `training`/`training-*` 场景素材；培训素材只能通过受保护的 `/api/files/training` 上传。
- 管理后台培训面板可维护七门课程、布置培训、查看统计/详情、调整截止日期、终止、免修、重学、实操确认、安全确认/撤销、配置校区灰度、授权培训权限、查看反馈/审计并导出 Excel。
- 教师端教师学院可查看当前计划、线性解锁课程、资料库、提醒、带教实操检查和培训反馈；锁定课程不能通过资料库或直接链接绕过。
- 培训图片/视频在 Chrome、Edge、教师端 H5、微信开发者工具和真机中均可通过短期签名 URL 加载；匿名、过期、伪造、跨教师和锁定课程访问被拒绝。
- 培训视频支持 Range 请求、续播、后台暂停、倍速和 90% 有效观看统计；测验、实操检查和安全最终确认能正确流转状态。
- 关闭某校区教师学院功能开关后，教师端培训入口和业务请求被阻断，但已有培训任务、课程快照、学习记录、确认记录、反馈和审计数据保留。
- `/api/health` 显示的版本、数据库和文件存储状态符合预期。
- 管理端关键写操作会生成审计日志。
- 生产环境不能使用默认 `JWT_SECRET`。
- 生产环境不能使用默认或占位的 `TRAINING_MEDIA_SIGNING_SECRET`，且该密钥必须与 `JWT_SECRET` 不同。

## 回滚

- 保留上一版本构建产物。
- 数据库迁移上线前执行 `pnpm backup:deployment` 或同等数据库备份。
- 涉及 schema 变更时准备回滚 SQL 或 Prisma 迁移反向方案。
- 前端小程序发布保持灰度，先在体验版验证。
- 教师培训上线后优先通过校区功能开关止血，不删除培训表、课程快照、学习记录、实操/安全确认或培训审计。
- 已产生培训数据后不要直接执行培训 migration 的 `down.sql`；只有尚未启用、无业务数据且完成备份时，才可由数据库负责人评审后倒序回滚。
- 恢复演练必须同时恢复数据库和 `S3_TRAINING_PRIVATE_BUCKET` 中的私有培训媒体，并抽查课程快照引用的图片/视频仍可通过签名地址访问。
