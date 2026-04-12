# JetBrains AI Admin Panel

## Overview

This project hosts both the JetBrains AI OpenAI-compatible proxy and a web admin panel to manage its configuration.

## Architecture

```
/
├── python/
│   ├── proxy/          # JetBrains AI core proxy (from github.com/oDaiSuno/jetbrainsai2api)
│   │   ├── main.py     # FastAPI proxy — DO NOT modify (OpenAI-compatible adapter)
│   │   ├── jetbrainsai.json        # JetBrains accounts config
│   │   ├── client_api_keys.json    # Client bearer token keys
│   │   ├── models.json             # Supported model IDs + Anthropic mappings
│   │   └── requirements.txt
│   ├── admin_api/      # (unused — replaced by api-server TypeScript routes)
│   └── proxy.log       # Proxy stdout log file (auto-created)
│
├── artifacts/
│   ├── admin-panel/    # React + Vite admin panel frontend (served at /)
│   └── api-server/     # Express backend — handles admin API routes at /api/admin/
│
└── lib/
    └── api-spec/openapi.yaml   # OpenAPI spec (source of truth for admin API)
```

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Python version**: 3.11
- **Package manager**: pnpm (Node) + pip (Python)
- **API framework**: Express 5 (TypeScript, admin API) + FastAPI (Python, proxy)
- **Frontend**: React + Vite + shadcn/ui + Tailwind
- **Validation**: Zod + Orval codegen

## Services

| Service | Port | Path | Description |
|---|---|---|---|
| Admin Panel Frontend | 20130 | `/` | React+Vite management UI |
| API Server (admin routes) | 8080 | `/api` | Express server with admin CRUD routes |
| JetBrains AI Proxy | 8000 | `/v1` | Python proxy to JetBrains AI |

## Account Modes

JetBrains accounts in `jetbrainsai.json` support three modes:

| Mode | Fields | Notes |
|------|--------|-------|
| **OAuth** | `licenseId`, `authorization` (id_token), `refresh_token`, `email`, `id_token_expires_at` | Via OAuth PKCE flow; api-server auto-refreshes id_token every 50 min |
| **License + Auth** | `licenseId`, `authorization` | Manual entry; proxy auto-refreshes JWT using id_token |
| **JWT Only** | `jwt` | Static JWT; expires in ~1 hour, must be manually updated |

## OAuth Flow (JetBrains PKCE)

- Auth URL: `https://account.jetbrains.com/oauth/login`
- Token URL: `https://oauth.account.jetbrains.com/oauth2/token`
- Client ID: `ide` (public client, no secret needed)
- Scopes: `openid offline_access r_ide_auth`
- Redirect URI: `http://localhost:3000` (user copies the redirect URL for remote deploy)
- PKCE method: S256
- Background refresh: api-server checks every 10 min, refreshes when `id_token_expires_at` < 5 min

## Key Commands

- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks from OpenAPI spec
- `pnpm --filter @workspace/admin-panel run dev` — start admin frontend
- `pnpm --filter @workspace/api-server run dev` — start admin API server
- Python proxy starts via "JetBrains AI Proxy" workflow

## Admin API Routes (served at /api/admin/)

- `GET /api/admin/status` — service status + counts
- `GET/PUT /api/admin/config/jetbrainsai` — manage JetBrains accounts
- `GET/PUT /api/admin/config/client-keys` — manage client API keys
- `GET/PUT /api/admin/config/models` — manage models config
- `GET /api/admin/logs` — proxy log lines
- `POST /api/admin/proxy/test-models` — test GET /v1/models
- `POST /api/admin/proxy/test-chat` — test POST /v1/chat/completions

## Config Files

All config files live in `python/proxy/`:
- `jetbrainsai.json`: array of account objects with `jwt`, `licenseId`, `authorization` fields
- `client_api_keys.json`: array of bearer token strings
- `models.json`: `{ models: string[], anthropic_model_mappings: Record<string, string> }`

## Proxy Usage

The JetBrains AI proxy at port 8000 provides OpenAI-compatible endpoints:
- `GET /v1/models` — list available models
- `POST /v1/chat/completions` — chat (OpenAI style)
- `POST /v1/messages` — chat (Anthropic style)

Use `Authorization: Bearer sk-xxx` header with one of the keys from `client_api_keys.json`.
