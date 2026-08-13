# 测试环境部署

本方案使用 Docker Compose 启动 PostgreSQL、NestJS API 和管理后台。管理后台由 Caddy 提供静态文件，并把 `/api/*`、`/uploads/*` 转发到 API；配置真实域名后由 Caddy 自动申请和续期 HTTPS 证书。

## 1. 部署前准备

服务器需要安装 Docker Engine 与 Docker Compose，并允许公网访问 TCP 80、443。将测试域名的 A/AAAA 记录指向服务器，然后确认以下内容：

- 教师端和家长端各自的微信 AppID/AppSecret。
- 一条至少 32 位的随机 `JWT_SECRET`。
- PostgreSQL 强密码；若密码含特殊字符，`DATABASE_URL` 中需要 URL 编码。
- 测试环境备份与访问人员范围。

管理后台当前仍使用开发登录接口。封闭内网测试可临时设置 `ENABLE_DEV_LOGIN=true`；面向公网或生产环境必须设置为 `false`。在正式公网管理后台上线前，需要补充独立的管理员认证方案。

## 2. 创建部署环境文件

在仓库根目录执行：

```powershell
Copy-Item deploy/.env.example deploy/.env
```

编辑 `deploy/.env`：

```text
DEPLOY_SITE_ADDRESS=test.example.com
HTTP_PORT=80
HTTPS_PORT=443
POSTGRES_PASSWORD=<strong-password>
DATABASE_URL=postgresql://ruizhibo:<url-encoded-password>@db:5432/ruizhibo?schema=public
JWT_SECRET=<random-secret>
CORS_ORIGINS=https://test.example.com
ENABLE_DEV_LOGIN=false
WECHAT_TEACHER_APP_ID=<teacher-app-id>
WECHAT_TEACHER_APP_SECRET=<teacher-app-secret>
WECHAT_PARENT_APP_ID=<parent-app-id>
WECHAT_PARENT_APP_SECRET=<parent-app-secret>
```

`deploy/.env` 已被 Git 忽略，不得提交真实密钥。

## 3. 校验并启动

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.test.yml config --quiet
docker compose --env-file deploy/.env -f deploy/docker-compose.test.yml up -d --build
docker compose --env-file deploy/.env -f deploy/docker-compose.test.yml ps
```

API 容器启动时自动执行已提交的 Prisma migrations。首次创建专用测试数据库后，如需演示数据可执行：

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.test.yml run --rm api pnpm seed
```

不要在生产数据库执行演示 seed。

## 4. 部署后验证

检查日志：

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.test.yml logs --tail 100 api web
```

从开发电脑执行 HTTPS、API、数据库和管理后台入口检查：

```powershell
pnpm verify:deployment -- `
  -BaseUrl https://test.example.com/api `
  -AdminUrl https://test.example.com `
  -RequireHttps
```

封闭测试环境临时开启 `ENABLE_DEV_LOGIN=true` 时，可追加 `-RunApiSuite`，串行执行管理员、教师和家长三套只读 API 验证。公网环境不要为了运行脚本而开启开发登录。

## 5. 小程序体验版配置

在微信公众平台分别为教师端、家长端配置：

- request 合法域名：`https://test.example.com`
- downloadFile 合法域名：`https://test.example.com`（用于 `/uploads/*` 图片）

构建体验版时注入同一个 HTTPS API 地址和微信登录模式：

```powershell
$env:TARO_APP_API_BASE_URL="https://test.example.com/api"
$env:TARO_APP_AUTH_MODE="wechat"
pnpm --filter @ruizhibo/teacher-miniapp build
pnpm --filter @ruizhibo/parent-miniapp build
```

分别将 `apps/teacher-miniapp/dist`、`apps/parent-miniapp/dist` 导入微信开发者工具，确认项目使用对应小程序 AppID 后上传体验版。

## 6. 数据与回滚

容器卷 `postgres_data` 保存数据库，`uploads_data` 保存当前本地文件，Caddy 证书位于 `caddy_data`。升级前应备份数据库与上传卷：

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.test.yml exec -T db `
  pg_dump -U ruizhibo -d ruizhibo > ruizhibo-test.sql
```

更新代码后重新执行 `up -d --build`。回滚时切回上一 Git 版本重新构建；数据库 schema 变化必须先准备兼容或反向迁移方案。

停止服务但保留数据：

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.test.yml down
```

不要对已有测试数据执行 `down -v`，该命令会删除数据库与上传卷。
