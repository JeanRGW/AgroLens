# Backup and Restore Runbook

Operational guide for executing live backups and performing full disaster recovery restores.

---

## 1. Live Backup (Automated & Manual)

### Run On-Demand Backup
```bash
sudo systemctl start agrolens-backup.service
# Or directly:
sudo ./deploy/production/agrolens-backup.sh
```

### Inspect Snapshots
```bash
sudo restic -r "$RESTIC_REPOSITORY" -p /etc/agrolens/restic-password snapshots
```

---

## 2. Full Disaster Recovery (Restore)

### Step 1: Extract Restic Snapshot to Host
```bash
SNAPSHOT_ID="<snapshot_id>"
STAMP="<timestamp_folder>"
RESTORE_TARGET="/var/backups/agrolens-restore"

sudo restic -r "$RESTIC_REPOSITORY" -p /etc/agrolens/restic-password \
  restore "$SNAPSHOT_ID" --target "$RESTORE_TARGET" \
  --include "/var/backups/agrolens/$STAMP/*"

RESTORE_DIR="$RESTORE_TARGET/var/backups/agrolens/$STAMP"
test -f "$RESTORE_DIR/postgres.dump"
test -d "$RESTORE_DIR/objects"
```

### Step 2: Start PostgreSQL & Garage (Only)
```bash
cd deploy/production
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env"

$COMPOSE stop backend
$COMPOSE up -d postgres garage
$COMPOSE ps
```

### Step 3: Restore PostgreSQL Database Dump
```bash
$COMPOSE exec -T postgres \
  sh -c 'pg_restore --username="${POSTGRES_USER:-postgres}" --dbname="${POSTGRES_DB:-agrolens}" \
    --format=custom --clean --if-exists' \
  < "$RESTORE_DIR/postgres.dump"
```

### Step 4: Restore Garage S3 Objects
```bash
GARAGE_CID="$($COMPOSE ps -q garage)"
GARAGE_ENV="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$GARAGE_CID")"
S3_ACCESS_KEY="$(printf '%s\n' "$GARAGE_ENV" | awk -F= '$1 == "GARAGE_DEFAULT_ACCESS_KEY" { print substr($0, index($0, "=") + 1); exit }')"
S3_SECRET_KEY="$(printf '%s\n' "$GARAGE_ENV" | awk -F= '$1 == "GARAGE_DEFAULT_SECRET_KEY" { print substr($0, index($0, "=") + 1); exit }')"
S3_BUCKET="$(printf '%s\n' "$GARAGE_ENV" | awk -F= '$1 == "GARAGE_DEFAULT_BUCKET" { print substr($0, index($0, "=") + 1); exit }')"

mapfile -t GARAGE_NETWORKS < <(docker inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' "$GARAGE_CID")

RCLONE_CONFIG="$(mktemp)"
chmod 600 "$RCLONE_CONFIG"
printf '[garage]\ntype = s3\nprovider = Other\nendpoint = http://garage:3900\nregion = garage\naccess_key_id = %s\nsecret_access_key = %s\nforce_path_style = true\n' \
  "$S3_ACCESS_KEY" "$S3_SECRET_KEY" > "$RCLONE_CONFIG"

docker run --rm --network "${GARAGE_NETWORKS[0]}" \
  -v "$RCLONE_CONFIG:/config/rclone/rclone.conf:ro" \
  -v "$RESTORE_DIR/objects:/restore:ro" \
  rclone/rclone:1.70.3 \
  copy /restore "garage:$S3_BUCKET" --transfers 8 --checkers 8

rm -f "$RCLONE_CONFIG"
```

### Step 5: Start Backend Application
```bash
$COMPOSE up -d backend
```
*The backend applies database migrations automatically on boot under an advisory lock.*

---

## 3. Post-Restore Verification

```bash
# Public liveness
curl -fsS https://app.agrolens.rgw.app/api/health

# Authenticated component checks
TOKEN="your_admin_jwt_token"
curl -fsS -H "Authorization: Bearer $TOKEN" https://app.agrolens.rgw.app/api/health/db
curl -fsS -H "Authorization: Bearer $TOKEN" https://app.agrolens.rgw.app/api/health/storage
curl -fsS -H "Authorization: Bearer $TOKEN" https://app.agrolens.rgw.app/api/health/worker
```
