# 锐之博托管中心系统

这是“锐之博”托管中心的工程化项目骨架，覆盖家长端小程序、教师端小程序、管理后台、后端 API、共享类型和经营工具。历史静态原型已归档保留。

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
| 管理后台 | `apps/admin-web` | 管理老师、班级、学生、家长绑定、流程模板 |
| 家长小程序 | `apps/parent-miniapp` | 家长查看孩子动态、作业、成长记录并与老师沟通 |
| 教师小程序 | `apps/teacher-miniapp` | 教师工作台、备课、教研、教学记录、一日流程打卡 |
| 家长静态原型 | `archive/apps/parent-app/index.html` | 视觉和交互参考 |
| 教师静态原型 | `archive/apps/teacher-app/index.html` | 小程序样式参考 |
| 品牌官网 | `archive/apps/website/index.html` | 品牌展示与咨询转化 |
| 经营测算工具 | `tools/build_new_store_model.mjs` | 生成新店测算 Excel |

## 文档索引

- `docs/product.md`：产品定位、角色、MVP 范围和端侧功能。
- `docs/database.md`：PostgreSQL + Prisma 数据模型设计。
- `docs/api.md`：家长端、教师端、管理后台 API 草案。
- `docs/development.md`：适合交给 Codex 分步开发的任务计划。
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

> 依赖尚未安装时，先不要期待上述命令全部可运行；骨架文件和文档已经就位，下一步可以从 `docs/development.md` 的任务 1 开始。

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

- 已保留上一阶段静态原型，用作正式小程序和后台开发的视觉参考。
- 已搭建 `api`、`admin-web`、`parent-miniapp`、`teacher-miniapp`、`packages/shared`。
- 已生成产品、接口、数据库和 Codex 开发计划文档。
- 已保留经营测算工具，输出文件位于 `outputs/new_store_model/新店测算表_合肥分店.xlsx`。
