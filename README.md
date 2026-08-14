# 锐之博托管中心系统

这是“锐之博”托管中心的工程化项目，覆盖家长端小程序、教师端小程序、管理后台、后端 API、共享类型和经营工具。历史静态原型已归档保留。

学生不作为登录端存在，只作为业务实体由家长和教师围绕其成长记录、作业、出勤和沟通来协作。

## 目录结构

```text
.
├── apps/
│   ├── api/                 # NestJS + Prisma 后端服务
│   ├── admin-web/           # React + Ant Design 管理后台
│   ├── parent-miniapp/      # Taro 家长端微信小程序工程
│   └── teacher-miniapp/     # Taro 教师端微信小程序工程
├── archive/
│   └── apps/                # 历史静态原型和品牌官网静态页
├── packages/
│   └── shared/              # 跨端共享类型和常量
├── assets/                  # 共享图片素材
├── docs/                    # 产品、接口、数据库、开发文档
├── outputs/                 # 工具生成产物
├── tools/                   # 本地经营工具脚本
├── .env.example             # 环境变量示例
├── package.json             # pnpm workspace 入口
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## 应用入口

| 模块 | 路径 | 说明 |
| --- | --- | --- |
| 后端 API | `apps/api` | NestJS 服务，Prisma schema 已初始化 |
| 管理后台 | `apps/admin-web` | 管理老师、班级、学生、家长绑定、流程模板，并查询关键业务记录 |
| 家长小程序 | `apps/parent-miniapp` | 家长查看孩子动态、提交作业、确认通知/任务并与老师沟通 |
| 教师小程序 | `apps/teacher-miniapp` | 教师工作台、备课、教研、教学记录、一日流程打卡、家校沟通 |
| 家长静态原型 | `archive/apps/parent-app/index.html` | 视觉和交互参考 |
| 教师静态原型 | `archive/apps/teacher-app/index.html` | 小程序样式参考 |
| 品牌官网 | `archive/apps/website/index.html` | 品牌展示与咨询转化 |
| 经营测算工具 | `tools/build_new_store_model.mjs` | 生成新店测算 Excel |

## 文档索引

- `docs/product.md`：产品定位、角色、MVP 范围和端侧功能。
- `docs/database.md`：PostgreSQL + Prisma 数据模型设计。
- `docs/api.md`：当前后端 API、请求示例、错误格式和本地验证说明。
- `docs/development.md`：当前开发状态、人工联调路径和下一阶段建议。
- `docs/development-roadmap.md`：分阶段变更提案和后续提案池。
- `docs/ui-development-path.md`：小程序页面、视觉和未完成功能的分批完善路径。
- `docs/deployment-checklist.md`：测试环境/生产环境部署检查清单。
- `docs/backup-and-restore.md`：Docker 数据库与 local 上传文件的备份、校验和恢复流程。
- `docs/observability.md`：API 结构化日志、请求 ID、Docker 日志轮转和故障定位。
- `docs/锐之博高端托管班级一日流程.xls`：原始班级一日流程资料。

## 开发准备

项目使用 pnpm workspace。首次开发建议：

```powershell
pnpm install
Copy-Item .env.example .env
pnpm typecheck
```

常用命令：

```powershell
pnpm dev:api       # 启动后端
pnpm dev:admin     # 启动管理后台
pnpm dev:parent    # 构建并监听家长小程序
pnpm dev:teacher   # 构建并监听教师小程序
pnpm build         # 构建所有正式工程
```

本地联调前建议先写入 seed 数据：

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ruizhibo"
$env:JWT_SECRET="change-me-in-production"
pnpm --filter @ruizhibo/api seed
```

## 数据库

后端默认使用 PostgreSQL + Prisma。Schema 位于：

```text
apps/api/prisma/schema.prisma
```

环境变量示例在 `.env.example`：

```text
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ruizhibo?schema=public"
JWT_SECRET="replace-with-a-local-secret"
```

## 当前工程状态

- `api` 已实现认证、角色权限、统一错误、管理基础数据、流程模板、教师工作台、一日流程打卡、教学记录、成长反馈、作业发布/提交/批改、家校消息、通知/任务回执、文件上传和审计日志。
- `admin-web` 已接入真实 API，可维护老师、班级、学生、家长绑定、流程模板并查看审计日志。
- `teacher-miniapp` 已接入真实 API，首页视觉重构中；流程打卡、作业、通知/任务、消息和聊天闭环可用，教学记录前端、备课和教研仍需补齐。
- `parent-miniapp` 已接入真实 API，首页视觉重构中；作业提交、成长时间线、通知/任务、消息和聊天闭环可用，“我的”页面仍需补齐。
- `parent-app`、`teacher-app`、`website` 已移动到 `archive/apps/`，仅作为历史视觉参考。
- 环境配置抽离及 UI-01 至 UI-09 已完成，并通过微信开发者工具与真机验收。当前进入 CP-23 微信登录生产闭环，随后继续自动验证脚本和测试环境部署。
