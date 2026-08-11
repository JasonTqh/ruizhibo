# 前端环境配置

管理后台、教师小程序和家长小程序都从环境变量读取 API 地址。未配置时默认使用：

```text
http://localhost:3000/api
```

API 地址必须包含协议和 `/api` 路径，末尾的 `/` 会被自动移除。修改环境文件后需要重新启动对应开发进程。

## 管理后台

```powershell
Copy-Item apps/admin-web/.env.example apps/admin-web/.env.local
```

配置项：

```text
VITE_API_BASE_URL=http://localhost:3000/api
```

## 教师小程序

```powershell
Copy-Item apps/teacher-miniapp/.env.example apps/teacher-miniapp/.env.local
```

配置项：

```text
TARO_APP_API_BASE_URL=http://localhost:3000/api
```

## 家长小程序

```powershell
Copy-Item apps/parent-miniapp/.env.example apps/parent-miniapp/.env.local
```

配置项：

```text
TARO_APP_API_BASE_URL=http://localhost:3000/api
```

## 真机联调

手机不能通过 `localhost` 访问电脑。把两个小程序的地址改为电脑局域网 IP，例如：

```text
TARO_APP_API_BASE_URL=http://192.168.1.20:3000/api
```

同时保证手机与电脑处于同一网络，Windows 防火墙允许访问 3000 端口，API 服务监听可被局域网访问的地址。

## 测试与生产

测试和生产环境应使用已备案并配置到微信公众平台的 HTTPS 域名，例如：

```text
VITE_API_BASE_URL=https://test-api.example.com/api
TARO_APP_API_BASE_URL=https://test-api.example.com/api
```

不要把 `.env.local`、真实域名凭据或密钥提交到 Git；仓库只提交 `.env.example`。
