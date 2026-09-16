# Cloudflare Pages 部署指南

## GitHub → Pages 首次部署

仓库：<https://github.com/Claireisme/watsontwinacademy>，生产分支 `main`。

1. 先创建下文的 D1 数据库和 R2 桶，把真实 D1 ID 写回 `wrangler.toml` 并提交；当前已配置本站真实 D1 ID。
2. 应用 D1 migrations，不能仅创建空数据库。
3. Cloudflare → Workers & Pages → Create application → Pages → Import an existing Git repository，连接上述仓库。
4. Framework preset 选 **None**；Build command 填 `npm run build`；Build output directory 填 `dist`；Root directory 留空；环境变量 `NODE_VERSION=24`。
5. 配置下文的 Access、Turnstile 与邮件变量及 Secrets，然后部署和验收。已有 `wrangler.toml` 的配置以文件为准，资源绑定请在文件中修改，不要依赖控制台覆盖它。
6. 首次部署期间禁用不需要的分支预览；启用前为预览配置独立 D1/R2 和测试邮箱，避免连接正式数据。

本项目使用 Pages Advanced Mode，不需要 Worker 的 `npx wrangler deploy` 命令，也不需要手动上传 `node_modules`。后台改内容直接写入 D1，无需 Git 提交；源码改动推送 `main` 后由 Pages 自动构建。

## 1. 确认配置

请在安全的配置界面填写密钥，不要把密钥发送到聊天或提交 Git。

| 配置项 | 用途 | 存放位置 |
| --- | --- | --- |
| `PUBLIC_SITE_URL` | 正式 SEO 域名，必须为 HTTPS，例如 `https://watsontwinacademy.ie` | Pages 变量 / wrangler |
| `SITE_URL` | 正式网址，例如 `https://watsontwinacademy.ie`，无末尾斜杠 | Pages 环境变量 / wrangler |
| `ENVIRONMENT` | 正式固定为 `production` | Pages 环境变量 / wrangler |
| `ACCESS_TEAM_DOMAIN` | `https://你的团队.cloudflareaccess.com`，无末尾斜杠 | Pages 变量 |
| `ACCESS_AUD` | Access 应用的 Application Audience (AUD) | Pages 变量 |
| `ADMIN_EMAILS` | 获准登录的邮箱，多个用逗号分隔 | Pages Secret |
| `TURNSTILE_SITE_KEY` | Turnstile 正式 public site key | Pages 变量 |
| `TURNSTILE_SECRET_KEY` | Turnstile 正式验证 secret | Pages Secret |
| `RESEND_API_KEY` | 经验证发信域名对应的发送密钥 | Pages Secret |
| `MAIL_FROM` | 例如 `Watson Twin Academy <enquiries@你的已验证域名>` | Pages 变量 |
| `NOTIFICATION_EMAIL` | 用户指定的 Gmail 收件地址 | Pages Secret |

生产环境不要设置 `LOCAL_ADMIN_TOKEN`，不要使用 Turnstile 测试 key。预览环境使用独立 D1/R2 和测试收件地址，不要绑定正式咨询数据库。

## 2. 创建 Cloudflare 资源

在 Cloudflare 账号中创建一个 D1 数据库 `wta-db` 和 R2 存储桶 `wta-media`。可用控制台或 CLI：

```sh
npx wrangler login
npx wrangler d1 create wta-db
npx wrangler r2 bucket create wta-media
```

将 D1 返回的真实 database_id 填入 `wrangler.toml`。保留 binding 名称 `DB` 和 `MEDIA`。R2 不需要公开 bucket；图片由 `/media/*` 读取。

部署前应用数据库迁移：

```sh
npm run db:remote
```

初始种子只创建缺失记录，不覆盖后台编辑。已应用的 migration 不应修改；以新迁移继续升级。不要在部署构建中自动重置／重建数据库。

## 3. 创建 Pages 项目

把代码推到你的 Git 仓库，再在 Cloudflare Pages 连接仓库：

- 构建命令：`npm run build`
- 构建输出目录：`dist`
- 根目录：项目根目录
- Node 版本：`24`
- 生产分支：你选定的生产分支

这是 **Pages Advanced Mode**，`dist/_worker.js` 就是后端；不要再建立一个重复的 `functions` 目录。`wrangler.toml` 中的 D1 和 R2 绑定应与真实资源一致。

也可直接 CLI 部署：

```sh
npm run deploy
```

首次 direct upload 需选定／创建同名 Pages 项目。若项目名不同，请修改 `wrangler.toml` 和部署命令。生产 Secret 可在控制台 Pages → 项目 → Settings → Variables and Secrets 配置，或使用 `wrangler pages secret put KEY --project-name watson-twin-academy`。不要把 Secret 写入 `wrangler.toml`。

## 4. 后台登录：Cloudflare Access

在 Zero Trust 中创建一个 Self-hosted 应用，同一应用的多个路径使用同一 AUD：

- `watsontwinacademy.ie/admin`
- `watsontwinacademy.ie/admin/*`
- `watsontwinacademy.ie/api/admin/*`

按账号控制台支持的多 hostname/path 方式设置。允许策略只包含管理员邮箱，选择邮箱一次性验证码或 Google 身份登录。将 Access 应用 AUD、团队域名及相同邮箱白名单配置到 Pages。

**应用本身会验证签名 JWT**，所以即使通过 `pages.dev` 绕过入口也不能直接访问后台数据。仍需为自定义域、www 别名及预览域设计一致的 Access 规则，或限制／重定向不需要的入口。若创建了多个 Access 应用，各应用 AUD 不同，当前代码只接受配置的一个 AUD；优先将后台路径放在同一应用。

不要保护整个公共网站。咨询表单应允许家长访问。

## 5. Gmail 通知

1. 在 Resend 添加学院拥有的发信域名，并按它提供的 DNS 记录验证 SPF/DKIM。
2. 配置 `RESEND_API_KEY`、`MAIL_FROM`、`NOTIFICATION_EMAIL`。
3. 收件 Gmail 地址由用户明确指定，不能自动假定原网站公开邮箱就是 Gmail。
4. 使用正式 Turnstile 域名配置完成一次真实咨询验收。
5. 同时检查后台记录、通知状态、Gmail 收件箱和垃圾邮件箱。
6. 在 Gmail 点击回复，确认回复地址为测试咨询所填邮箱。

无需修改原有邮箱 MX 记录来完成这一网站升级。按邮件供应商提供的记录配置，避免影响学院已有收信服务。

### 状态含义与可靠性边界

- `pending`：已保存，等待尝试。
- `sending`：正在尝试；超过两分钟的锁可由后台重试领取。
- `sent`：邮件供应商已经接受，**不代表 Gmail 已进入收件箱**。
- `failed`：配置或发送失败，可后台重试。

采用数据库 outbox 和立即后台发送，保证发送失败时咨询记录仍可追查。当前重试为管理员手动触发，没有单独 Cron Worker 或队列消费者。平台中断留下的 pending/sending 记录也在后台可见。

Resend 幂等窗口有时限；在网络超时、供应商已接收但本地未记录成功且隔很久才重试的特殊情况下，可能产生重复通知。以咨询 UUID 识别同一记录。若日后需要自动重试、退信／投递回执，可另加 Cron Worker + outbox 扫描和签名验证 webhook，不应声称当前具备这些功能。

## 6. 正式上线验收

- 补齐真实年龄、时间、费用，确认其他舞种当前是否招生；未确认课程可设草稿。
- 审核品牌文案和原站照片使用权限；当前沿用原站公开素材，不代表重新验证了授权。
- 审核隐私说明、数据保留期限、跨服务存储安排。当前初始文案不是法律合规认证。
- 用真实手机和桌面浏览器检查页面、菜单、筛选、表单、Turnstile、键盘操作和后台上传。
- 在未登录、获准邮箱、未获准邮箱三种状态验收后台访问。
- 真实 Gmail 投递与回复验收通过后再切换正式域名。
- 保留原站和域名配置的备份。旧站四个主要路径保留，课程 slug 修改后由数据库自动保留301跳转。

## 7. 运维

- 使用 Cloudflare D1 的备份／恢复能力，并定期验证恢复步骤；迁移前导出备份。
- R2 的误删恢复需单独安排，不要假定数据库备份包含图片。
- 依赖锁文件已提交到项目；使用 `npm ci`，定期 `npm audit`，升级后运行 `npm run check`。
- Pages 回滚代码不会自动回滚数据库，使用兼容迁移。
- `SITE_URL` 是可信配置，用于 canonical 和邮件链接；不要从用户提供的 Host 拼接公开邮件地址。
- HTML 默认不缓存，后台编辑立刻生效。静态文件短缓存、R2 UUID 图片长缓存；待有真实流量数据再针对公共页面设计版本化缓存。
- 监控 Pages Functions 错误、D1 额度和 outbox 未发送数量。具体费用按账号及真实流量评估，不承诺永久免费。

官方参考：

- [Pages Advanced Mode](https://developers.cloudflare.com/pages/functions/advanced-mode/)
- [Pages D1/R2 bindings](https://developers.cloudflare.com/pages/functions/bindings/)
- [Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Resend send email API](https://resend.com/docs/api-reference/emails/send-email)

## 当前 Cloudflare 资源（2026-09-16）

- Pages：`watson-twin-academy`，GitHub `Claireisme/watsontwinacademy` 的 `main` 分支自动部署。
- 验证入口：`https://watson-twin-academy.pages.dev`；SITE_URL 暂指向此地址。
- PUBLIC_SITE_URL 仍为正式域名，因此 pages.dev 页面保持 noindex。正式域名尚未切换。
- D1：`wta-db`，初始三项 migration 已应用；R2：`wta-media`。
- 分支预览关闭；启用前绑定独立预览资源。
- 后台 Access、Turnstile 与邮件配置须单独完成并验收。
