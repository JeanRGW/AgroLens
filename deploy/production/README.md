# AgroLens Production Deployment

Single-host runbook for Docker Engine + Compose v2 + host Caddy.

## Topology

| Domain                         | Service                           | Internal binding     |
| ------------------------------ | --------------------------------- | -------------------- |
| `https://app.agrolens.rgw.app` | Angular SPA + NestJS API + worker | `127.0.0.1:3000`     |
| `https://s3.agrolens.rgw.app`  | Garage S3 object storage          | `127.0.0.1:3900`     |
| Internal only                  | PostgreSQL 16                     | Docker network, 5432 |
| Internal only                  | FastAPI inference (profile `ai`)  | Docker network, 8000 |

The backend image embeds the Angular production bundle. Migrations run automatically on boot under a PostgreSQL advisory lock; the admin seed stays an explicit operator command.

## Initial Setup

### 1. Configure and reload Caddy

```bash
sudo install -m 0644 Caddyfile.example /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

### 2. Configure environment

```bash
cd deploy/production
cp .env.example .env
```

Set all secrets (`JWT_SECRET`, `S3_SECRET_KEY`, `DATABASE_URL`, `ADMIN_*`, `INFERENCE_API_KEY` when applicable). Never commit `.env`.

Keep Caddy's PUT limits in `Caddyfile.example` aligned with `UPLOAD_MAX_FILE_SIZE_BYTES` (100 MiB for staged uploads), `INFERENCE_TEMP_MAX_FILE_SIZE_BYTES` (25 MiB for inference images), and `INFERENCE_MODEL_MAX_SIZE_BYTES` (500 MiB for models). These path-style `/<bucket>/...` limits apply before Garage stores a body; requests that bypass host Caddy do not get them.

Worker model downloads use the internal `S3_ENDPOINT`, normally `http://garage:3900`. Set `INFERENCE_MODEL_DOWNLOAD_ORIGINS` to that origin. **When upgrading an existing deployment**, replace an allowlist containing only the public S3 origin before restarting backend and inference together. Browser/device signed URLs continue to use `S3_PUBLIC_ENDPOINT`.

### 3. Validate compose config

```bash
docker compose -f docker-compose.prod.yml --env-file .env.example config --quiet
```

### 4. Build and start

App-only (default):

```bash
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env"
$COMPOSE build --pull backend
$COMPOSE up -d backend
```

With inference:

```bash
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env"
$COMPOSE build --pull backend
INFERENCE_ENABLED=true $COMPOSE --profile ai up -d backend inference
```

### 5. Seed first admin

Creates the admin when missing; otherwise reconciles role/name/phone and keeps the password unless `ADMIN_RESET_PASSWORD=true` (which revokes sessions). Placeholder passwords are rejected.

```bash
set -a; . .env; set +a
$COMPOSE run --rm --no-deps \
  -e ADMIN_EMAIL -e ADMIN_PASSWORD -e ADMIN_FULL_NAME -e ADMIN_PHONE \
  backend node dist/cli/seed-first-admin.js
```

## Updates

```bash
cd deploy/production
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env"
$COMPOSE build --pull backend
$COMPOSE up -d --force-recreate --remove-orphans backend
```

After Caddy changes:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## Health and Diagnostics

Public liveness and host-local readiness:

```bash
curl -fsS https://app.agrolens.rgw.app/api/health
curl -fsS http://127.0.0.1:3000/api/health/ready
```

The production Compose healthcheck uses `/api/health/ready`: it returns 503 if the database, Garage bucket, or embedded worker is unavailable. Host Caddy blocks external access with or without a trailing slash. The API also throttles readiness checks per IP (10/minute by default); keep that limit above the four checks/minute used by Compose. Public `/api/health` reports process liveness only.

Admin diagnostics (Bearer token):

```bash
TOKEN="your_admin_access_token"
curl -fsS -H "Authorization: Bearer $TOKEN" https://app.agrolens.rgw.app/api/health/db
curl -fsS -H "Authorization: Bearer $TOKEN" https://app.agrolens.rgw.app/api/health/storage
curl -fsS -H "Authorization: Bearer $TOKEN" https://app.agrolens.rgw.app/api/health/worker
curl -fsS -H "Authorization: Bearer $TOKEN" https://app.agrolens.rgw.app/api/admin/jobs/dead
```

The worker diagnostic includes queue depth, dead count, and oldest pending age. Inspect dead finalization/deletion jobs with `/api/admin/jobs/dead`, fix the underlying problem, then retry (`upload_finalization` or `object_deletion`):

```bash
QUEUE=upload_finalization
JOB_ID=<job_uuid>
curl -fsS -X POST -H "Authorization: Bearer $TOKEN" \
  "https://app.agrolens.rgw.app/api/admin/jobs/dead/$QUEUE/$JOB_ID/retry"
```

## Backups

```bash
sudo systemctl start agrolens-backup.service
sudo journalctl -u agrolens-backup.service -n 50
```

Full restore steps: [`docs/operations/backup-restore.md`](../../docs/operations/backup-restore.md).
