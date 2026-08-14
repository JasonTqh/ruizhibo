# AGENT.md

## 项目定位

这是“锐之博托管中心”项目，目标是支持管理后台、教师端小程序、家长端小程序和后端 API 的一体化业务闭环。

核心链路：

```text
管理后台维护基础数据
-> 教师端查看班级/学生并完成流程打卡、作业、成长反馈
-> 教师端发布通知/任务并跟进家长回执
-> 家长端查看孩子动态、提交作业、确认通知/任务和家校消息
-> 管理后台查看审计与运营数据
```

## 仓库结构

```text
apps/api                 NestJS + Prisma 后端 API
apps/admin-web           React + Vite + Ant Design 管理后台
apps/teacher-miniapp     Taro React 教师端微信小程序
apps/parent-miniapp      Taro React 家长端微信小程序
packages/shared          共享类型/工具
docs                     产品、接口、数据库、部署和开发文档
tools                    辅助脚本
assets                   设计或素材资源
archive/apps             历史静态原型和品牌官网静态页
```

优先阅读：

```text
README.md
docs/product.md
docs/development.md
docs/database.md
docs/api.md
docs/development-roadmap.md
docs/deployment-checklist.md
docs/environment.md
docs/test-environment-deployment.md
docs/release-verification.md
```

## 本地环境

项目使用 pnpm workspace。

```powershell
pnpm install
```

后端默认依赖 PostgreSQL：

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ruizhibo"
$env:JWT_SECRET="change-me-in-production"
```

种子数据：

```powershell
pnpm --filter @ruizhibo/api seed
```

开发账号：

```text
admin   13800000000
teacher 13800000001
parent  13800000002
```

## 常用命令

根目录：

```powershell
pnpm typecheck
pnpm build
pnpm lint
pnpm format
```

后端：

```powershell
pnpm dev:api
pnpm --filter @ruizhibo/api typecheck
pnpm --filter @ruizhibo/api build
pnpm --filter @ruizhibo/api seed
pnpm --filter @ruizhibo/api verify:admin
pnpm --filter @ruizhibo/api verify:all
```

管理后台：

```powershell
pnpm dev:admin
pnpm --filter @ruizhibo/admin-web typecheck
pnpm --filter @ruizhibo/admin-web build
```

教师端小程序：

```powershell
pnpm dev:teacher
pnpm --filter @ruizhibo/teacher-miniapp typecheck
pnpm --filter @ruizhibo/teacher-miniapp build
```

家长端小程序：

```powershell
pnpm dev:parent
pnpm --filter @ruizhibo/parent-miniapp typecheck
pnpm --filter @ruizhibo/parent-miniapp build
```

## 本地联调入口

后端 API：

```text
http://localhost:3000/api
```

管理后台：

```text
http://localhost:5173
```

微信开发者工具导入目录：

```text
apps/teacher-miniapp/dist
apps/parent-miniapp/dist
```

微信开发者工具本地调试时，需要在“详情 -> 本地设置”中勾选：

```text
不校验合法域名、web-view、TLS 版本以及 HTTPS 证书
```

真机预览时，不能继续使用 `localhost`，需要把小程序 API 地址改成电脑局域网 IP，并保证手机和电脑在同一网络。

## 后端约定

- 后端使用 NestJS 模块化组织。
- Prisma schema 是数据库模型来源。
- API 返回结构优先保持 `{ data: ... }`。
- 错误响应由全局错误过滤器统一处理。
- 权限使用 `AuthGuard` + `RolesGuard` + `@Roles(...)`。
- 管理端写操作应记录审计日志。
- 教师端通知/任务使用 `Notice` + `NoticeReceipt`，不要复用一对一 `Message`。
- 新增业务模块时优先放在 `apps/api/src/modules/<module>`。
- DTO 使用 `class-validator` 做输入校验。
- 不要把开发期 `dev-login` 当作生产登录方案。

## 前端约定

管理后台：

- 使用 React、Vite、Ant Design。
- 优先保持后台工具风格：信息密度适中、表格清晰、表单可验证。
- 接口地址通过 `VITE_API_BASE_URL` 配置，未设置时默认 `http://localhost:3000/api`。

小程序：

- 使用 Taro React。
- 教师端和家长端通过 `TARO_APP_AUTH_MODE` 切换登录模式：本地联调用 `dev`，体验版和生产用 `wechat`。
- 小程序 API 地址通过 `TARO_APP_API_BASE_URL` 配置，真机预览不能使用 `localhost`。
- 页面需要有加载态、空状态、错误态。
- 小程序构建输出为各自应用的 `dist` 目录。
- 当前 Taro 编译链对 TS/JSX 有兼容注意点，修改动态页面后必须跑对应 build。

## 验证清单

每次完成后端或跨端功能，至少执行：

```powershell
pnpm --filter @ruizhibo/api typecheck
pnpm --filter @ruizhibo/api build
pnpm --filter @ruizhibo/api seed
pnpm --filter @ruizhibo/api verify:admin
pnpm --filter @ruizhibo/api verify:teacher
pnpm --filter @ruizhibo/api verify:parent
```

每次完成全仓变更，执行：

```powershell
pnpm typecheck
pnpm build
```

涉及小程序时额外执行：

```powershell
pnpm --filter @ruizhibo/teacher-miniapp typecheck
pnpm --filter @ruizhibo/parent-miniapp typecheck
pnpm --filter @ruizhibo/teacher-miniapp build
pnpm --filter @ruizhibo/parent-miniapp build
```

测试/生产发布前执行：

```powershell
pnpm verify:release -- `
  -BaseUrl <https-api-url> `
  -ExpectedVersion <git-sha> `
  -AdminPhone <admin-phone> `
  -AdminPassword <admin-password>
```

人工验收核心链路：

```text
1. 管理后台正式登录，新增老师、班级、学生和家长绑定。
2. 教师端查看班级和学生。
3. 教师端完成今日流程检查。
4. 教师端创建或查看备课、教研、教学记录。
5. 教师端发布作业或成长反馈。
6. 家长端查看并提交作业。
7. 教师端批改作业。
8. 教师端发布通知或任务。
9. 家长端查看并确认通知/任务。
10. 教师端查看逐位回执。
11. 家长端查看成长时间线。
12. 家长端发送文本或图片消息。
13. 教师端进入聊天详情并回复消息。
14. 管理后台查看业务记录和审计日志。
```

## Git 与文件约定

- 不要提交生成物：`dist/`、`.taro/`、`.swc/`、`*.tsbuildinfo`、`apps/api/uploads/`。
- 不要提交 `.env` 或真实密钥。
- 修改前先看当前工作区状态，避免覆盖用户未提交变更。
- 代码改动应尽量小步、可验证、贴近现有目录结构。
- 文档变更放在 `docs/`，接口变更同步更新 `docs/api.md`。

## 下一阶段优先事项

建议按以下顺序推进：

```text
1. 配置真实 HTTPS 测试域名和微信 request/downloadFile 合法域名。
2. 配置教师端、家长端正式 AppID/AppSecret，构建 wechat 模式体验版。
3. 在测试环境执行 verify:release、文件上传验证和备份/恢复演练。
4. 走一遍管理后台、教师端、家长端人工验收主链路。
5. 组织老师、家长小范围试运行，按反馈拆分后续微调提案。
```

## 给后续 Agent 的注意事项

- 用户主要以中文沟通，最终说明优先使用中文。
- 如果用户说“继续”，先检查最新 `git status`、现有计划和最近验证结果，再决定下一步。
- 如果涉及微信小程序联调，优先确认 API 是否启动、数据库是否已 seed、微信开发者工具是否允许本地请求。
- 如果涉及体验版或生产联调，优先确认 `ENABLE_DEV_LOGIN=false`、`TARO_APP_AUTH_MODE=wechat`、微信合法域名和 AppSecret。
- 如果看到页面数据为 0，不要只改前端，先验证对应 API 是否返回真实数据。
- 如果修改 Taro 页面，必须至少跑对应小程序的 `typecheck` 和 `build`。
