# 管理后台认证

管理后台使用独立的手机号与密码登录，不依赖微信账号，也不需要开启开发登录。正式环境必须保持 `ENABLE_DEV_LOGIN=false`，并通过 HTTPS 访问。

## 初始化或重置管理员密码

管理员账号需要先由 seed 或数据库迁移流程创建。密码不得写入 `.env`、部署文件、文档或 Git；仅在执行命令的当前进程中临时设置：

```powershell
$env:ADMIN_PHONE="<管理员手机号>"
$env:ADMIN_PASSWORD="<临时输入的强密码>"
pnpm --filter @ruizhibo/api admin:set-password
Remove-Item Env:ADMIN_PHONE, Env:ADMIN_PASSWORD
```

Docker 部署环境使用同一个脚本：

```powershell
$env:ADMIN_PHONE="<管理员手机号>"
$env:ADMIN_PASSWORD="<临时输入的强密码>"
docker compose --env-file deploy/.env -f deploy/docker-compose.test.yml run --rm `
  -e ADMIN_PHONE -e ADMIN_PASSWORD api pnpm admin:set-password
Remove-Item Env:ADMIN_PHONE, Env:ADMIN_PASSWORD
```

密码必须为 12–128 位，并同时包含大写字母、小写字母、数字和特殊字符。脚本只保存带随机盐的 scrypt 哈希，并记录 `auth.admin.password.set` 审计事件。首次部署、管理员交接或怀疑密码泄露时应立即执行重置。

## 登录与会话

管理后台调用：

```http
POST /api/auth/admin-login
Content-Type: application/json

{
  "phone": "<管理员手机号>",
  "password": "<管理员密码>"
}
```

成功后返回管理员资料与 JWT。管理员令牌有效期为 8 小时，Web 端只保存在当前浏览器标签会话的 `sessionStorage` 中；关闭标签页或点击“退出登录”后需要重新登录。接口统一返回“手机号或密码错误”，不会暴露账号是否存在、是否停用或是否尚未设置密码。

同一手机号 15 分钟内最多允许 10 次失败，同一来源 IP 最多允许 30 次失败，超限后返回 HTTP 429。反向代理后的来源 IP 依赖 `TRUST_PROXY_HOPS`：直接运行 API 使用 `0`，当前单层 Caddy 部署使用 `1`；只有代理拓扑明确时才能提高该值。

当前限流状态保存在单个 API 进程内，适合现有单实例部署；以后扩展为多实例时，应迁移到 Redis 或统一网关限流。

## 验证

先启动 API，再使用临时环境变量运行登录、身份和管理员权限回归：

```powershell
$env:VERIFY_ADMIN_PHONE="<管理员手机号>"
$env:VERIFY_ADMIN_PASSWORD="<管理员密码>"
pnpm --filter @ruizhibo/api verify:admin-auth
Remove-Item Env:VERIFY_ADMIN_PHONE, Env:VERIFY_ADMIN_PASSWORD
```

生产构建不会显示“使用本地开发账号登录”按钮。部署后还应人工确认：错误密码无法登录、正确密码可进入管理页面、刷新后当前标签页仍登录、退出后受保护页面不可访问。
