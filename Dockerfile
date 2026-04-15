# ── Stage 1: Build admin panel ───────────────────────────────────────────────
FROM node:20-slim AS frontend-builder

RUN npm install -g pnpm@10

WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile
RUN PORT=3000 BASE_PATH=/ pnpm --filter @workspace/admin-panel run build

# ── Stage 2: Build api-server ────────────────────────────────────────────────
FROM node:20-slim AS api-builder

RUN npm install -g pnpm@10

WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server run build

# ── Stage 3: Final image ─────────────────────────────────────────────────────
FROM python:3.11-slim

# System packages: nginx, supervisord, Node.js, CA certs
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    supervisor \
    curl \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── Python proxy ──────────────────────────────────────────────────────────────
COPY python/proxy/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY python/proxy/main.py /app/proxy/main.py
COPY python/proxy/models.json /data/models.json

# ── API server ────────────────────────────────────────────────────────────────
COPY --from=api-builder /workspace/artifacts/api-server/dist/ /app/api-server/dist/

# ── Admin panel (static files) ────────────────────────────────────────────────
COPY --from=frontend-builder /workspace/artifacts/admin-panel/dist/public/ /usr/share/nginx/html/

# ── Nginx config (localhost routing — all services in one container) ──────────
COPY docker/nginx.zeabur.conf /etc/nginx/conf.d/default.conf
RUN rm -f /etc/nginx/sites-enabled/default

# ── Supervisord config ────────────────────────────────────────────────────────
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# ── Entrypoint: adjusts nginx listen port to match $PORT injected by PaaS ─────
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Data directory for persistent files
RUN mkdir -p /data

# Expose port 80 as default; PaaS platforms (Zeabur) override via $PORT env var
# which entrypoint.sh reads and writes into nginx config at startup.
EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
