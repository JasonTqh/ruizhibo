# API 运行日志与请求追踪

API 使用单行 JSON 输出运行日志，并为每个 HTTP 请求生成请求 ID。目标是让小程序上报的错误可以与服务端日志快速关联，同时避免把密码、Token、微信 code 或上传文件内容写入日志。

## 1. 请求 ID

所有 API 响应都包含：

```http
X-Request-Id: 18c0538f-5c2e-4ca1-83c6-4f982e32d95e
```

客户端可以传入自己的 `X-Request-Id`。只有长度不超过 128，且仅包含字母、数字、`.`、`_`、`:` 和 `-` 的值才会被接受；其他值会被服务端 UUID 替换，防止日志注入和过长标识。

错误响应会在 JSON 中重复返回同一个 ID：

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Cannot GET /api/example",
    "requestId": "18c0538f-5c2e-4ca1-83c6-4f982e32d95e"
  }
}
```

用户报障时优先记录 `requestId`、操作时间和操作页面，不要让用户发送登录 Token。

## 2. 日志格式

启动日志：

```json
{"timestamp":"2026-08-14T01:00:00.000Z","level":"info","service":"ruizhibo-api","event":"service_started","port":3000,"environment":"production","fileStorage":"s3"}
```

HTTP 访问日志：

```json
{"timestamp":"2026-08-14T01:01:00.000Z","level":"info","service":"ruizhibo-api","event":"http_request","requestId":"...","method":"GET","path":"/api/health","statusCode":200,"durationMs":4.25}
```

已通过认证的请求会额外记录 `userId` 和 `userRole`。不记录以下内容：

- Authorization 请求头和 JWT。
- 请求体、表单内容和 Base64 文件。
- URL 查询串，只记录 `request.path`。
- 微信 code、openid、AppSecret 和数据库密码。

4xx 请求记为 `warn`，5xx 请求记为 `error`。未处理异常会额外输出 `http_exception`，只记录异常类型和错误码，不记录原始请求数据。

## 3. 配置

API 日志级别：

```text
LOG_LEVEL=info
```

可选值为 `debug`、`info`、`warn`、`error`，无效值回退到 `info`。生产环境建议使用 `info`，异常流量期间可临时提高到 `warn`。

Docker `json-file` 轮转配置：

```text
LOG_MAX_SIZE=10m
LOG_MAX_FILES=5
```

该设置作用于 Compose 中的 PostgreSQL、API 和 Web 容器，防止单个容器日志无限增长。

## 4. 查询日志

查看最近日志：

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.test.yml logs --tail 100 api
```

持续跟踪：

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.test.yml logs -f api
```

通过请求 ID 过滤：

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.test.yml logs --no-log-prefix api |
  Select-String '18c0538f-5c2e-4ca1-83c6-4f982e32d95e'
```

如果后续接入 Loki、ELK 或云日志服务，可以直接按 `service`、`event`、`level`、`requestId`、`userId` 和 `statusCode` 建立索引。

## 5. 验证

启动 API 后执行：

```powershell
pnpm --filter @ruizhibo/api verify:observability
```

指定测试环境：

```powershell
pnpm --filter @ruizhibo/api verify:observability -- `
  -BaseUrl https://test.example.com/api
```

脚本会验证安全 ID 透传、非法 ID 替换、错误响应头与 JSON 关联。
