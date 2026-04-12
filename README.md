# JetBrains AI Proxy

A self-hosted reverse proxy for JetBrains AI API with an admin management panel.

## Architecture

| Service | Port | Description |
|---------|------|-------------|
| Python Proxy | 8000 | Core proxy — forwards requests to JetBrains AI |
| API Server | 8080 | TypeScript/Express admin API |
| Admin Panel | 20130 | React/Vite web admin interface |

## Quick Start (Local)

### Prerequisites

- Python 3.11+
- Node.js 20+ and pnpm 9+

### 1. Clone and install

```bash
git clone <your-repo-url>
cd <repo>
pnpm install
```

### 2. Configure secrets

Copy the example files and fill in your data:

```bash
cp python/proxy/jetbrainsai.json.example python/proxy/jetbrainsai.json
cp python/proxy/client_api_keys.json.example python/proxy/client_api_keys.json
```

Set environment variables:

```bash
export SESSION_SECRET="your-random-secret-string"
export ADMIN_PASSWORD="your-admin-panel-password"
```

Or create a `.env` file (loaded by the start script).

### 3. Start all services

```bash
# Terminal 1 — Python proxy
cd python/proxy && python3 main.py

# Terminal 2 — API server
PORT=8080 BASE_PATH=/api pnpm --filter @workspace/api-server run dev

# Terminal 3 — Admin panel
PORT=20130 BASE_PATH=/admin-panel pnpm --filter @workspace/admin-panel run dev
```

Open [http://localhost:20130](http://localhost:20130) and log in with your `ADMIN_PASSWORD`.

## Admin Panel Features

- **Dashboard** — Proxy status, account count, API key count, model count
- **Accounts** — Manage JetBrains AI accounts (password login, OAuth PKCE)
- **API Keys** — Manage client access keys for the proxy
- **Models** — Configure model name mappings
- **API Tester** — Test the proxy endpoint directly from the panel
- **Logs** — Live proxy server logs

## Adding JetBrains Accounts

In the admin panel, go to **Accounts → Add Account** and use one of:

1. **Password Login** (recommended) — enter JetBrains email/password, the system automatically logs in, activates a trial, and sets up the license.
2. **OAuth Login** — copy the OAuth URL, authorize in your browser, paste the callback URL back.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SESSION_SECRET` | Yes | Secret for signing tokens (random string) |
| `ADMIN_PASSWORD` | Yes | Admin panel login password |
| `PORT` | Yes | Port for each service (set per process) |

## Data Files (not committed to git)

| File | Description |
|------|-------------|
| `python/proxy/jetbrainsai.json` | JetBrains account credentials (auto-managed) |
| `python/proxy/client_api_keys.json` | Client API keys |
| `python/proxy/usage_stats.json` | Usage statistics |

## Deploying to Production

For production, set `ADMIN_PASSWORD` and `SESSION_SECRET` as environment variables on your hosting platform. The admin panel can be served behind a reverse proxy (nginx, Caddy, etc.) with TLS.

Example nginx config:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    # Admin panel
    location /admin-panel {
        proxy_pass http://localhost:20130;
    }

    # API server
    location /api {
        proxy_pass http://localhost:8080;
    }

    # Proxy endpoint (for AI clients)
    location /v1 {
        proxy_pass http://localhost:8000;
    }
}
```
