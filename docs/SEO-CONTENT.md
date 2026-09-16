# SEO 与后台内容管理

## 数据库与存储

网站使用 **Cloudflare D1（SQLite）** 存储课程、网站设置、页面草稿和已发布内容、SEO 设置、咨询及操作记录。现在 Mini PC 运行的是 Wrangler 的本地 D1 模拟数据库，持久化文件在项目 `.wrangler/state/v3/d1/` 中；部署后使用绑定为 `DB` 的 Cloudflare D1 实例。

图片文件使用 **Cloudflare R2**；本地预览使用其本地模拟存储。数据库存图片路径，不把大图片编码进文本字段。迁移文件在 `migrations/`，这次新增 `0003_content_seo.sql`。发布到 Cloudflare 前需对目标数据库运行 `npm run db:remote`。

## 后台框架

入口：`http://192.168.1.111:8788/admin`。

| 模块 | 管理范围 | 生效方式 |
| --- | --- | --- |
| Overview | 课程／咨询统计及连接配置状态 | 只读 |
| Classes & timetable | 课程、描述、图片、年龄、费用、时间、课程地址、上下架 | 保存生效；草稿课程不公开 |
| Pages & publishing | 7 个内页的标题、引言、补充正文 | 保存草稿 → 预览 → 发布 |
| Home & settings | 首页标题与引言、公告、主图、教师／场地照片、学校故事、电话邮箱地址、隐私说明 | 保存生效 |
| SEO & sharing | 首页、内页、每个课程的搜索标题、摘要、分享图片、noindex | 保存生效 |
| Photo gallery | 图片及描述、分类、排序、展示状态 | 保存生效 |
| Enquiries | 跟进状态、通知重试、记录删除 | 保存生效 |
| Activity log | 管理员及操作记录 | 只读 |

当前是固定页面的结构化编辑框架，并非任意拖拽建站工具；FAQ 和部分固定营销区块仍由模板维护。没有增加无人维护的空白新闻／文章模块。课程和相册新增入口已经可用。

## 页面发布流程

1. 在 Pages & publishing 选择页面。
2. 编辑小标题、H1、引言或补充正文。
3. **Save draft** 只保存工作版本，不影响公众页面。
4. **Preview saved draft** 在已登录的受保护地址预览最后保存的工作版本。
5. **Publish page** 发布当前表单内容，下一次访问即生效。

页面不存在独立已发布版本时，公众继续看到原有内容。之后再次保存草稿，公众仍看到上次发布版本。编辑冲突返回提示；不会静默覆盖另一位编辑者。离开未保存的编辑页时浏览器会提醒。

草稿预览需要后台认证且 noindex；它并非一个公开的分享链接。首页／共享设置与课程编辑使用现有保存模式，不应误认为所有模块都有独立草稿预览。

## SEO 已实现

- 各页面服务端输出 title、description、canonical、Open Graph、X 分享信息。
- 每页可在后台覆盖搜索标题、摘要和分享图；空字段使用默认值。分享预览仅为示意，Google 可能自行生成摘要。
- 使用 `PUBLIC_SITE_URL` 指定正式站点，默认 `https://watsontwinacademy.ie`。不使用请求 Host 构造 canonical，局域网地址不会混入正式 sitemap。
- 本地／预览域名自动返回 noindex，robots 禁止抓取。只有 `ENVIRONMENT=production` 且请求 origin 与正式站点一致时允许正常收录。
- 正式页面可单独设 noindex；该页面仍可访问，但从 sitemap 排除。后台、API、404 和受保护预览不收录。
- 学校 `EducationalOrganization`、网站 `WebSite`、页面、课程 `Course`、面包屑 `BreadcrumbList` JSON-LD。修正原来未验证的 DanceSchool 类型。使用实际内容，没有虚构评分、价格或招生日期。
- 动态 sitemap 仅列公开、允许索引的页面，带数据库记录的更新时间。
- 课程详情显示可点击的面包屑。
- 课程 slug 修改自动保存旧地址，301 直接跳到当前课程地址；连续改名不会产生多级跳转。旧 slug 保留，不能被另一个课程占用。
- 移除公共页面多余尾斜杠；在默认正式域名配置下将 www 入口统一至主域名（仍需 Cloudflare 域名绑定正确）。
- 保留原站主要路径；CSS／JS 使用内容版本，避免缓存旧样式。

## 正式上线后仍需做

1. 确认 `PUBLIC_SITE_URL`、正式域名绑定、HTTPS 和 `ENVIRONMENT=production`。
2. 在 Google Search Console 验证域名，提交 `https://watsontwinacademy.ie/sitemap.xml`。
3. 使用 URL Inspection 检查真实正式网址可抓取、canonical 和索引状态。
4. 核实 Google Business Profile 与网站的学校名称、地址、电话一致。
5. 用正式环境测量 Core Web Vitals；根据真实数据优化，不把本地功能测试当成速度评分。
6. 持续更新真实课程和地点信息。SEO 实现不等于已收录，也不保证排名。

依据： [Google canonical 指南](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)、[Sitemap 指南](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)、[搜索可见性控制](https://developers.google.com/search/docs/crawling-indexing/control-what-you-share)。
