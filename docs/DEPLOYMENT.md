# Production-развёртывание

## Рекомендуемый сервер

Для демонстрации и небольшой публичной нагрузки достаточно VPS с 2 vCPU, 4 ГБ RAM и 60 ГБ NVMe. Рекомендуется Linux LTS, reverse proxy Nginx/Caddy и Node.js 22 LTS. GPU и база данных не нужны.

## Сборка

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm quality
```

Клиент собирается в `dist/`, сервер — в `.server-dist/`. Production не исполняет TypeScript напрямую.

## Переменные окружения

```dotenv
HOST=127.0.0.1
PORT=8787
NODE_ENV=production
APP_VERSION=1.0.0
TRUST_PROXY=1
TUTU_MCP_URL=https://mcp.tutu.ru/mcp
TUTU_MCP_TIMEOUT_MS=20000
```

При запуске в контейнере `HOST` меняется на `0.0.0.0`. На обычной VPS за reverse proxy безопаснее оставить `127.0.0.1`.

## systemd

```ini
[Unit]
Description=Tutu Comparison
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=tutu
WorkingDirectory=/opt/tutu-comparison
EnvironmentFile=/etc/tutu-comparison.env
ExecStart=/usr/bin/node .server-dist/server/main.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/tutu-comparison/.tutu-cache

[Install]
WantedBy=multi-user.target
```

## Nginx

```nginx
server {
    listen 80;
    server_name compare.example.ru;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name compare.example.ru;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
    }
}
```

TLS-сертификат следует получить через ACME/Let's Encrypt. Не открывайте порт 8787 в публичном firewall.

## Проверка после релиза

```bash
curl --fail --silent https://compare.example.ru/api/health
journalctl -u tutu-comparison --since '10 minutes ago'
```

Ожидаемый health status — HTTP 200 с `ok: true`. Для отката переключите симлинк релиза на предыдущую собранную версию и перезапустите systemd unit.
