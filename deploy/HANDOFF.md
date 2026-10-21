# Now AI News 交接手册

面向下一个接手开发 / 运维的人：读完本文应能本地跑起来、改代码、发到线上。

| 项目 | 值 |
|------|-----|
| 品牌 | Now AI News / 今日科技前沿 |
| 线上站点 | https://nowainews.com |
| 运营后台 | https://nowainews.com/ops/ |
| 代码仓库（部署用） | https://github.com/bigBro8888/Horizon |
| 生产分支 | `main` |
| Cloudflare Pages 项目 | `horizon` |
| 时区 | Asia/Shanghai |

上游开源项目是 [Thysrael/Horizon](https://github.com/Thysrael/Horizon)。本仓库的部署远端请用 **`bigbro`**（`bigBro8888/Horizon`），不要推到上游 `origin`。

---

## 1. 架构一句话

```text
GitHub Actions 每天生成新闻 → 写入 data/ + 导出 public/
→ push 到 bigBro8888/Horizon main
→ Cloudflare Pages 自动部署 public/
→ 访客看静态站；/ops 与 /api/* 走 Pages Functions + D1
```

- **不需要自建服务器**（腾讯云 Windows 方案见 `deploy/DEPLOY.md`，当前线上未采用）。
- 新闻生成在 Actions 里跑，不在 Cloudflare 上跑 AI。
- 首页列表读 `/data/feed.json`（轻量）；正文在 `/article/<slug>/` 静态页。

---

## 2. 仓库与目录

```text
src/                  Python：抓取、AI 改写、导出、本地 FastAPI
src/web/static/       前端源码（改完需同步到 public/ 或跑导出）
src/web/static_export.py   生成 public/（含 feed.json、文章 HTML、ads.txt）
functions/            Cloudflare Pages Functions（track / ads / ops）
migrations/           D1 SQL
data/issues/          每日期次 JSON（权威数据）
data/media/           配图
data/config.github.json  Actions 用配置（工作流会复制为 config.json）
public/               Cloudflare 实际发布目录（不要当唯一源码）
.github/workflows/daily-summary.yml  每日新闻
deploy/               部署与交接文档
```

常用远端：

```bash
git remote -v
# bigbro  → https://github.com/bigBro8888/Horizon.git   ← 部署推送
# origin  → 上游 Thysrael/Horizon（一般不要 push）
```

推送示例：

```bash
git push bigbro main
```

本机若走本地代理失败，可临时：

```powershell
$env:HTTP_PROXY=''; $env:HTTPS_PROXY=''; $env:ALL_PROXY=''
git -c http.proxy= -c https.proxy= push bigbro main
```

---

## 3. 本地开发（快速上手）

### 3.1 环境

- Python ≥ 3.11
- [uv](https://github.com/astral-sh/uv)
- Node.js（仅测 Pages Functions 时需要）

```powershell
cd <项目根目录>
uv sync
copy .env.example .env
# 编辑 .env：至少填 DASHSCOPE_API_KEY；本地 FastAPI 后台还需 ADMIN_PASSWORD
```

### 3.2 本地预览网站（两种）

**A. 静态站（接近线上）**

```powershell
uv run python -m src.web.static_export
# 用任意静态服务器打开 public/，或 Cloudflare Pages 本地预览
```

**B. FastAPI 动态站（开发后台 / 本地 API）**

```powershell
uv run horizon-web
# 或 .\start-web.ps1
```

说明：线上 Cloudflare **不用** `/admin` FastAPI 后台；线上运营后台是 `/ops`。

### 3.3 手动生成一期新闻

```powershell
copy data\config.github.json data\config.json
uv run horizon --hours 24
uv run python -m src.web.static_export
```

生成后检查：

- `data/issues/YYYY-MM-DD.json`
- `public/data/issues/YYYY-MM-DD.json`
- `public/data/feed.json`（首页依赖它，必须包含当天日期）

### 3.4 前端改动约定

改 `src/web/static/*` 后：

1. 同步到 `public/static/`（导出命令也会复制）。
2. 首页是 `public/index.html`，由 `static_export` 从 `src/web/static/index.html` 写出。
3. 资源版本号（`?v=`）有变更时记得一起改，避免 CDN/浏览器缓存旧文件。

### 3.5 测试

```powershell
# Pages Functions 单测
node tests/test_pages_functions.mjs

# Python（若有）
uv run pytest
```

---

## 4. 线上部署（Cloudflare Pages）— 当前生产路径

详细步骤见 [`CLOUDFLARE_PAGES.md`](./CLOUDFLARE_PAGES.md)。交接核对清单如下。

### 4.1 GitHub

仓库：`bigBro8888/Horizon`，分支 `main`。

**Actions Secrets**（Settings → Secrets → Actions）：

| Secret | 用途 |
|--------|------|
| `DASHSCOPE_API_KEY` | 通义千问，生成新闻必填 |
| `LWN_KEY` | 可选，LWN RSS |

工作流：`.github/workflows/daily-summary.yml`

- 定时：每天 **北京时间 09:15**（cron `15 1 * * *` UTC）
- 也可：Actions → Generate Daily News → Run workflow

流程：`horizon --hours 24` → `static_export` → commit `chore: generate daily news` → push → Pages 自动部署。

### 4.2 Cloudflare Pages

| 项 | 值 |
|----|-----|
| Project | `horizon` |
| Git 仓库 | `bigBro8888/Horizon` |
| Production branch | `main` |
| Build command | 空或 `exit 0` |
| Build output directory | `public` |
| 自定义域 | `nowainews.com` |

### 4.3 D1 + Secrets（运营后台）

| 项 | 值 |
|----|-----|
| D1 库名 | `nowai-admin` |
| Binding | `NOWAI_DB` → `nowai-admin` |
| 迁移 SQL | `migrations/0001_admin.sql` |
| Secret | `ANALYTICS_SALT`（随机长串） |
| Secret | `ADMIN_PASSWORD`（后台登录密码，生产必改） |

绑定或 Secret 变更后：**重新部署一次** Pages 才生效。

后台地址：https://nowainews.com/ops/  
接口前缀：`/api/ops/*`（登录 `/api/ops/login`）

不要给 `/ops*`、`/api/ops*` 再挂 Cloudflare Access（会拦密码登录）。旧的 `/admin*` Access 应用应停用。

### 4.4 广告

- 前台：`site-runtime.js` 读 `/api/ads`，按后台配置渲染 AdSense 位。
- 后台 `/ops` → 广告管理：开关、publisher、三个 slot 数字 ID。
- `ads.txt` 由 `static_export` 写出；改 publisher 后需改导出逻辑并重新导出。
- AdSense 发布商当前文档记载：`ca-pub-4598371924010228`（以控制台为准）。

---

## 5. 关键路径速查

| 路径 | 说明 |
|------|------|
| `/` | 首页（读 `/data/feed.json`） |
| `/article/<slug>/` | 中文文章 |
| `/en/article/<slug>/` | 英文文章 |
| `/ops/` | 运营后台（密码） |
| `/api/track` | 匿名 PV/UV |
| `/api/ads` | 公开广告配置 |
| `/api/ops/login` 等 | 后台 API |
| `/admin/` | 仅跳转到 `/ops/`；勿配 Access |

---

## 6. 日常运维

### 今天新闻没出现在首页

1. 看 Actions 是否成功：`chore: generate daily news`。
2. 确认存在 `public/data/issues/当天.json`。
3. 确认 `public/data/feed.json` 的 `issues[0].date` 是今天。  
   若只有期次 JSON、没有进 feed：重新跑 `static_export` 或按文章字段重建 feed 后推送。
4. 浏览器强刷；注意 `feed.json` 有短缓存。

### 手动补发一期

GitHub → Actions → Generate Daily News → Run workflow。

或本地生成后：

```powershell
git add data/issues data/media public
git commit -m "chore: generate daily news"
git push bigbro main
```

### 改站点标题 / 源 / 模型

- Actions：改 `data/config.github.json`（工作流会拷成 `config.json`）。
- 本地：改 `data/config.json` 或 `.env`。

### 改前端样式 / 分享 / SEO

改 `src/web/static/` → 导出或复制到 `public/` → push `bigbro main`。

### 改后台 Functions

改 `functions/` → push → 等 Pages 部署（Functions 随 Pages 发布）。

---

## 7. 安全与机密（交接必做）

**不要提交到 Git：**

- `.env`、真实 `wrangler.toml`（含 database_id）、API Key、Cookie、私钥

**生产建议：**

1. Cloudflare Secret 设置独立的 `ADMIN_PASSWORD`（不要长期依赖代码默认值）。
2. `ANALYTICS_SALT` 固定保存好，更换会导致 UV 统计断层。
3. GitHub `DASHSCOPE_API_KEY` 仅放 Secrets。
4. 确认 Zero Trust 未误伤整站或 `/ops`。

---

## 8. 新环境从零搭一遍（检查表）

1. [ ] Fork/使用 `bigBro8888/Horizon`，本地 `git remote add bigbro ...`
2. [ ] GitHub Secrets：`DASHSCOPE_API_KEY`
3. [ ] Cloudflare Pages：连仓库，`public` 输出，绑域名
4. [ ] 创建 D1 `nowai-admin`，执行 `migrations/0001_admin.sql`
5. [ ] Pages Binding：`NOWAI_DB`
6. [ ] Secrets：`ANALYTICS_SALT`、`ADMIN_PASSWORD`，再部署
7. [ ] 手动跑一次 Generate Daily News，确认首页与 `/ops` 正常
8. [ ] 检查 https://nowainews.com/ads.txt
9. [ ] 停用旧 Access（若曾保护 `/admin`）

---

## 9. 相关文档索引

| 文档 | 内容 |
|------|------|
| [`CLOUDFLARE_PAGES.md`](./CLOUDFLARE_PAGES.md) | Pages / D1 / 后台 / 广告细则 |
| [`DEPLOY.md`](./DEPLOY.md) | Windows 服务器 + FastAPI（备用，非当前生产） |
| 根目录 `README_zh.md` | 上游 Horizon 通用说明（品牌与部署以本文为准） |
| `.env.example` | 环境变量模板 |
| `wrangler.toml.example` | D1 binding 示例 |

---

## 10. 已知坑（踩过）

1. **首页只认 `feed.json`**：只更新 `issues/*.json` 却不导出，首页仍是旧数据。
2. **Cloudflare Access 挡后台**：密码框出不来或 API 302；应关掉 Access，用 `/ops` 密码。
3. **CSS `display` 覆盖 `[hidden]`**：后台登录层与面板叠在一起时，需 `[hidden]{display:none!important}`。
4. **favicon 过大 / 首屏拉全量 JSON**：已用小图标 + `feed.json` + 懒加载优化；勿再让首页拉全部期次正文。
5. **本机 git 代理 7890**：推送失败时清代理或 `git -c http.proxy=`。
6. **推错远端**：生产只推 `bigbro`，不是上游 `origin`。

---

## 11. 联系与账号归属（请接手人自行补全）

| 项 | 填写 |
|----|------|
| GitHub 仓库管理员 | |
| Cloudflare 账号邮箱 | |
| 域名注册商 / DNS | 当前指向 Cloudflare |
| 通义 / DashScope 控制台 | |
| Google AdSense | |
| 百度联盟（若启用） | 站点验证文件 / meta 可能在首页 |

文档版本：与仓库 `main` 同步维护。大改架构时请先改本文再改代码。
