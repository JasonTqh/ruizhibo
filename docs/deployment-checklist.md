# 部署检查清单

## 环境变量

后端至少需要：

```text
NODE_ENV=production
APP_VERSION=<git-commit-sha>
DATABASE_URL=postgresql://...
JWT_SECRET=<strong-secret>
CORS_ORIGINS=https://test.example.com,https://admin.example.com
ENABLE_DEV_LOGIN=false
WECHAT_TEACHER_APP_ID=<teacher-miniapp-app-id>
WECHAT_TEACHER_APP_SECRET=<teacher-miniapp-app-secret>
WECHAT_PARENT_APP_ID=<parent-miniapp-app-id>
WECHAT_PARENT_APP_SECRET=<parent-miniapp-app-secret>
FILE_STORAGE_DRIVER=local|s3
```

要求：

- `JWT_SECRET` 生产环境必须替换为强随机值。
- `APP_VERSION` 建议设置为当前 Git 提交 SHA，供 `/api/health` 与 `verify:release` 校验。
- `.env`、微信密钥、数据库密码不得提交到 Git。
- 教师端、家长端微信 AppID/AppSecret 分开配置，只放后端环境变量。
- `ENABLE_DEV_LOGIN` 在测试公网和生产环境必须为 `false` 或不设置。
- `FILE_STORAGE_DRIVER=local` 时需要持久化挂载上传目录；`s3` 时按 `docs/file-storage.md` 配置 S3/COS/OSS/MinIO 兼容对象存储和公开访问域名。
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
pnpm verify:release -- `
  -BaseUrl https://test.example.com/api `
  -ExpectedVersion <git-commit-sha> `
  -AdminPhone <admin-phone> `
  -AdminPassword <admin-password>
```

`verify:deployment -RunApiSuite` 只用于封闭开发环境；公网测试环境不要为了运行它开启 `dev-login`。

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
- `/api/health` 显示的版本、数据库和文件存储状态符合预期。
- 管理端关键写操作会生成审计日志。
- 生产环境不能使用默认 `JWT_SECRET`。

## 回滚

- 保留上一版本构建产物。
- 数据库迁移上线前执行 `pnpm backup:deployment` 或同等数据库备份。
- 涉及 schema 变更时准备回滚 SQL 或 Prisma 迁移反向方案。
- 前端小程序发布保持灰度，先在体验版验证。
