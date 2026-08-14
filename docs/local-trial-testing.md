# 本机当服务器给用户试测的方案

- 日期：2026-08-14
- 结论：**可以，但要分清"管理后台"和"微信小程序"两种场景**。管理后台现在就能局域网试测；公网试测需补域名/穿透/证书；微信小程序真机试测卡在"已备案 HTTPS 域名"这一微信硬性要求上。

## 一、局域网试测（现在就能用，零成本）

本机已运行生产模式 Docker 环境，8080 端口监听所有网卡：

- **管理后台地址**：`http://172.20.10.7:8080`
- 管理员账号：`13800000000`，测试密码：`RzLocalTest#2026`
- 前提：试测用户的手机/电脑与本机在同一 WiFi（同一局域网）
- 注意：Windows 防火墙需放行 TCP 8080（Docker Desktop 通常已自动添加规则，若对方打不开再手动放行）

同源访问不经过 CORS，所以局域网直接用 IP 访问管理后台没有问题。

## 二、公网试测（外部用户也能访问，需要三步）

| 步骤 | 做什么 | 具体方案 |
| --- | --- | --- |
| 1. 公网入口 | 把本机 8080 暴露到公网 | 推荐 **Cloudflare Tunnel**（免费、无需公网 IP）；备选 frp（需一台有公网 IP 的 VPS）、花生壳/ngrok（付费简单） |
| 2. 域名 | 准备一个域名解析到入口 | 用你的域名（如 test.example.com），Cloudflare Tunnel 可托管解析 |
| 3. HTTPS 证书 | 让访问走 HTTPS | **不用自己配**——本项目 Caddy 支持自动申请 Let's Encrypt 免费证书，只需改 `deploy/.env`：`DEPLOY_SITE_ADDRESS=https://test.example.com` 并重启 web 容器 |

配套改动（公网模式）：

```dotenv
# deploy/.env 中需要调整的值
DEPLOY_SITE_ADDRESS=https://test.example.com
CORS_ORIGINS=https://test.example.com
ENABLE_DEV_LOGIN=false
APP_VERSION=<当前 git 提交 SHA>
```

改完后执行 `verify:release` 门禁（带 `-RequireHttps`）即可验收。

## 三、微信小程序试测（教师端/家长端）

**微信硬性要求**：小程序 request 合法域名必须是 **已备案（ICP）的 HTTPS 域名，且不能是 IP**。本机 IP、免费内网穿透域名（ngrok.io 等）都无法配置为合法域名。

所以教师端/家长端真机试测的前提是：

1. 有**已备案的域名**（个人/企业主体均可，个人主体类目需匹配托管/教育服务）
2. 在微信公众平台「开发管理 → 开发设置 → 服务器域名」配置：
   - request 合法域名：`https://你的域名`
   - uploadFile 合法域名：`https://你的域名`（图片消息用）
3. 在 `deploy/.env` 填入正式 `WECHAT_TEACHER_APP_ID/APP_SECRET`、`WECHAT_PARENT_APP_ID/APP_SECRET`
4. 重新构建小程序（`VITE_API_BASE_URL` 指向公网域名）

> 未备案期间想提前看效果：微信开发者工具可勾选「不校验合法域名」在开发工具内跑通全流程，但真机预览/体验版必须满足上述条件。

## 四、本机当服务器的注意事项

- **适合**：小范围试运行（10 人以内）、验收演示、临时环境
- **不适合**：正式对外运营——家用宽带一般无固定公网 IP、上行带宽有限、断电断网会中断服务；正式上线建议用云服务器（部署脚本 deploy/ 已就绪，迁移成本低）
- **数据安全**：本机环境使用 `RzLocalTest#2026` 等测试密码，公网暴露前务必：① 换强管理员密码（`pnpm admin:set-password`）② 换 `JWT_SECRET` 和数据库密码 ③ 关闭 `ENABLE_DEV_LOGIN`
- **定期备份**：`tools/backup-test-deployment.ps1` 一键备份，恢复见 `restore-test-deployment.ps1`

## 五、建议推进顺序

1. 局域网试测管理后台（今天即可，用上面的地址）
2. 若确认要对外试测：Cloudflare Tunnel + 域名 → 公网 HTTPS 管理后台
3. 申请/借用已备案域名 → 配置微信合法域名 + 正式 AppID/AppSecret → 小程序体验版
4. 全部就绪后跑 `verify:release -RequireHttps` → 小范围试运行
