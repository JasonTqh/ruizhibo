# 文件存储

`POST /api/files` 保持 JSON/Base64 协议不变，后端通过 `FILE_STORAGE_DRIVER` 在本地磁盘和 S3 兼容对象存储之间切换。每个文件都会在 `FileAsset` 中记录 URL、MIME、大小、上传人、场景、存储驱动和对象 key。

## 本地存储

本地开发和封闭测试环境可以使用：

```text
FILE_STORAGE_DRIVER=local
LOCAL_UPLOAD_DIR=uploads
```

API 将文件写入该目录并通过 `/uploads/*` 提供静态访问。容器部署已将 `/data/uploads` 挂载到持久化卷。

## S3 兼容对象存储

腾讯云 COS、阿里云 OSS、AWS S3 或其他兼容服务使用：

```text
FILE_STORAGE_DRIVER=s3
S3_REGION=<region>
S3_ENDPOINT=<provider-endpoint>
S3_BUCKET=<bucket-name>
S3_ACCESS_KEY_ID=<access-key>
S3_SECRET_ACCESS_KEY=<secret-key>
S3_PUBLIC_BASE_URL=https://static.example.com
S3_FORCE_PATH_STYLE=false
```

- AWS S3 通常可不设置 `S3_ENDPOINT`；其他服务按控制台提供的 S3 兼容 endpoint 填写。
- MinIO 等需要路径风格访问的服务设置 `S3_FORCE_PATH_STYLE=true`。
- `S3_PUBLIC_BASE_URL` 是客户端最终访问文件的公开前缀，可以是桶公开域名或 CDN 域名；不要填写 API 容器内部地址。
- Access Key 和 Secret Key 只配置在 API 服务端，不能提交 Git，也不能写入小程序环境变量。
- 存储桶至少需要允许读取已上传对象，但应禁止匿名列目录。涉及儿童照片时建议使用专用域名、随机对象 key、最小权限密钥及具备访问控制能力的 CDN。

写对象成功但 `FileAsset` 入库失败时，API 会尝试删除刚写入的对象，避免留下无元数据的孤立文件。

## 文件校验

允许的类型：

- `image/jpeg`
- `image/png`
- `image/webp`
- `image/gif`
- `application/pdf`

单文件解码后最大 10 MB。后端同时检查 Base64、声明大小、MIME 白名单和文件内容签名。教师端流程照片与家长端作业图片会在选择和上传阶段显示明确的大小、格式或存储错误，并保留尚未提交的页面内容。

## 自动验证

本地 API 使用 local 驱动时运行：

```powershell
pnpm --filter @ruizhibo/api verify:storage
```

脚本会验证有效 PNG 上传、公开读取、`FileAsset` 存储元数据，以及非法类型、伪造内容和大小不一致拒绝。

需要在本机验证真实 S3 协议时，可使用 MinIO 覆盖配置：

```powershell
docker compose --env-file deploy/.env.example `
  -f deploy/docker-compose.test.yml `
  -f deploy/docker-compose.storage.yml up -d --build

docker compose --env-file deploy/.env.example `
  -f deploy/docker-compose.test.yml `
  -f deploy/docker-compose.storage.yml run --rm api pnpm seed

pnpm --filter @ruizhibo/api verify:storage -- `
  -BaseUrl http://localhost:8080/api `
  -ExpectedDriver s3

pnpm verify:deployment -- -ExpectedStorageDriver s3
```

MinIO API 默认位于 `http://localhost:9000`，控制台位于 `http://localhost:9001`。测试结束后停止服务但保留卷：

```powershell
docker compose --env-file deploy/.env.example `
  -f deploy/docker-compose.test.yml `
  -f deploy/docker-compose.storage.yml down
```

## 小程序域名

local 驱动经 Caddy 同域访问时，`downloadFile` 合法域名与 API 域名相同。使用对象存储或 CDN 后，还需将 `S3_PUBLIC_BASE_URL` 对应的 HTTPS 域名加入教师端、家长端的 downloadFile 合法域名。
