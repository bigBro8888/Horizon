# Horizon Windows Server 部署指南

适用于腾讯云轻量服务器 Windows Server 2019。

## 服务器信息

| 项目 | 值 |
|------|-----|
| 系统 | Windows Server 2019 |
| 公网 IP | 122.51.11.27 |
| 项目路径 | `C:\hot news` |
| 服务端口 | 8765 |

## 一、上传文件

将项目上传到 `C:\hot news`，**不要上传** `.venv` 文件夹（体积大且无法跨机器使用）。

必须包含的文件：
- `src/`、`data/`、`deploy/`、`pyproject.toml`、`uv.lock`
- `.env`（含 API Key）或上传后手动创建

## 二、远程登录服务器

1. 腾讯云控制台 → 轻量应用服务器 → **远程桌面登录**
2. 输入 Administrator 密码登录

## 三、安装依赖

打开 **PowerShell**，执行：

```powershell
cd "C:\hot news"
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\deploy\install.ps1
```

## 四、配置 API Key 与后台密码

用记事本编辑 `C:\hot news\.env`：

```env
DASHSCOPE_API_KEY=你的阿里云密钥
ADMIN_PASSWORD=你自定义的后台登录密码
```

- `DASHSCOPE_API_KEY`：AI 生成所需的密钥（也可后续在后台页面填写并自动写回 `.env`）。
- `ADMIN_PASSWORD`：**必填**，用于登录 `/admin` 后台。未设置时后台无法登录。

确认 `data\config.json` 中 AI 配置为：

```json
"ai": {
  "provider": "ali",
  "model": "qwen-plus",
  "api_key_env": "DASHSCOPE_API_KEY",
  "languages": ["en", "zh"]
}
```

可选的定时/配图/站点配置（不填则使用默认值）：

```json
"schedule": { "enabled": true, "times": ["09:00"], "timezone": "Asia/Shanghai" },
"imagery":  { "enabled": true, "max_results": 6 },
"site": {
  "title_zh": "Horizon 科技前沿", "title_en": "Horizon Tech",
  "description_zh": "由 AI 自动生成的每日科技新闻",
  "description_en": "AI-curated daily technology news"
}
```

以上内容也可以登录后台后在网页上直接修改，保存即时生效。

## 五、开放防火墙

### 1. Windows 防火墙（管理员 PowerShell）

```powershell
cd "C:\hot news"
.\deploy\setup-firewall.ps1
```

### 2. 腾讯云防火墙

控制台 → 轻量应用服务器 → **防火墙** → 添加规则：

| 协议 | 端口 | 策略 |
|------|------|------|
| TCP | 8765 | 允许 |

## 六、启动服务

### 方式 A：前台运行（测试用）

```powershell
cd "C:\hot news"
.\deploy\start-server.ps1
```

### 方式 B：后台运行（推荐）

```powershell
cd "C:\hot news"
.\deploy\start-background.ps1
```

## 七、访问

- 前台（自动双语新闻站）：

```
http://122.51.11.27:8765/
```

前台会根据访问者的浏览器语言与时区自动显示中文或英文，右上角也可手动切换。

- 后台管理：

```
http://122.51.11.27:8765/admin
```

用 `.env` 里的 `ADMIN_PASSWORD` 登录，可管理定时频率、AI 接口与密钥、评分/篇数、配图开关、站点标题简介，并可「立即生成一期」。

## 八、新闻生成（全自动）

网站为**全自动**运行，用户端没有生成按钮：

- 服务常驻期间，内置定时器会按 `schedule.times`（默认每天 09:00）自动跑一遍管线，生成当天新闻并推送到前台。
- 生成结果为结构化数据 `data\issues\{日期}.json`，配图下载到 `data\media\`。
- 如需立即出一期，登录 `/admin` 点 **「立即生成一期」**，或命令行运行 `horizon`（venv 内）/ `python -m src.main`。

首次生成约 5-10 分钟。每篇文章会由 AI 基于原文改写为完整正文，并自动搜索网络配图，因此耗时与 token 消耗高于旧版直译模式，可在后台用「每期最多文章数」控制成本。

> 定时器随 web 服务进程运行，请保持服务常驻（见方式 B / 开机自启）。若更倾向系统级定时，也可用 Windows 任务计划程序按时执行 `horizon` 命令替代。

## 九、开机自启（可选）

1. 打开 **任务计划程序**
2. 创建基本任务 → 触发器选「计算机启动时」
3. 操作选「启动程序」：
   - 程序：`powershell.exe`
   - 参数：`-ExecutionPolicy Bypass -File "C:\hot news\deploy\start-background.ps1"`

## 常见问题

**无法访问网页**
- 检查腾讯云防火墙是否开放 8765
- 检查 Windows 防火墙规则
- 运行 `Get-NetTCPConnection -LocalPort 8765` 确认服务在监听

**新闻生成失败 / 前台无内容**
- 检查 `.env` 中 API Key 是否正确
- 查看 `data\horizon-run.log` 日志
- 确认 `data\issues\` 下是否已有 `{日期}.json`；没有说明尚未成功生成
- 配图为可选，失败不影响正文；前台会用渐变占位图

**后台无法登录**
- 确认 `.env` 已设置 `ADMIN_PASSWORD` 并重启服务

**中文乱码**
- 启动脚本已设置 UTF-8，无需额外配置
