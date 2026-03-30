# PersonalFi — Deployment Guide

## Prerequisites

- **Node.js 22+** (LTS recommended)
- **npm** (comes with Node.js)
- Linux, macOS, or Windows server
- At least 256 MB RAM, 500 MB disk space

## Installation

```bash
# Clone the repository
git clone <your-repo-url> personalfi
cd personalfi

# Install dependencies
npm install --production

# (Optional) Copy and edit environment config
cp .env.example .env
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3457` | HTTP server port |
| `DB_DIR` | project root | Directory for SQLite database and backups |
| `NODE_ENV` | `development` | Set to `production` for production deployments |
| `DEFAULT_CURRENCY` | `INR` | Default currency for new users |
| `SESSION_MAX_AGE_DAYS` | `30` | Session expiry (days) |
| `SESSION_REMEMBER_DAYS` | `30` | Remember-me session duration (days) |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (milliseconds) |
| `RATE_LIMIT_MAX` | `200` | Max requests per rate limit window |
| `BCRYPT_SALT_ROUNDS` | `12` | bcrypt hashing cost factor |
| `AUTH_LIMIT_WINDOW_MS` | `900000` | Auth rate limit window (15 min) |
| `AUTH_LIMIT_MAX` | `20` | Max auth attempts per window |
| `LOCKOUT_THRESHOLD` | `5` | Failed logins before lockout |
| `LOCKOUT_DURATION_MS` | `900000` | Account lockout duration (15 min) |
| `LOG_LEVEL` | `info` | Logging level (`debug`, `info`, `warn`, `error`) |
| `BACKUP_RETAIN_COUNT` | `7` | Number of backups to retain |
| `BACKUP_INTERVAL_HOURS` | `24` | Auto-backup interval (hours) |
| `BACKUP_MAX_BACKUPS` | `5` | Maximum backup files kept |
| `BACKUP_AUTO_ON_START` | `false` | Run backup on server start (`true`/`false`) |
| `BACKUP_ENCRYPTION_KEY` | _(empty)_ | AES key for encrypting backups |
| `CORS_ORIGIN` | _(empty)_ | Allowed CORS origins (comma-separated) |
| `CORS_ORIGINS` | `*` | CORS origins for structured config |
| `CORS_METHODS` | `GET,POST,PUT,DELETE,PATCH` | Allowed HTTP methods |
| `CORS_HEADERS` | `Content-Type,X-Session-Token,Authorization` | Allowed headers |
| `CORS_CREDENTIALS` | `true` | Allow credentials (`true`/`false`) |
| `TRUST_PROXY` | `false` | Enable when behind a reverse proxy (`true`/`false`) |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Graceful shutdown timeout (ms) |
| `DEMO_MODE` | `false` | Enable demo mode (`true`/`false`) |
| `BRAND_NAME` | `FinanceFlow` | Application display name |
| `BRAND_LOGO_URL` | _(empty)_ | Custom logo URL |
| `BRAND_COLOR` | `#6366f1` | Primary brand color |

## Running in Production

```bash
# Set environment
export NODE_ENV=production
export PORT=3457
export DB_DIR=/var/lib/personalfi

# Start the server
node src/server.js
```

The server listens on the configured port and serves both the API and the static frontend.

## Running with PM2

[PM2](https://pm2.keymetrics.io/) is recommended for production process management.

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start src/server.js --name personalfi \
  --env production \
  -- --max-memory-restart 256M

# Save process list for auto-restart on reboot
pm2 save
pm2 startup

# View logs
pm2 logs personalfi

# Restart / stop
pm2 restart personalfi
pm2 stop personalfi
```

### PM2 ecosystem file (`ecosystem.config.js`)

```javascript
module.exports = {
  apps: [{
    name: 'personalfi',
    script: 'src/server.js',
    instances: 1,
    env_production: {
      NODE_ENV: 'production',
      PORT: 3457,
      DB_DIR: '/var/lib/personalfi',
    },
    max_memory_restart: '256M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
};
```

```bash
pm2 start ecosystem.config.js --env production
```

## Running with systemd

Create `/etc/systemd/system/personalfi.service`:

```ini
[Unit]
Description=PersonalFi Finance Manager
After=network.target

[Service]
Type=simple
User=personalfi
Group=personalfi
WorkingDirectory=/opt/personalfi
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3457
Environment=DB_DIR=/var/lib/personalfi

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/personalfi

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable personalfi
sudo systemctl start personalfi
sudo journalctl -u personalfi -f
```

## Reverse Proxy (nginx)

When deploying behind nginx, set `TRUST_PROXY=true`.

```nginx
server {
    listen 80;
    server_name finance.example.com;

    location / {
        proxy_pass http://127.0.0.1:3457;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Backup Strategy

PersonalFi uses SQLite — the entire database is a single file (`personalfi.db`).

### Automatic backups

Set `BACKUP_AUTO_ON_START=true` and configure `BACKUP_INTERVAL_HOURS` and `BACKUP_MAX_BACKUPS`. The server creates backups in the `backups/` subdirectory of `DB_DIR`.

### Manual backup

```bash
npm run backup
# Or copy the database file directly (while server is idle):
cp /var/lib/personalfi/personalfi.db /backups/personalfi-$(date +%F).db
```

### Encrypted backups

Set `BACKUP_ENCRYPTION_KEY` to an AES-256 key to encrypt backup files.

### Offsite backups

Automate copying backups to remote storage:

```bash
# Example: rsync to remote server
rsync -az /var/lib/personalfi/backups/ user@backup-server:/backups/personalfi/

# Example: upload to S3-compatible storage
aws s3 sync /var/lib/personalfi/backups/ s3://my-bucket/personalfi-backups/
```

## Security Recommendations

1. **Always run with `NODE_ENV=production`** — disables debug output and enables security defaults.
2. **Use HTTPS** — terminate TLS at your reverse proxy (nginx, Caddy, etc.).
3. **Set `TRUST_PROXY=true`** when behind a reverse proxy so rate limiting uses the real client IP.
4. **Restrict CORS origins** — set `CORS_ORIGIN` to your frontend domain(s) instead of `*`.
5. **Use strong bcrypt rounds** — keep `BCRYPT_SALT_ROUNDS` at 12 or higher.
6. **Set a backup encryption key** — protect database backups with `BACKUP_ENCRYPTION_KEY`.
7. **Firewall** — only expose the application port via reverse proxy; block direct access.
8. **File permissions** — run as a dedicated non-root user; restrict database file ownership.
9. **Keep dependencies updated** — run `npm audit` regularly.
10. **Monitor logs** — use `LOG_LEVEL=info` and forward logs to a centralized system.

## Monitoring

### Health check

```bash
curl http://localhost:3457/api/health
# Returns: { "status": "ok", "timestamp": "...", "version": "...", ... }
```

Use `GET /api/health` for load balancer health checks (no authentication required).
Use `GET /api/health/ready` for readiness probes and `GET /api/health/live` for liveness probes.

### Metrics endpoint

```bash
curl -H "X-Session-Token: <admin-token>" http://localhost:3457/api/metrics
```

Returns (admin only):
- Server uptime (seconds)
- Memory usage (RSS, heap)
- Total HTTP requests served
- Database status and file size
- Total user and transaction counts

### API versioning

All API endpoints are available under both `/api/` and `/api/v1/`:

```bash
curl http://localhost:3457/api/version
# { "version": "0.3.49", "api_version": "v1" }

curl http://localhost:3457/api/v1/health
# Same as /api/health
```

## Troubleshooting

### Server won't start

- **Port in use**: Change `PORT` or stop the conflicting process: `lsof -i :3457`
- **Permission denied on DB_DIR**: Ensure the directory exists and is writable by the server user.
- **Missing dependencies**: Run `npm install` again.
- **Node.js version**: Verify `node --version` is 22+.

### Database errors

- **"database is locked"**: Ensure only one server instance accesses the database file. SQLite does not support concurrent writers from multiple processes.
- **Corrupt database**: Restore from the latest backup in `DB_DIR/backups/`.

### Authentication issues

- **Account locked out**: Wait for the lockout duration (`LOCKOUT_DURATION_MS`, default 15 minutes) or restart the server.
- **Session expired**: Log in again. Adjust `SESSION_MAX_AGE_DAYS` if sessions expire too quickly.

### Performance

- **High memory usage**: Set `max_memory_restart` in PM2. PersonalFi is lightweight but RSS can grow over time.
- **Slow responses**: Check `GET /api/metrics` for average response time. Ensure the database file is on fast storage (SSD).

### Backup failures

- **Disk full**: Free space or reduce `BACKUP_MAX_BACKUPS`.
- **Encryption errors**: Verify `BACKUP_ENCRYPTION_KEY` is consistent between backup and restore operations.

### Logs

```bash
# PM2 logs
pm2 logs personalfi

# systemd journal
journalctl -u personalfi -f

# Adjust log verbosity
export LOG_LEVEL=debug
```
