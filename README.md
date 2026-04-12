# JetBrains AI Proxy

一个自托管的 JetBrains AI API 反代服务，附带完整的 Web 管理面板。

A self-hosted reverse proxy for JetBrains AI API with a full-featured web admin panel.

---

## 功能 Features

- **OpenAI 兼容接口** — 无缝替换 GPT API，支持主流 AI 客户端（Cursor、Continue、Open WebUI 等）
- **多账号轮询** — 支持配置多个 JetBrains 账号，自动轮换使用
- **自动 Token 刷新** — OAuth 账号每 50 分钟自动刷新 id_token，无需手动维护
- **Web 管理面板** — 可视化管理账号、API 密钥、模型映射、查看日志
- **密码登录 + 全自动激活** — 输入邮箱密码，自动完成登录、试用激活、License 绑定
- **管理员认证** — 面板受密码保护，安全对外暴露

---

## 架构 Architecture

```
┌─────────────────────────────────────────────┐
│  AI Client (Cursor / Continue / WebUI ...)   │
│  Authorization: Bearer sk-your-key           │
└────────────────────┬────────────────────────┘
                     │ /v1/chat/completions
                     ▼
┌─────────────────────────────────────────────┐
│  Python Proxy  :8000                         │
│  FastAPI — 轮询 JetBrains 账号, 转发请求     │
└────────────────────┬────────────────────────┘
                     │
         ┌───────────┴──────────┐
         ▼                      ▼
  JetBrains AI Account 1   Account 2 ...
  (JWT / OAuth token)

┌─────────────────────────────────────────────┐
│  API Server  :8080                           │
│  Express — 管理 CRUD、账号操作、OAuth 流程   │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  Admin Panel  :20130                         │
│  React + Vite — 可视化管理界面               │
└─────────────────────────────────────────────┘
```

| 服务 | 端口 | 说明 |
|------|------|------|
| Python Proxy | 8000 | 核心代理，转发请求到 JetBrains AI |
| API Server | 8080 | TypeScript/Express 管理 API |
| Admin Panel | 20130 | React/Vite 管理面板 |

---

## 快速开始 Quick Start

### 前置要求

- Python 3.11+
- Node.js 20+ 和 pnpm 9+

### 1. 克隆并安装依赖

```bash
git clone https://github.com/your-username/jetbrains-ai-proxy.git
cd jetbrains-ai-proxy
pnpm install
pip install -r python/proxy/requirements.txt
```

### 2. 配置数据文件

```bash
# 复制示例文件
cp python/proxy/jetbrainsai.json.example python/proxy/jetbrainsai.json
cp python/proxy/client_api_keys.json.example python/proxy/client_api_keys.json
```

### 3. 设置环境变量

```bash
export SESSION_SECRET="your-random-secret-64chars"   # 任意随机字符串
export ADMIN_PASSWORD="your-strong-admin-password"   # 管理面板登录密码
```

也可以创建 `.env` 文件（不会被提交到 git）：

```env
SESSION_SECRET=your-random-secret-64chars
ADMIN_PASSWORD=your-strong-admin-password
```

### 4. 启动所有服务

**方式一：分终端启动**

```bash
# 终端 1 — Python 代理
cd python/proxy && python3 main.py

# 终端 2 — API 服务器
PORT=8080 BASE_PATH=/api pnpm --filter @workspace/api-server run dev

# 终端 3 — 管理面板
PORT=20130 BASE_PATH=/admin-panel pnpm --filter @workspace/admin-panel run dev
```

**方式二：一键启动脚本（推荐）**

```bash
bash scripts/start.sh
```

访问管理面板：[http://localhost:20130](http://localhost:20130)，使用 `ADMIN_PASSWORD` 登录。

---

## Docker 部署 Docker Deployment

最简单的生产部署方式，三个服务一键启动。

The easiest way to deploy in production — all three services with a single command.

### 1. 克隆仓库

```bash
git clone https://github.com/ydddp/JetBrains-UI.git
cd JetBrains-UI
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填写必填项
```

`.env` 必填项：

```env
# 管理面板登录密码
ADMIN_PASSWORD=your-strong-password
```

可选配置：

```env
# 用于签名管理员 Token 的随机字符串（至少 32 位）
# 若不填，首次启动会自动生成并保存到数据卷，重启后不失效
# SESSION_SECRET=your-random-secret-string-at-least-32-chars

# 对外暴露的 HTTP 端口（默认 80）
# HTTP_PORT=80
```

### 3. 初始化数据文件

首次部署需要准备初始配置文件。

**方式 A（无 JetBrains 账号，等进面板添加）：**

```bash
# 仅需 client_api_keys.json（客户端 API 密钥列表）
echo '["sk-your-api-key"]' > python/proxy/client_api_keys.json
```

**方式 B（已有 jetbrainsai.json）：**

```bash
cp python/proxy/jetbrainsai.json.example python/proxy/jetbrainsai.json
cp python/proxy/client_api_keys.json.example python/proxy/client_api_keys.json
# 编辑这两个文件填入真实账号信息
```

### 4. 构建并启动

```bash
docker compose up -d --build
```

首次构建需要几分钟（pnpm install + esbuild）。启动后访问：

- **管理面板** → http://localhost（或你配置的 HTTP_PORT）
- **AI 代理接口** → http://localhost/v1

### 5. 管理面板添加账号

访问管理面板，使用 `ADMIN_PASSWORD` 登录，然后在「账号」页面添加 JetBrains 账号。

### 常用命令

```bash
# 查看日志
docker compose logs -f

# 重启服务
docker compose restart

# 停止服务
docker compose down

# 备份数据（重要！）
docker compose cp api-server:/data ./backup-$(date +%Y%m%d)
```

> **数据持久化**：账号凭证和配置保存在 Docker named volume `proxy-data` 中，删除容器不会丢失数据，但 `docker compose down -v` 会清除数据，请注意备份。

---

## 添加 JetBrains 账号

在管理面板 **账号 → 添加账号** 中，有两种方式：

### 方式一：账号密码登录（推荐 · 全自动）

输入 JetBrains 邮箱和密码，系统自动：
1. 登录账号
2. 激活 AI 试用（如未激活）
3. 绑定 License
4. 保存 Token 并开始使用

### 方式二：OAuth 授权

1. 点击「获取 JetBrains 授权链接」
2. 在浏览器中访问链接完成授权
3. 授权后浏览器跳转到 `http://localhost:3000/?code=...`
4. 复制完整 URL 粘贴回面板

OAuth 账号的 Token 每 50 分钟自动刷新，无需手动维护。

---

## 代理使用方法

代理兼容 OpenAI API 格式，将 `api.openai.com` 替换为你的服务地址即可。

```bash
# 列出可用模型
curl http://localhost:8000/v1/models \
  -H "Authorization: Bearer sk-your-key"

# 发送对话请求
curl http://localhost:8000/v1/chat/completions \
  -H "Authorization: Bearer sk-your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic-claude-4-5-sonnet",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

客户端 API Key 在管理面板 **API 密钥** 页面管理。

---

## 生产部署

### 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `SESSION_SECRET` | ✅ | Token 签名密钥（随机字符串，至少 32 位） |
| `ADMIN_PASSWORD` | ✅ | 管理面板登录密码 |
| `VITE_API_SERVER_URL` | 可选 | 自定义 API Server URL（本地开发时不需要） |

### Nginx 反代配置示例

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    # 管理面板
    location / {
        proxy_pass http://localhost:20130;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # API Server
    location /api {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
    }

    # AI 代理接口（供 AI 客户端使用）
    location /v1 {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
    }
}
```

---

## 数据文件说明

这些文件包含敏感信息，**不会被提交到 git**（已加入 `.gitignore`）：

| 文件 | 说明 |
|------|------|
| `python/proxy/jetbrainsai.json` | JetBrains 账号凭证（自动管理） |
| `python/proxy/client_api_keys.json` | 客户端 API 密钥 |
| `python/proxy/usage_stats.json` | 使用统计（自动生成） |

首次部署时从 `.example` 文件复制，然后通过管理面板添加账号。

---

## 技术栈

- **Python**: FastAPI（代理核心）
- **TypeScript/Node.js**: Express 5（管理 API）
- **前端**: React + Vite + shadcn/ui + Tailwind CSS
- **包管理**: pnpm workspaces（monorepo）
- **认证**: HMAC-SHA256 token（Bearer token 方案）

---

## License

MIT
