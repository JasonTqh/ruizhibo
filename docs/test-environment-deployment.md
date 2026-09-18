# 测试环境部署

本方案使用 Docker Compose 启动 PostgreSQL、NestJS API、管理后台入口和独立的教师学院静态容器。公网只由 Caddy 提供 80/443 入口：管理后台与教师网页使用不同域名，两个站点的 `/api/*`、`/uploads/*` 均转发到同一 API。配置真实域名后由 Caddy 自动申请和续期 HTTPS 证书。

## 1. 部署前准备

服务器需要安装 Docker Engine 与 Docker Compose，并只需对公网开放 TCP 80、443。在 DNS 中将两个域名的 A 记录（以及已正确配置 IPv6 时的 AAAA 记录）指向同一服务器，例如：

```text
api.ruizhibo.com      -> <server-public-ip>
teacher.ruizhibo.com  -> <server-public-ip>
```

腾讯云防火墙/安全组不要对公网开放 3000 或 5432；API、PostgreSQL 和 `teacher-web` 只在 Compose 内网通信。然后确认以下内容：

- 教师端和家长端各自的微信 AppID/AppSecret。
- 一条至少 32 位的随机 `JWT_SECRET`。
- PostgreSQL 强密码；若密码含特殊字符，`DATABASE_URL` 中需要 URL 编码。
- 测试环境备份与访问人员范围。

管理后台已使用独立的手机号与密码认证。面向公网或生产环境必须设置 `ENABLE_DEV_LOGIN=false`，并在首次开放访问前为管理员初始化强密码，具体操作见 `docs/admin-authentication.md`。

## 2. 创建部署环境文件

在仓库根目录执行：

```powershell
Copy-Item deploy/.env.example deploy/.env
```

编辑 `deploy/.env`：

```text
DEPLOY_SITE_ADDRESS=https://api.ruizhibo.com
TEACHER_WEB_SITE_ADDRESS=https://teacher.ruizhibo.com
APP_VERSION=<git-commit-sha>
HTTP_PORT=80
HTTPS_PORT=443
POSTGRES_PASSWORD=<strong-password>
DATABASE_URL=postgresql://ruizhibo:<url-encoded-password>@db:5432/ruizhibo?schema=public
JWT_SECRET=<random-secret>
CORS_ORIGINS=https://api.ruizhibo.com,https://teacher.ruizhibo.com
LOG_LEVEL=info
LOG_MAX_SIZE=10m
LOG_MAX_FILES=5
TRUST_PROXY_HOPS=1
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
docker compose --env-file deploy/.env -f deploy/docker-compose.test.yml build api web teacher-web
docker compose --env-file deploy/.env -f deploy/docker-compose.test.yml up -d --build
docker compose --env-file deploy/.env -f deploy/docker-compose.test.yml ps
```

`teacher-web` 只通过 Compose 内网向 `web` 暴露 80，没有宿主机端口映射。`web` 是唯一公网入口，不会覆盖管理后台静态文件。

API 容器启动时自动执行已提交的 Prisma migrations。首次创建专用测试数据库后，如需演示数据可执行：

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.test.yml run --rm api pnpm seed
```

不要在生产数据库执行演示 seed。

数据库迁移并创建管理员账号后，在开放管理后台前设置独立密码：

```powershell
$env:ADMIN_PHONE="<管理员手机号>"
$env:ADMIN_PASSWORD="<管理员强密码>"
docker compose --env-file deploy/.env -f deploy/docker-compose.test.yml run --rm `
  -e ADMIN_PHONE -e ADMIN_PASSWORD api pnpm admin:set-password
Remove-Item Env:ADMIN_PHONE, Env:ADMIN_PASSWORD
```

为在职教师初始化教师网页强密码（不要将明文写入 `deploy/.env`）：

```powershell
$env:TEACHER_WEB_PHONE="<教师手机号>"
$env:TEACHER_WEB_PASSWORD="<至少12位且包含大小写字母、数字和特殊字符>"
docker compose --env-file deploy/.env -f deploy/docker-compose.test.yml run --rm `
  -e TEACHER_WEB_PHONE -e TEACHER_WEB_PASSWORD api pnpm teacher-web:set-password
Remove-Item Env:TEACHER_WEB_PHONE, Env:TEACHER_WEB_PASSWORD
```

## 4. 部署后验证

检查日志：

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.test.yml logs --tail 100 api web teacher-web
```

API 日志为单行 JSON，可通过 `requestId` 关联小程序错误与服务端请求。Docker 默认对数据库、API 和 Web 日志执行 10 MB × 5 文件轮转，详见 `docs/observability.md`。

从开发电脑执行生产模式发布门禁。管理员密码仅放在当前终端临时环境变量中：

```powershell
$env:VERIFY_APP_VERSION="<git-commit-sha>"
$env:VERIFY_ADMIN_PASSWORD="<管理员密码>"
pnpm verify:release -- `
  -BaseUrl https://api.ruizhibo.com/api `
  -AdminUrl https://api.ruizhibo.com `
  -ExpectedCorsOrigin https://teacher.ruizhibo.com `
  -ExpectedStorageDriver local `
  -RequireHttps
Remove-Item Env:VERIFY_APP_VERSION, Env:VERIFY_ADMIN_PASSWORD
```

分别验证两个站点、API 代理和 SPA 刷新：

```powershell
curl.exe --fail --head https://api.ruizhibo.com/
curl.exe --fail https://api.ruizhibo.com/api/health
curl.exe --fail --head https://teacher.ruizhibo.com/
curl.exe --fail https://teacher.ruizhibo.com/api/health
curl.exe --fail --head https://teacher.ruizhibo.com/course/refresh-check
```

第一个域名应返回管理后台，第二个域名应返回教师学院；教师网页的 JS/CSS 资源应从自身域名加载，不得包含 `localhost`、数据库连接串或服务端密钥。

该命令检查部署版本、正式管理员登录、开发登录禁用、CORS、安全响应头、生产后台包和真实文件上传。完整说明见 `docs/release-verification.md`。

验证请求 ID 和错误关联：

```powershell
pnpm --filter @ruizhibo/api verify:observability -- `
  -BaseUrl https://api.ruizhibo.com/api
```

`verify:deployment -RunApiSuite` 只保留给封闭开发环境；它依赖 `dev-login`，不能与 `verify:release` 混用。公网环境不要为了运行开发 API 套件而开启开发登录。

## 5. 小程序体验版配置

在微信公众平台分别为教师端、家长端配置：

- 教师端和家长端必须使用两个不同的小程序 AppID，并在服务器分别配置对应 AppSecret

- request 合法域名：`https://api.ruizhibo.com`
- uploadFile 合法域名：`https://api.ruizhibo.com`
- downloadFile 合法域名：`https://api.ruizhibo.com`（用于 `/uploads/*` 图片）

若 `FILE_STORAGE_DRIVER=s3`，还需把 `S3_PUBLIC_BASE_URL` 的 HTTPS 域名加入 downloadFile 合法域名。完整对象存储配置见 `docs/file-storage.md`。

使用正式构建脚本生成体验版。脚本会强制启用微信登录，检查 AppID、HTTPS API、合法域名校验开关及构建产物：

```powershell
pnpm build:miniapp:release -- `
  -App parent `
  -ExpectedAppId wx3052c81467eead2a

# 注册教师端正式小程序并更新 project.config.json 后再执行：
pnpm build:miniapp:release -- `
  -App teacher `
  -ExpectedAppId <teacher-miniapp-app-id>
```

分别将 `apps/teacher-miniapp/dist`、`apps/parent-miniapp/dist` 导入微信开发者工具，确认项目使用对应小程序 AppID 后上传体验版。

## 6. 数据与回滚

容器卷 `postgres_data` 保存数据库，`uploads_data` 保存当前本地文件，Caddy 证书位于 `caddy_data`。升级前应同时备份数据库与上传卷：

```powershell
pnpm backup:deployment
```

该命令会创建带 SHA-256 清单的 PostgreSQL 转储和 local 上传文件归档。恢复默认只校验，必须显式追加 `-ConfirmRestore` 才会覆盖当前数据，完整操作见 `docs/backup-and-restore.md`。

更新代码后重新执行 `up -d --build`。回滚时切回上一 Git 版本，然后按该版本的 Compose 配置重新构建 `api web teacher-web`；教师网页不保存业务数据，回滚静态镜像不需要删除 PostgreSQL、上传文件或 Caddy 卷。数据库 schema 变化必须先准备兼容或反向迁移方案。

停止服务但保留数据：

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.test.yml down
```

不要对已有测试数据执行 `down -v`，该命令会删除数据库与上传卷。
