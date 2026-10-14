# 同手机号多身份账号规则

同一人可能同时是管理员、托管教师和家长。系统允许同一手机号分别登记三种身份；同一角色仍只能有一个账号。本次不提供身份合并、自动提权或小程序内切换角色。

## 使用方式

1. 保留原管理员，在老师管理中用同一手机号创建教师身份，分配班级。
2. 如同时是家长，在家长管理或学生家长绑定中登记家长身份并绑定孩子。
3. 管理后台、企业端教师小程序、家长小程序各自登录对应身份。两个小程序均需独立完成首次微信手机号绑定。
4. 各身份的姓名、启停、密码、微信绑定及业务关系独立。修改或停用一个身份不自动同步其他身份。注销自然人的所有访问时，需要逐个身份处理。
5. 同手机号的管理员不会在教师小程序中获得管理员权限。家长只看自己绑定的孩子，教师仍只访问授权的班级。禁止凭客户端传入 admin 角色进行微信登录。

微信 OpenID 的查找及唯一性改为 role + wechatOpenid，适用于当前 teacher/parent 各对应一套 AppID 的结构。一个角色增加多个 AppID 或更换 AppID 时，需要另行设计带 AppID 的绑定与迁移，不能复用旧 OpenID。

## 变更与兼容性

- 新增迁移只替换唯一索引，保留现有 User ID、角色、密码哈希、微信绑定和所有外键。
- 手机号采用 role + phone 联合唯一；数据库阻止同角色并发重复创建。
- 微信绑定采用条件更新，避免并发请求覆盖其他微信账号；本端重复绑定返回 409。
- 管理员和教师网页登录的手机号失败计数独立；IP 总体限流仍共享。
- 老师创建表单现在显示服务端错误，不再无反馈；老师/家长表单显示同手机号多身份说明。
- 新增成功后提示分配班级或绑定孩子；失败后保留表单输入，错误弹窗包含服务端消息及请求 ID。
- 小程序请求及令牌结构不变，不需要因本规则单独改小程序代码。

## 分支整合与依赖

2026-10-14 接手审核时，通过 GitHub 连接器核对并重新获取 `main`，基线为 `8b3af423611bbc31c9e1e919183501473baf689d`。功能分支原先额外包含 `2368b19`（小程序发布构建），本次已将该独立功能排除，`codex/role-scoped-accounts` 直接基于远程 main；已有多身份实现通过可恢复的 Git stash 完整保留后移入该基线。

本功能不依赖该小程序发布构建提交，不新增运行依赖、不修改两个小程序源文件。原项目工作区的用户修改不纳入本分支。

## 上线顺序

先审核 PR 并选择经批准的版本，按以下维护顺序发布。2026-10-14 用户追加授权提交、推送并发布到服务器后，已按本流程部署功能提交 `1fd01e755cf3704c924d8a5207c0a6fb5dd48381`，实际结果见下文。本次仍未合并 main，也未纳入原项目工作区的未提交修改。

1. 备份数据库、上传文件、配置和旧镜像，记录后端版本。确认备份可恢复。
2. 构建含新 Prisma Client 与迁移的新 API 镜像，以及管理后台 Web 镜像；只构建，暂不重启服务。
3. 停止所有旧 API 实例与后台任务，暂停写入；旧 API 不能与已允许跨角色同手机号的新数据库并行服务。
4. 使用新镜像执行 `prisma migrate deploy`，确认第 20 条迁移 `20261014030000_scope_user_identity_by_role` 成功。该事务先创建 `User_role_phone_key` 与 `User_role_wechatOpenid_key`，再移除旧全局唯一索引，不修改 User 或业务表数据。
5. 启动新 API，确认迁移状态和健康检查，再更新管理后台。检查同手机号新增教师和家长、重复角色拒绝、管理员密码登录、教师/家长微信登录与权限隔离。保持生产 `ENABLE_DEV_LOGIN=false`。
6. 不运行生产 seed、db push、reset 或 down -v。现有用户不自动获得新增身份。

现有 Docker Compose 部署在服务器上可使用以下顺序。下面是本次实际发布目录；以后升级时应先创建对应批准提交的独立发布目录，不要在保留的旧 main 工作区直接重新构建。真实环境文件仍保留在 `/home/ubuntu/ruizhibo/deploy/.env`，不得提交密钥：

```bash
# 在确认批准版本、备份可恢复后执行。
cd /home/ubuntu/ruizhibo-releases/1fd01e755cf3
docker compose --env-file /home/ubuntu/ruizhibo/deploy/.env -f deploy/docker-compose.test.yml config --quiet
docker compose --env-file /home/ubuntu/ruizhibo/deploy/.env -f deploy/docker-compose.test.yml build api web

# 维护窗口：确保不存在其他旧版 API 实例后迁移。
docker compose --env-file /home/ubuntu/ruizhibo/deploy/.env -f deploy/docker-compose.test.yml stop api
docker compose --env-file /home/ubuntu/ruizhibo/deploy/.env -f deploy/docker-compose.test.yml run --rm --no-deps api pnpm prisma:migrate
docker compose --env-file /home/ubuntu/ruizhibo/deploy/.env -f deploy/docker-compose.test.yml run --rm --no-deps api pnpm exec prisma migrate status

# 仅迁移成功后恢复 API 与后台；不重建或删除数据库卷。
docker compose --env-file /home/ubuntu/ruizhibo/deploy/.env -f deploy/docker-compose.test.yml up -d --no-deps api web
docker compose --env-file /home/ubuntu/ruizhibo/deploy/.env -f deploy/docker-compose.test.yml ps
```

API 镜像启动命令会再次执行迁移，已成功的迁移不会重复改写数据。发布配置中的 `APP_VERSION` 应设置为批准的实际提交号；健康检查与发布门禁见 `docs/release-verification.md`。

迁移会短暂锁表，需在维护时段操作。索引替换没有自动 down 迁移。出现跨角色重复手机号或重复 OpenID 后，直接恢复旧全局唯一索引会失败，旧代码也可能误选身份，因此不能只回退 API 镜像。回退需先停止写入，分别检查 phone 和 wechatOpenid 的跨角色重复及其业务关系，选择经审核的前向修复或备份恢复方案；不能为回退任意删除用户。即使尚无重复记录，也需要审查应用、索引和 Prisma 迁移历史的一致性后安排回退。

## 验证方法

本地集成测试只接受显式 ROLE_IDENTITY_TEST_DATABASE_URL，限制数据库名称 role_identity_test、主机 localhost/127.0.0.1、端口 55439，不继承项目 DATABASE_URL。请使用新建的专用测试数据库，不能复用业务库。

迁移验收准备顺序：

1. 用修改前基线的 19 条迁移创建空测试库。
2. 在该库执行 scripts/fixtures/role-identities-legacy.sql，建立旧管理员、微信教师和班级关系。
3. 对该库执行本分支 prisma migrate deploy，应用第 20 条 role-scoped 迁移。
4. 设置 ROLE_IDENTITY_TEST_DATABASE_URL 后运行 pnpm --filter @ruizhibo/api test:role-identities。

专项脚本使用真实 PostgreSQL、密码哈希、JWT 与权限守卫，只替换外部微信网络调用。因此它不代表真实微信凭据与真机测试已经通过。每次完整复测使用新的测试库；不设置测试数据库变量时，数据库集成用例会跳过，不得将跳过结果标成集成通过。

2026-10-14 接手后的实际复测结果：

| 检查 | 结果 |
| --- | --- |
| 隔离 PostgreSQL 17 老库升级 | 19 条旧迁移 → 第 20 条新迁移成功，旧账号 ID、角色、密码哈希、OpenID 和班级关系保留 |
| `test:role-identities` | 19 项通过，0 失败、0 跳过；复用原有 15 项并扩展教师编辑、实际家长绑定、HTTP 请求及家长删除隔离 |
| 微信并发保护 | 两个微信竞争同一身份仅一个成功；同一 OpenID 竞争同端两个账号仅一个成功；输家重试不能覆盖赢家 |
| HTTP 路由专项 | 并发创建教师返回一个 201 和一个 409，错误码与请求 ID 正常；同号家长可创建，重复家长 409；跨角色 403、伪造角色及已停用旧令牌 401 |
| `verify:admin` / `verify:teacher` / `verify:parent` | 三端默认接口回归全部通过，仅在专用测试库使用演示 seed |
| `test:training` | 20 项通过 |
| `test:teacher-web-auth` | 4 项通过 |
| `pnpm typecheck` / `pnpm build` | 全仓通过，包含 API、后台、教师网页和两个微信小程序 |
| Prisma validate / migrate status | Schema 有效，20 条迁移全部已应用 |
| Chromium 后台页面操作 | 同号新增教师/家长成功且列表刷新；重复教师/家长弹出服务端错误并保留输入；同号三身份 ID 不同、没有自动获得班级或孩子；0 未捕获页面异常 |
| `git diff --check` | 通过 |

页面验收使用真实本地 HTTP API（`127.0.0.1:3015`）与管理后台（`127.0.0.1:5185`），数据库始终为新建的 `127.0.0.1:55439/role_identity_test`。教师与家长均使用隔离 seed 管理员的手机号 `13800000000` 创建。培训开关在此次教师创建验收中关闭，培训权限与课程规则沿用原实现。

尚未执行的验收：正式管理员密码登录及认证后上传的完整发布门禁、对应两套真实微信 AppID 的同手机号首次绑定与真机登录。本次没有读取或重设管理员密码，也没有在业务库新增验证账号。微信专项测试模拟外部微信响应，不代表真实微信网络和真机验收完成。现有管理后台大 chunk 构建提示仍存在，不影响本次构建成功。

## 服务器实际部署记录（2026-10-14）

- 用户明确追加授权后，通过既有 SSH 密钥连接 `ubuntu@146.56.205.133` 执行发布；未向对话、开发电脑或 Git 暴露服务器密码、私钥内容及真实环境文件。
- 功能代码提交：`1fd01e755cf3704c924d8a5207c0a6fb5dd48381`，分支 `codex/role-scoped-accounts`；[PR #2](https://github.com/JasonTqh/ruizhibo/pull/2) 保持未合并。后续只补充文档的提交不改变本次线上功能代码版本。
- 服务器原工作区 `/home/ubuntu/ruizhibo` 仍为干净的 main，提交 `8b3af423611bbc31c9e1e919183501473baf689d`。独立发布工作区为 `/home/ubuntu/ruizhibo-releases/1fd01e755cf3`，稳定指针 `/home/ubuntu/ruizhibo-releases/current` 指向该目录。
- 管理后台：[https://api.ruizhibo.com](https://api.ruizhibo.com)；原教师网站：[https://academy.ruizhibo.com](https://academy.ruizhibo.com)。两个站点的 `/api/health` 均返回本次完整提交号。
- 维护窗口：北京时间 12:27:40–12:27:56（UTC 04:27:40–04:27:56），约 16 秒。先停旧 API，再迁移、检查、启动新 API 与管理后台；数据库、上传卷及教师网站容器均未重建。
- `deploy/.env` 仅更新 `APP_VERSION`；除该行外逐字比对与备份一致，权限设为 600。`ENABLE_DEV_LOGIN=false` 保持不变。

### 备份与恢复证据

备份保存在服务器 `/home/ubuntu/ruizhibo/backups/role-scoped-1fd01e7-20261014T042042Z-3asaK9`，目录权限 700，文件权限 600，未下载业务数据到开发电脑。包括停写前和停写后的 PostgreSQL custom dump、上传文件归档、环境文件、旧 Compose/Caddy 配置、Caddy 证书归档和旧 API/后台/教师网站镜像归档。`SHA256SUMS` 与 `VERIFICATION_SHA256SUMS` 均校验通过。

最终停写备份 `database-pre-migration.dump` 在 `--network none` 的临时 PostgreSQL 16 容器中完整恢复，51 张业务表的行数及内容摘要与迁移前完全一致；验证容器及其匿名数据卷已移除，正式数据库未执行恢复。备份中的 `data-before.txt`、`data-after-migration.txt`、`data-restored.txt` 保存摘要证据，不包含账号、密码或微信绑定的明文内容。旧镜像同时保留为 `rollback-role-1fd01e7` 标签，但这些镜像不能绕过上文数据库回滚限制。

### 部署后检查

| 检查 | 结果 |
| --- | --- |
| 服务器镜像构建 | API 与管理后台构建成功；新镜像使用生成后的 role-scoped Prisma Client |
| PostgreSQL 16 正式迁移 | 19 → 20 条，新增迁移成功，无未完成迁移；两个 role 联合唯一索引存在，两个旧全局唯一索引已移除 |
| 数据保留 | 迁移前后 51 张业务表的行数及全行摘要完全相同，包含原 User ID、密码哈希、OpenID 和业务关系 |
| 运行时只读账号检查 | 现有 3 个账号按 role + phone、已绑定账号按 role + OpenID 查询均保持原 User ID；未创建、修改或删除业务账号 |
| 服务状态 | API、数据库和原教师网站健康；管理后台入口运行正常，持久卷保留 |
| HTTPS 与版本 | 从开发电脑读取两个公网域名健康接口均返回 200 和本次完整提交号；服务器侧检查两个可信 HTTPS 站点、安全响应头、数据库及 local 存储通过 |
| 生产配置 | 正式环境、开发登录禁用、JWT/数据库密码强度、明确 CORS、两端微信配置和上传目录读写权限检查通过，未输出密钥值 |
| 前端与代理 | 新后台包包含独立身份提示和正式管理员登录、无开发登录接口，实际 API 地址为同源 `/api`；原教师首页及 SPA 深链正常 |
| 权限负向检查 | 开发登录 403；未认证 `/me`、教师管理和家长管理均 401；微信登录与手机号绑定传入 admin 均 400，在访问微信前拒绝 |
| CORS | 教师网站来源获授权，未配置来源不获授权 |
| workflow 图片归属策略 | 新 API 镜像内执行策略验证通过，不修改业务数据 |

上述线上检查不等同于完整 `verify:release` 已通过：未提供正式管理员密码，因此未运行其管理员登录及认证后上传步骤。后续由用户使用原管理员密码确认后台登录、新增同号教师/家长，再分别进行真实微信绑定和真机登录。前端包保留未使用的本地默认地址常量，但本次构建明确以 `/api` 初始化，不会因此向 localhost 请求。

备份目前仍在同一台服务器，应按项目备份策略另行同步到受控异地存储；本次没有擅自配置新的外部存储或传输业务备份。
