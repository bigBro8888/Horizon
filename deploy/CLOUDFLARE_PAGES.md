# Cloudflare Pages 免费部署说明

这个项目在 Cloudflare 免费部署时使用静态站方案：

```text
GitHub Actions 每天 09:00（北京时间）自动生成新闻
→ 写入 data/issues、data/media、public
→ 提交回 GitHub
→ Cloudflare Pages 自动部署 public 目录
```

不需要服务器，也不需要后台 `/admin`。

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
- `/admin` 后台只适合本地 FastAPI 开发模式，Cloudflare Pages 不使用它。
