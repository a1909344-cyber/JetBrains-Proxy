# JetBrains AI Proxy

OpenAI / Anthropic 兼容的 JetBrains AI 反向代理，带 Web 管理面板。

> **此分支（`vps`）为 VPS 独立部署版本**，已移除 Replit 相关配置。

## 功能

- **OpenAI 兼容接口** `POST /v1/chat/completions` / `GET /v1/models`
- **Anthropic 兼容接口** `POST /v1/messages`
- **账号池轮转**：多 JetBrains 账号自动轮换，JWT 自动续期
- **客户端 API Key 管理**：多 key 分发，按 key 统计用量
- **管理面板**：账号添加（密码/OAuth/手动）、日志、使用统计，支持中英文切换
- **账号导出/导入**：JSON 格式，方便多机迁移

## 快速部署

### 环境要求

```bash
curl -fsSL https://get.docker.com | sh
```

### 步骤

```bash
git clone -b vps https://github.com/ydddp/JetBrains-UI.git
cd JetBrains-UI
cp .env.example .env
nano .env          # 至少设置 ADMIN_PASSWORD
docker compose up -d
```

浏览器访问 `http://你的IP` → 管理面板。

### 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `ADMIN_PASSWORD` | ✅ | 管理面板登录密码 |
| `SESSION_SECRET` | 否 | 首次启动自动生成并持久化 |
| `HTTP_PORT` | 否 | 对外暴露端口，默认 `80` |

## 客户端配置

管理面板 → **API 密钥** 页面创建客户端密钥，然后在 IDE / 工具中：

| 配置项 | 值 |
|--------|-----|
| Base URL | `http://你的IP/v1` |
| API Key | 管理面板里创建的密钥 |

兼容：JetBrains IDE（AI Assistant）、Cursor、Continue、任意 OpenAI SDK。

## 账号添加

管理面板 → **账号** → 三种方式：

| 方式 | 说明 |
|------|------|
| 邮箱+密码 ⭐ | 全自动：登录→激活试用→写入配置，一步完成 |
| OAuth 授权 | 手动完成 JetBrains 授权，粘贴回调 URL |
| 手动填写 | 直接填 licenseId + Authorization Token |

## 数据备份

数据存储在 Docker volume `JetBrains-UI_proxy-data`：

```bash
# 备份
docker run --rm \
  -v JetBrains-UI_proxy-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/proxy-data-$(date +%F).tar.gz -C /data .

# 恢复
docker run --rm \
  -v JetBrains-UI_proxy-data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/proxy-data-YYYY-MM-DD.tar.gz -C /data
```

## 更新

```bash
git pull origin vps
docker compose build --no-cache
docker compose up -d
```

## 架构

```
:80 nginx
 ├── /api/*  → api-server:8080 (Node.js)
 └── /       → admin panel (静态文件)
              ↓ 内部网络
           proxy:8000 (Python)
              ↓ HTTPS
         api.jetbrains.ai
```

## License

MIT
