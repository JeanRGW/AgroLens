#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
SCRIPT="$ROOT/agrolens-backup.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/staging" "$TMP/run" "$TMP/state"
cat >"$TMP/bin/id" <<'EOF'
#!/bin/sh
[ "$1" = -u ] && printf '0\n' || printf 'tester\n'
EOF
cat >"$TMP/bin/date" <<'EOF'
#!/bin/sh
case "$*" in *%Y%m%dT%H%M%SZ*) printf '20260101T000000Z\n';; *%FT%TZ*) printf '2026-01-01T00:00:00Z\n';; esac
EOF
cat >"$TMP/bin/df" <<'EOF'
#!/bin/sh
printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/x 1 0 99999999999 1%% /\n'
EOF
chmod +x "$TMP/bin/id" "$TMP/bin/date" "$TMP/bin/df"
for cmd in flock mktemp mkdir rm awk; do ln -s "$(command -v "$cmd")" "$TMP/bin/$cmd"; done
cat >"$TMP/bin/stat" <<'EOF'
#!/bin/sh
case "$3" in */env|*/password|*/compose.env) printf '0 600\n';; *) printf '0 755\n';; esac
EOF
chmod +x "$TMP/bin/stat"
cat >"$TMP/env" <<EOF
COMPOSE_ENV_FILE=$TMP/compose.env
RESTIC_REPOSITORY=sftp:user@backup.example:/srv/restic/agrolens
RESTIC_PASSWORD_FILE=$TMP/password
S3_APP_ACCESS_KEY=test-key
S3_APP_SECRET_KEY=test-secret
BACKUP_ROOT=$TMP/staging
BACKUP_HEARTBEAT_FILE=$TMP/state/heartbeat
BACKUP_RUN_DIR=$TMP/run
BACKUP_LOCK_FILE=$TMP/run/backup.lock
BACKUP_MIN_FREE_BYTES=1
EOF
: >"$TMP/password"; printf 'S3_BUCKET=test-bucket\n' >"$TMP/compose.env"; chmod 600 "$TMP/env" "$TMP/password" "$TMP/compose.env"
if [ "$(id -u)" -eq 0 ]; then chown 0:0 "$TMP/env" "$TMP/password"; fi
cat >"$TMP/bin/docker" <<EOF
#!/bin/sh
printf '%s\n' "docker \$*" >> "$TMP/calls"
 case " \$* " in *' ps -q postgres '*) printf 'pg\\n';; *' ps -q garage '*) printf 'garage\\n';; *' ps -q backend '*) [ "\${NO_BACKEND:-}" = 1 ] || printf 'backend\\n';; *' inspect -f'*Health*) printf 'healthy\\n';; *' inspect -f'*Image*) printf 'sha256:image\\n';; *' inspect --format'*) printf 'net1\\n';; *' run '*) [ "\${FAIL_RUN:-}" = 1 ] && exit 1 || exit 0;; *' exec '*) printf 'PGDATA\\n';; esac
EOF
chmod +x "$TMP/bin/docker"
cat >"$TMP/bin/restic" <<EOF
#!/bin/sh
printf '%s\n' "restic \$*" >> "$TMP/calls"
[ "\${RESTIC_REPOSITORY:-}" = "sftp:user@backup.example:/srv/restic/agrolens" ] || exit 2
[ "\${RESTIC_PASSWORD_FILE:-}" = "$TMP/password" ] || exit 2
case " \$* " in *' backup '*) printf '{"message_type":"summary","snapshot_id":"snap-1"}\n';; esac
EOF
chmod +x "$TMP/bin/restic"
PATH="$TMP/bin:$PATH" BACKUP_ENV_FILE="$TMP/env" bash "$SCRIPT"
test -s "$TMP/state/heartbeat"
awk '/docker .*run/{run=NR} /docker .*exec/{exec=NR} END{if (!run || !exec || run > exec) exit 1}' "$TMP/calls"
# A stopped backend API must not prevent a backup.
rm "$TMP/state/heartbeat"
PATH="$TMP/bin:$PATH" NO_BACKEND=1 BACKUP_ENV_FILE="$TMP/env" bash "$SCRIPT"
test -s "$TMP/state/heartbeat"
# A failed rclone container must clean staging and leave the prior heartbeat intact.
printf 'old\n' >"$TMP/state/heartbeat"
if PATH="$TMP/bin:$PATH" FAIL_RUN=1 BACKUP_ENV_FILE="$TMP/env" bash "$SCRIPT"; then exit 1; fi
test "$(cat "$TMP/state/heartbeat")" = old
! test -d "$TMP/staging/20260101T000000Z"
# Compose remains the source of truth for the bucket.
printf 'S3_BUCKET=other-bucket\n' >"$TMP/compose.env"
PATH="$TMP/bin:$PATH" BACKUP_ENV_FILE="$TMP/env" bash "$SCRIPT"
awk '/docker .*run/ && /other-bucket/ {found=1} END{exit !found}' "$TMP/calls"
PATH="$TMP/bin:$PATH" BACKUP_ENV_FILE="$TMP/env" bash "$ROOT/agrolens-maintenance.sh"
awk '/restic .*forget.*--group-by host/{forget=NR} /restic .*check/{check=NR} END{if (!forget || !check || forget > check) exit 1}' "$TMP/calls"
mv "$TMP/env" "$TMP/real-env"
ln -s "$TMP/real-env" "$TMP/env"
if PATH="$TMP/bin:$PATH" BACKUP_ENV_FILE="$TMP/env" bash "$SCRIPT"; then exit 1; fi
printf 'backup focused test passed\n'
