# 正式发布验收

`pnpm verify:release` 用于验证已经按生产模式构建并部署的测试或正式环境。它不会开启或依赖开发登录；会先在本地构建并执行 workflow 图片归属策略回归、只读检查部署配置，再对目标环境执行管理员登录、健康、CORS、代理和存储验证。远程环境只会新增管理员登录审计和一张 68 字节验证图片，不会修改其他业务数据。

## 1. 发布版本标识

部署前把本次 Git 提交写入 `deploy/.env`：

```powershell
git rev-parse HEAD
```

```text
APP_VERSION=<完整 Git 提交 SHA>
```

API 会在 `/api/health` 返回该版本。验收脚本通过 `VERIFY_APP_VERSION` 对比预期提交，避免验证到旧容器或错误服务器。管理员正式登录同时依赖最新的 `passwordHash` 数据库字段，因此登录成功也能证明相关迁移已经生效。

## 2. 执行发布门禁

管理员密码只通过当前终端的临时环境变量传入，不得写入命令参数、文档或 Git：

```powershell
$env:VERIFY_APP_VERSION="<完整 Git 提交 SHA>"
$env:VERIFY_ADMIN_PASSWORD="<管理员密码>"
pnpm verify:release -- `
  -BaseUrl https://test.example.com/api `
  -AdminUrl https://test.example.com `
  -DeploymentEnvPath deploy/.env `
  -ExpectedCorsOrigin https://test.example.com `
  -ExpectedStorageDriver local `
  -RequireHttps
Remove-Item Env:VERIFY_APP_VERSION, Env:VERIFY_ADMIN_PASSWORD
```

对象存储环境把 `-ExpectedStorageDriver` 改为 `s3`。脚本默认上传一张极小 PNG 并检查公开读取；仅在存储平台正在维护且已经有独立验证证据时，才能显式使用 `-SkipStorageUpload`。

## 3. 自动检查范围

- API、数据库和存储驱动健康状态。
- 部署版本与预期 Git 提交一致。
- 管理后台入口及正式生产 JavaScript 包可读取。
- `X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`，以及 HTTPS 下的 HSTS。
- 后台域名可以跨域访问 API，随机非法域名不会获得 CORS 授权。
- `/api/auth/dev-login` 返回 403。
- 管理员手机号/密码登录、`/api/me` 和管理员接口权限正常。
- 生产前端包包含正式登录且不包含开发登录接口。
- 真实文件上传使用预期驱动，返回文件可以公开读取。
- 本地策略门禁覆盖 workflow 图片存在性、ownerId、scene 和图片 MIME。
- 部署配置审计确认 `ENABLE_DEV_LOGIN=false`，JWT/PostgreSQL 密钥不是占位值，CORS 明确配置，文件存储与持久卷存在，Caddy/备份/恢复资产齐全，教师端和家长端微信凭据均已填写。

完整 workflow HTTP 负向回归需要开发登录来创建并清理隔离数据，只允许在封闭环境运行：

```powershell
pnpm --filter @ruizhibo/api verify:workflow-images
```

它覆盖：当前教师 + workflow 成功、message scene 拒绝、homework scene 拒绝、其他教师 workflow 拒绝、不存在 FileAsset 拒绝。`verify:all` 已包含该脚本；正式发布门禁则运行不依赖开发登录的策略级同等五用例检查。

教师和家长的生产登录依赖一次性微信 code，不能由服务器脚本伪造。发布门禁通过后，仍需分别使用体验版完成一次微信登录、孩子/班级数据隔离、workflow 合法图片上传和核心业务只读检查。

## 4. 外部验收状态

以下项目不能由仓库脚本伪造，完成前统一标记为 `WAITING_FOR_EXTERNAL_ACCEPTANCE`：

1. 真实域名解析到部署服务器，管理后台与 API 使用可信 HTTPS 证书访问。
2. 微信公众平台分别为教师端、家长端配置 request、uploadFile、downloadFile 合法域名；域名必须与体验版实际请求一致。
3. 实际部署环境填写两端 AppID/AppSecret，重新构建 `TARO_APP_AUTH_MODE=wechat` 体验版。
4. 两个微信账号分别完成教师/家长登录或手机号绑定，并验证跨角色、跨家长数据隔离。
5. 教师真机上传 workflow 照片并完成打卡，刷新后图片仍可查看；上传失败时照片和错误反馈可见。
6. 在隔离环境执行一次 `-ConfirmRestore`，记录备份目录、耗时和恢复后健康检查结果。

代码检查通过应记录为“代码已完成”，不得因上述外部项目待验收而改写成代码未完成；同样也不得把未执行的外部项目写成已完成。

## 5. 备份与恢复门禁

升级已有环境前先创建备份并校验：

```powershell
pnpm backup:deployment
pnpm restore:deployment -- `
  -BackupDirectory <本次备份目录> `
  -ValidateOnly
```

首次上线或每季度至少在隔离环境执行一次带 `-ConfirmRestore` 的完整恢复演练。不要为了验收在正式数据库直接执行恢复。完整安全步骤见 `docs/backup-and-restore.md`。

## 6. 本地生产模式回归

本地可以使用 Docker、`http://localhost` 和独立测试数据运行同一门禁，但不传 `-RequireHttps`。这只能验证容器构建、反向代理与应用行为，不能代替真实域名、TLS 证书、微信合法域名和体验版验收。
