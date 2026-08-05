# AGENT.md

## 项目定位

这是“锐之博托管中心”项目，目标是支持管理后台、教师端小程序、家长端小程序和后端 API 的一体化业务闭环。

核心链路：

```text
管理后台维护基础数据
-> 教师端查看班级/学生并完成流程打卡、作业、成长反馈
-> 家长端查看孩子动态、作业和家校消息
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
- 新增业务模块时优先放在 `apps/api/src/modules/<module>`。
- DTO 使用 `class-validator` 做输入校验。
- 不要把开发期 `dev-login` 当作生产登录方案。

## 前端约定

管理后台：

- 使用 React、Vite、Ant Design。
- 优先保持后台工具风格：信息密度适中、表格清晰、表单可验证。
- 接口地址当前在页面中指向 `http://localhost:3000/api`，后续应抽成环境变量。

小程序：

- 使用 Taro React。
- 教师端和家长端当前会自动调用 `dev-login`。
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
```

每次完成全仓变更，执行：

```powershell
pnpm typecheck
pnpm build
```

涉及小程序时额外执行：

```powershell
pnpm --filter @ruizhibo/teacher-miniapp build
pnpm --filter @ruizhibo/parent-miniapp build
```

人工验收核心链路：

```text
1. 管理后台新增老师、班级、学生和家长绑定。
2. 教师端查看班级和学生。
3. 教师端完成今日流程检查。
4. 教师端发布作业或成长反馈。
5. 家长端查看成长时间线和作业。
6. 家长端发送消息。
7. 教师端查看并回复消息。
8. 管理后台查看审计日志。
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
1. 修复小程序和文档中的中文编码/显示问题。
2. 把 API_BASE_URL 抽成环境配置。
3. 完成真实微信登录、手机号绑定和生产禁用 dev-login。
4. 完善教师端/家长端页面交互、空状态和错误提示。
5. 增加 teacher/parent 自动验证脚本。
6. 准备测试环境部署与 HTTPS 合法域名。
7. 接入真实文件上传存储、日志和备份。
```

## 给后续 Agent 的注意事项

- 用户主要以中文沟通，最终说明优先使用中文。
- 如果用户说“继续”，先检查最新 `git status`、现有计划和最近验证结果，再决定下一步。
- 如果涉及微信小程序联调，优先确认 API 是否启动、数据库是否已 seed、微信开发者工具是否允许本地请求。
- 如果看到页面数据为 0，不要只改前端，先验证对应 API 是否返回真实数据。
- 如果修改 Taro 页面，必须至少跑对应小程序的 `typecheck` 和 `build`。
