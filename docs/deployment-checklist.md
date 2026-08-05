# 部署检查清单

## 环境变量

后端至少需要：

```text
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=<strong-secret>
WECHAT_APP_ID=<miniapp-app-id>
WECHAT_APP_SECRET=<miniapp-app-secret>
FILE_STORAGE_DRIVER=local
LOCAL_UPLOAD_DIR=./uploads
```

要求：

- `JWT_SECRET` 生产环境必须替换为强随机值。
- `.env`、微信密钥、数据库密码不得提交到 Git。
- `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET` 只放后端环境变量。
- 本地上传目录需要持久化挂载；生产期建议切换到 COS 或 OSS。

## 数据库

上线前执行：

```powershell
pnpm --filter @ruizhibo/api prisma:generate
pnpm --filter @ruizhibo/api prisma:migrate
```

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

期望返回 2xx。若失败，优先检查：

- `DATABASE_URL`
- Prisma migration 状态
- 服务端口和反向代理
- Node.js 运行目录是否正确
- 上传目录是否可写

## 上线前人工验收

- 管理员可以登录后台并维护老师、班级、学生、家长绑定。
- 老师只能看到自己的班级和学生。
- 老师可以创建今日流程并完成打卡。
- 家长只能看到绑定孩子的成长时间线、作业和出勤。
- 家长和老师可以互发消息，未读数正确变化。
- 文件上传拒绝非法类型和超大文件。
- 管理端关键写操作会生成审计日志。
- 生产环境不能使用默认 `JWT_SECRET`。

## 回滚

- 保留上一版本构建产物。
- 数据库迁移上线前备份。
- 涉及 schema 变更时准备回滚 SQL 或 Prisma 迁移反向方案。
- 前端小程序发布保持灰度，先在体验版验证。
