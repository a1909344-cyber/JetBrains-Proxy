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

# Data directory for persistent files
RUN mkdir -p /data

# Default environment variables for api-server
# ADMIN_PASSWORD must be provided by the deployment platform (e.g. Zeabur)
ENV PORT=8080 \
    NODE_ENV=production \
    DATA_DIR=/data \
    LOG_FILE=/data/proxy.log \
    PROXY_INTERNAL_URL=http://127.0.0.1:8000

EXPOSE 80

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
