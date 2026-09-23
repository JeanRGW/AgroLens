#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE=${BACKUP_ENV_FILE:-/etc/agrolens/backup.env}
fail() { printf 'maintenance: FAILED: %s\n' "$*" >&2; exit 1; }
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
command -v stat >/dev/null || fail "missing command: stat"
secure_file "$ENV_FILE" "backup environment"
# shellcheck disable=SC1090
. "$ENV_FILE"
RUN_DIR=${BACKUP_RUN_DIR:-/run/agrolens-backup}
LOCK_FILE=${BACKUP_LOCK_FILE:-$RUN_DIR/backup.lock}
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE is required}"
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE
secure_file "$RESTIC_PASSWORD_FILE" "Restic password file"
for command in restic stat flock mkdir dirname; do command -v "$command" >/dev/null || fail "missing command: $command"; done
mkdir -p "$RUN_DIR"
chmod 700 "$RUN_DIR"
umask 077
exec 9>"$LOCK_FILE"
flock -n 9 || fail "another backup or maintenance run is active"

restic forget --tag agrolens-production --group-by host --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
restic check
