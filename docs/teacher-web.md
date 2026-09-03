# 教师学院网页版

## 当前阶段

`TW-01` 已建立独立的教师学院 Web 应用，目录为 `apps/teacher-web`；`TW-02` 已接通正式课程学习闭环。它与教师小程序是两个独立前端：

- 网页端只读取和操作教师学院相关接口；
- 教师小程序的页面、路由和构建方式保持不变；
- 两端共用教师账号、培训计划、课程进度和通知数据；
- 网页端使用独立的短时登录会话，不复用小程序微信登录态。

当前网页包含：

- 正式教师账号登录、会话恢复与退出；
- 学习总览、我的计划、课程资料库和学院通知；
- 正式课程详情、章节切换及受控图片/视频素材访问；
- 有效学习会话、可见性/活动状态心跳与视频观看进度；
- 图文章节完成、视频完成条件校验和课后测验；
- 学习进度回写，以及学院通知点击已读。

网页版复用现有培训 API 和服务端权限校验，不在浏览器中自行判定课程权限。实操考核和安全复核仍沿用现有管理流程，后续阶段只补教师需要的状态与反馈体验，不改变教师小程序现有能力。

## 本地启动

先启动 API：

```powershell
pnpm dev:api
```

再启动教师学院网页：

```powershell
pnpm dev:teacher-web
```

默认地址为 `http://localhost:5174/`。开发环境通过 Vite 将 `/api` 转发到 `http://localhost:3000`，无需在浏览器中保存后端地址。

## 开通教师网页登录

教师必须已经由管理员创建，状态为启用且在职。用 PowerShell 临时设置环境变量后执行密码设置命令：

```powershell
$env:TEACHER_WEB_PHONE="教师手机号"
$env:TEACHER_WEB_PASSWORD="至少12位且包含大小写字母、数字和特殊字符的密码"
pnpm --filter @ruizhibo/api teacher-web:set-password
Remove-Item Env:TEACHER_WEB_PHONE
Remove-Item Env:TEACHER_WEB_PASSWORD
```

命令只保存 scrypt 密码哈希，并写入审计记录；不会保存明文密码。教师离职、账号停用或密码不正确时均无法登录。

## 构建与验证

```powershell
pnpm --filter @ruizhibo/api test:teacher-web-auth
pnpm --filter @ruizhibo/api test:training
pnpm --filter @ruizhibo/api typecheck
pnpm --filter @ruizhibo/teacher-web typecheck
pnpm build:teacher-web
```

## 本地人工验收

独立 worktree 不会自动复制被 Git 忽略的 `apps/api/.env`。联调前请在当前 worktree 单独准备开发配置，然后按以下顺序验收：

1. 启动 API 与教师学院网页，并使用已设置网页版密码的在职教师登录；
2. 从“我的计划”打开一门已解锁课程，切换图文/视频章节；
3. 保持页面可见并学习一段时间，返回计划页确认累计学习时长更新；
4. 视频课程验证播放进度、倍速和未达到有效观看比例时的拦截；
5. 完成全部章节后提交测验，确认分数和通过状态同步；
6. 点击一条未读学院通知，确认未读数即时减少；
7. 用另一名教师登录，确认无法打开前一名教师的课程任务或素材。

在没有真实 API 配置时，只能验收登录页和响应式布局，不能把课程数据隔离、学习计时或素材权限标记为已人工验收。

## 部署边界

生产环境需要将教师学院网页放在可信 HTTPS 域名下，并把该来源加入 API 的 `CORS_ORIGINS`。网页端只能配置公开的 API 地址，不得写入微信 AppSecret、JWT secret、数据库连接串或任何生产凭据。
