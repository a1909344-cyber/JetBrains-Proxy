#!/bin/sh
set -e

# Zeabur (and other PaaS) inject $PORT — nginx must listen on that port.
# Internal services (api-server, proxy) use fixed ports.
NGINX_PORT=${PORT:-80}

echo "[entrypoint] nginx will listen on port ${NGINX_PORT}"
echo "[entrypoint] api-server will listen on port 8080 (internal)"

# Substitute the nginx listen port in the config
sed -i "s/listen 80;/listen ${NGINX_PORT};/g" /etc/nginx/conf.d/default.conf

# Override PORT so the api-server always uses 8080 regardless of PaaS injection
# (supervisord will pass this down to the api-server process)
export FIXED_API_PORT=8080

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
