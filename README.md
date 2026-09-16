# Watson Twin Academy

面向 **Cloudflare Pages** 的完整网站升级：服务端渲染的英文官网、管理员后台、D1 数据库、R2 图片上传，以及发送至指定 Gmail 的咨询通知。

## 架构

```text
浏览器
  └─ Cloudflare Pages
      ├─ /assets/*                  静态 CSS、JS、原网站照片
      └─ _worker.js                 Pages Functions advanced mode
          ├─ 官网 HTML             Hono 服务端渲染，直接读取 D1
          ├─ /admin/*              Cloudflare Access JWT + 管理员邮箱白名单
          ├─ /api/admin/*          同样校验身份、Origin，服务端输入校验
          ├─ /api/enquiries        Turnstile → D1 原子保存 → 邮件 outbox
          └─ /media/*              R2 图片

后台保存内容 → D1 → 下次访问立即使用新内容，无需重新构建
咨询提交 → Turnstile 验证 → D1 保存记录及 outbox → Resend HTTPS API → Gmail
邮件失败 → 数据仍在 D1 → 后台显示失败及重试入口
```

没有需要常驻的 Node 服务，也没有使用不适合 Pages 的服务器端 SMTP 连接。Hono 和 TypeScript 生成 Pages 官方支持的 `_worker.js`。前台以 HTML 为主，只有交互需要 JavaScript；SEO 内容无需等待客户端请求。

**Gmail 是收件箱，不是发信服务器。** Resend 使用经过验证的学院发信域名，把通知投递到指定 Gmail。邮件的 Reply-To 是家长邮箱，管理员在 Gmail 点击回复即可联系家长。不要提供 Gmail 密码。

## 已实现

- 官网：首页、课程列表及筛选、独立课程页、课表费用、教师故事、相册、联系、咨询、隐私及 404。
- 后台 `/admin`：概览、课程新增／编辑／草稿、年龄／费用／课表、首页文案、联系信息、学校故事、隐私说明、图片上传、相册维护、咨询状态管理／删除、通知重试、操作记录。
- D1 参数化查询；正文转义；数据校验；管理员 JWT 签名／issuer／audience／有效期／邮箱校验；同源写入；请求大小限制；Turnstile 服务端校验；咨询及本地登录限流。
- 咨询和邮件任务在同一数据库事务保存，提交重试使用 UUID 去重。邮件任务有领取锁及 Resend 幂等键。
- 各页面 SEO metadata、动态 sitemap、robots、结构化学校数据、标题层级、图片文字说明、点击拨号。
- 保留旧站 `/about`、`/gallery`、`/enrolment`、`/contact` 路径。
- 没有编造课表、价格或年龄。空白项目显示请咨询，后台可补充。

## 本地启动

需要 Node.js 24（测试使用 Node 内置 SQLite）。

```sh
npm ci
cp .dev.vars.example .dev.vars
# 将 .dev.vars 的 LOCAL_ADMIN_TOKEN 替换为随机字符串（至少32字符）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm run db:local
npm run dev
```

在同一局域网打开 `http://192.168.1.111:8788`，后台入口为 `http://192.168.1.111:8788/admin`，使用 `.dev.vars` 中的本地 token。服务监听 `0.0.0.0:8788`。本地登录仅在 `ENVIRONMENT=local` 时对回环地址和 `LOCAL_PREVIEW_ORIGIN` 明确指定的局域网地址生效；生产环境不接受该登录方式。Mini PC 地址变化时同步修改 `.dev.vars` 的 `SITE_URL` 和 `LOCAL_PREVIEW_ORIGIN`。服务需保持运行，此配置不包含开机自启。

`.dev.vars` 已被忽略，不得提交。Cloudflare 测试 Turnstile key 只用于本地，生产必须替换。没有邮件配置时，咨询仍保存，邮件任务会显示配置缺失，便于本地验证失败恢复。

```sh
npm run check
npm run smoke     # 本地服务开启后运行；需要本地 .dev.vars，不发送真实邮件
npm run test:browser # Chromium：22个页面、5种屏幕宽度及主要交互
```

## SEO 与内容发布

新增 **Pages & publishing**（内页草稿、预览、发布）和 **SEO & sharing**（逐页搜索及分享设置）；首页和共享图片也可从后台更新。详见 [SEO 与内容管理指南](docs/SEO-CONTENT.md)。

## 部署与日常维护

详见 [Cloudflare 部署指南](docs/DEPLOYMENT.md) 和 [后台维护手册](docs/MAINTENANCE.md)。

尚未接入用户的 Cloudflare 账号或真实邮件凭证，不应把本地验证当作线上投递成功。上线前需确认收件邮箱、管理员邮箱、课程信息、照片授权及隐私说明。

## 源码结构

| 路径 | 职责 |
| --- | --- |
| `src/worker.ts` | 路由、访问控制入口、HTML 响应、安全标头 |
| `src/views.ts` | 官网页面 |
| `src/admin.ts` | 后台页面 |
| `src/api.ts` | 内容、咨询及上传写入接口 |
| `src/security.ts` | Access JWT、Origin、Turnstile、限流 |
| `src/mail.ts` | 通知发送、领取锁、状态和重试 |
| `src/validation.ts` | 服务端输入约束 |
| `src/client.ts` | 表单交互、筛选、相册、上传 |
| `public/assets/styles.css` | 统一视觉与响应式布局 |
| `migrations/` | 数据库结构与初始内容 |
| `tests/app.test.ts` | SQLite 及 HTTP 层业务测试，邮件／Turnstile模拟 |

原站图片来源与内容说明见 [素材记录](docs/ASSETS.md)。
