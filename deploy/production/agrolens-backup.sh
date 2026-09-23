#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE=${BACKUP_ENV_FILE:-/etc/agrolens/backup.env}
RCLONE_IMAGE=rclone/rclone:1.70.3
RCLONE_DIGEST=sha256:34c729127386abec1c610b2aa024e39b4498dc2b4a72a0798ae21fbdc1b0493b

log() { printf '%s backup: %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }
fail() { log "FAILED: $*"; exit 1; }
secure_file() {
  parent=$(dirname -- "$1")
  [ -d "$parent" ] || fail "$2 parent is not a directory"
  [ ! -L "$parent" ] || fail "$2 parent must not be a symlink"
  [ "$(stat -c '%u %a' "$parent")" = "0 755" ] || fail "$2 parent must be root-owned and mode 0755"
  [ ! -L "$1" ] || fail "$2 must not be a symlink"
  [ -f "$1" ] || fail "$2 is not a regular file"
  [ "$(stat -c '%u %a' "$1")" = "0 600" ] || fail "$2 must be root-owned and mode 0600"
}
[ "$(id -u)" -eq 0 ] || fail "must run as root"
for command in stat dirname; do command -v "$command" >/dev/null || fail "missing command: $command"; done
secure_file "$ENV_FILE" "backup environment"
# shellcheck disable=SC1090
. "$ENV_FILE"
: "${COMPOSE_ENV_FILE:?COMPOSE_ENV_FILE is required}"
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE is required}"
: "${S3_APP_ACCESS_KEY:?S3_APP_ACCESS_KEY is required}"
: "${S3_APP_SECRET_KEY:?S3_APP_SECRET_KEY is required}"
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
COMPOSE_FILE=${COMPOSE_FILE:-$SCRIPT_DIR/docker-compose.prod.yml}
BACKUP_ROOT=${BACKUP_ROOT:-/var/backups/agrolens}
MIN_FREE_BYTES=${BACKUP_MIN_FREE_BYTES:-5368709120}
HEARTBEAT_FILE=${BACKUP_HEARTBEAT_FILE:-/var/lib/agrolens/backup-last-success}
RUN_DIR=${BACKUP_RUN_DIR:-/run/agrolens-backup}
LOCK_FILE=${BACKUP_LOCK_FILE:-$RUN_DIR/backup.lock}
secure_file "$COMPOSE_ENV_FILE" "Compose environment"
secure_file "$RESTIC_PASSWORD_FILE" "Restic password file"
for command in date docker restic flock stat mktemp mkdir rm awk df dirname; do command -v "$command" >/dev/null || fail "missing command: $command"; done
mkdir -p "$(dirname "$HEARTBEAT_FILE")" "$BACKUP_ROOT" "$RUN_DIR"
chmod 700 "$RUN_DIR"
umask 077
exec 9>"$LOCK_FILE"
flock -n 9 || fail "another backup is running"
FREE=$(df -P -B1 "$BACKUP_ROOT" 2>/dev/null | awk 'NR==2 { print $4 }')
[ "${FREE:-0}" -ge "$MIN_FREE_BYTES" ] || fail "free space below configured floor"
# ponytail: one global lock keeps timestamp-only staging names unique; per-account locks if throughput matters.
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
STAGING="$BACKUP_ROOT/$STAMP"
mkdir -p "$STAGING/objects"
chmod 700 "$STAGING" "$STAGING/objects"
RCLONE_CONFIG=$(mktemp "$RUN_DIR/agrolens-rclone.XXXXXX")
chmod 600 "$RCLONE_CONFIG"
cleanup() {
  rm_status=0
  [ -z "${RCLONE_CONFIG:-}" ] || rm -f -- "$RCLONE_CONFIG" || rm_status=1
  [ -z "${STAGING:-}" ] || rm -rf -- "$STAGING" || rm_status=1
  [ -z "${HEARTBEAT_FILE:-}" ] || rm -f -- "$HEARTBEAT_FILE.tmp" || rm_status=1
  if [ "$rm_status" -ne 0 ]; then log "FAILED: cleanup failed (secret/staging material may remain)"; return 1; fi
}
trap 'status=$?; cleanup || status=1; exit "$status"' EXIT INT TERM

compose() { docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE" "$@"; }
healthy() {
  cid=$(compose ps -q "$1")
  [ -n "$cid" ] || fail "$1 is not running"
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$cid")" = healthy ] || fail "$1 is not healthy"
}
healthy postgres
healthy garage
GARAGE_CID=$(compose ps -q garage)
COMPOSE_BUCKET=$(awk -F= '$1 == "S3_BUCKET" { print substr($0, index($0, "=") + 1); exit }' "$COMPOSE_ENV_FILE")
[ -n "$COMPOSE_BUCKET" ] || fail "S3_BUCKET is missing from Compose environment"
S3_BUCKET=$COMPOSE_BUCKET
NETWORKS=$(docker inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' "$GARAGE_CID")
[ "$(printf '%s\n' "$NETWORKS" | awk 'NF { n++ } END { print n+0 }')" -eq 1 ] || fail "Garage must have exactly one Docker network"
GARAGE_NETWORK=$(printf '%s\n' "$NETWORKS" | awk 'NF { print; exit }')
[ -n "$GARAGE_NETWORK" ] || fail "Garage network discovery failed"

printf '[garage]\ntype = s3\nprovider = Other\nendpoint = http://garage:3900\nregion = garage\naccess_key_id = %s\nsecret_access_key = %s\nforce_path_style = true\n' "$S3_APP_ACCESS_KEY" "$S3_APP_SECRET_KEY" >"$RCLONE_CONFIG"
# Credentials are in the root-only /run config, never in arguments or staging.
docker run --rm --entrypoint /bin/sh --network "$GARAGE_NETWORK" \
  --env "BACKUP_BUCKET=$S3_BUCKET" \
  -v "$RCLONE_CONFIG:/config/rclone/rclone.conf:ro" -v "$STAGING/objects:/backup/objects:rw" \
  "$RCLONE_IMAGE@$RCLONE_DIGEST" -eu -c \
  'rclone --config /config/rclone/rclone.conf copy "garage:$BACKUP_BUCKET" /backup/objects --transfers 8 --checkers 8 --stats 1m && rclone --config /config/rclone/rclone.conf check "garage:$BACKUP_BUCKET" /backup/objects --one-way'
OBJECTS_COMPLETE=$(date -u +%FT%TZ)

compose exec -T postgres sh -c 'pg_dump --username="${POSTGRES_USER:-postgres}" --format=custom --dbname="${POSTGRES_DB:-agrolens}"' >"$STAGING/postgres.dump"
test -s "$STAGING/postgres.dump" || fail "PostgreSQL dump is empty"
DUMP_COMPLETE=$(date -u +%FT%TZ)
BACKEND_CID=$(compose ps -q backend || true)
IMAGE_ID=$(docker inspect -f '{{.Image}}' "$BACKEND_CID" 2>/dev/null || printf 'unknown')
RELEASE_ID=${RELEASE_ID:-unknown}
OPERATOR=${BACKUP_OPERATOR:-${SUDO_USER:-$(id -un)}}
printf 'stamp=%s\nutc_objects_completed=%s\nutc_dump_completed=%s\nrelease_id=%s\nbackend_image_identity=%s\noperator=%s\nnon_atomicity_caveat=PostgreSQL and Garage are not an atomic cross-system snapshot; concurrent writes can produce row/object mismatch.\n' "$STAMP" "$OBJECTS_COMPLETE" "$DUMP_COMPLETE" "$RELEASE_ID" "$IMAGE_ID" "$OPERATOR" >"$STAGING/manifest.txt"
chmod 600 "$STAGING/manifest.txt"

BACKUP_OUTPUT=$(restic backup "$STAGING" --tag agrolens-production --tag "$STAMP" --json)
SNAPSHOT_ID=$(printf '%s\n' "$BACKUP_OUTPUT" | awk -F'"snapshot_id"[[:space:]]*:[[:space:]]*"' 'NF > 1 { split($2, value, "\""); print value[1]; exit }')
[ -n "$SNAPSHOT_ID" ] || fail "Restic did not return a snapshot ID"
restic snapshots --tag agrolens-production
trap - EXIT INT TERM
cleanup
printf 'completed_at=%s\nsnapshot_id=%s\n' "$(date -u +%FT%TZ)" "$SNAPSHOT_ID" >"$HEARTBEAT_FILE.tmp"
chmod 600 "$HEARTBEAT_FILE.tmp"
mv -f "$HEARTBEAT_FILE.tmp" "$HEARTBEAT_FILE"
log "completed snapshot $SNAPSHOT_ID"
