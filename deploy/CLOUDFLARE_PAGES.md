# Cloudflare Pages 免费部署说明

这个项目在 Cloudflare 免费部署时使用静态站 + Pages Functions 方案：

```text
GitHub Actions 每天 09:00（北京时间）自动生成新闻
→ 写入 data/issues、data/media、public
→ 提交回 GitHub
→ Cloudflare Pages 自动部署 public 目录
```

不需要购买服务器。新闻页面仍是静态文件，`/admin` 通过 Pages Functions、D1 和 Cloudflare Access 提供轻量运营后台。

## 1. GitHub Secrets

进入 GitHub 仓库：

```text
Settings → Secrets and variables → Actions → New repository secret
```

添加：

```text
DASHSCOPE_API_KEY=你的阿里云通义 API Key
```

可选：

```text
LWN_KEY=你的 LWN key（如果启用 LWN RSS）
```

## 2. Cloudflare Pages 创建项目

选择：

```text
Workers & Pages → Pages → Import an existing Git repository
```

选择仓库：

```text
bigBro8888/Horizon
```

构建配置：

```text
Project name: horizon
Production branch: main
Framework preset: None / 其他 / 无框架
Build command: 留空
Build output directory: public
Root directory: 留空
```

如果 Cloudflare 不允许 Build command 留空，填：

```bash
exit 0
```

## 3. 自动生成新闻

GitHub Actions 工作流：

```text
.github/workflows/daily-summary.yml
```

默认每天北京时间 09:00 自动运行。

也可以手动运行：

```text
GitHub → Actions → Generate Daily News → Run workflow
```

运行完成后会自动提交新生成的新闻，Cloudflare Pages 会自动重新部署。

## 4. Google AdSense

已接入发布商 ID：

```text
ca-pub-4598371924010228
```

已生成：

```text
public/ads.txt
```

部署后检查：

```text
https://你的域名/ads.txt
```

应返回：

```text
google.com, pub-4598371924010228, DIRECT, f08c47fec0942fa0
```

## 5. 重要说明

- Cloudflare Pages 只展示静态网站。
- 新闻生成由 GitHub Actions 完成。
- API Key 放 GitHub Secrets，不提交到仓库。
- `/admin` 只负责查看流量和管理广告，不运行 AI 新闻生成。

## 6. 创建 D1 后台数据库

进入 Cloudflare：

```text
Workers & Pages → D1 SQL database → Create database
```

数据库名称填写：

```text
nowai-admin
```

创建后进入数据库的 Console，把仓库中的以下文件完整复制执行：

```text
migrations/0001_admin.sql
```

然后进入 Pages 项目：

```text
Workers & Pages → horizon → Settings → Bindings → Add binding
```

选择 `D1 database`，填写：

```text
Variable name: NOWAI_DB
D1 database: nowai-admin
```

生产环境和 Preview 环境都建议绑定。绑定后必须重新部署一次。

还需要在 Pages 项目的 Variables and Secrets 中添加加密变量：

```text
ANALYTICS_SALT=一段至少32位的随机字符串
```

这个值只用于匿名访客去重，不能写进 Git 仓库。

如果希望使用 Wrangler 管理绑定：

1. 复制 `wrangler.toml.example` 为 `wrangler.toml`。
2. 把 `database_id` 替换为 D1 页面显示的真实 Database ID。
3. 执行 `npx wrangler d1 migrations apply nowai-admin --remote`。

不要直接提交仍带占位 Database ID 的 `wrangler.toml`。

## 7. 使用 Cloudflare Access 保护后台

进入：

```text
Zero Trust → Access → Applications → Add an application
```

选择 `Self-hosted`，应用名称可填写：

```text
Now AI News Admin
```

为同一个应用添加两个受保护路径：

```text
nowainews.com/admin*
nowainews.com/api/admin/*
```

创建 `Allow` 策略，只允许你的管理员邮箱。登录方式选择邮箱一次性验证码（One-time PIN）。

配置完成后：

```text
https://nowainews.com/admin/
```

会先显示 Cloudflare Access 登录页，验证码通过后才会进入后台。后台 API 还会检查 Cloudflare 注入的登录邮箱头；没有 Access 身份时返回 401。

注意：不要把整个 `nowainews.com/*` 都放进 Access，否则普通访客也会被要求登录。

## 8. 流量统计说明

- 首页和文章页会向 `/api/track` 发送一次访问记录。
- 后台提供今日、近 7 天和近 30 天的 PV、UV、热门页面与来源域名。
- 不保存原始 IP，只保存带秘密盐值的不可逆哈希；访客明细保留 90 天。
- 搜索引擎和常见爬虫不会计入统计。
- 这是站内轻量统计，与 Cloudflare Analytics、Google AdSense 报表相互独立。

## 9. 广告管理说明

后台可以管理：

- 广告总开关。
- AdSense 发布商 ID。
- 首页信息流广告单元 ID。
- 文章正文广告单元 ID。
- 文章末尾广告单元 ID。

广告单元 ID 只填写数字，不要粘贴整段 `<script>` 或 `<ins>` 代码。配置修改后立即生效，不需要重新构建网站。

若修改发布商 ID，还必须同步修改：

```text
src/web/static_export.py 中生成 ads.txt 的发布商记录
```

然后重新执行静态导出并部署。AdSense 收益、点击和审核状态仍在 Google AdSense 控制台查看。
