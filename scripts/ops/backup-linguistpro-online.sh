#!/usr/bin/env bash
set -Eeuo pipefail

# Consistent production-volume backup for LinguistPro.
#
# The live SQLite database is copied with SQLite's Online Backup API. The
# resulting single-file snapshot replaces live app.db/app.db-wal/app.db-shm in
# the volume archive; every other volume file is preserved unchanged.
#
# Required configuration is read from /etc/linguistpro-backup.env by default:
#   LINGUISTPRO_VOLUME_NAME=<docker-volume-name>
# Optional:
#   LINGUISTPRO_BACKUP_DIR=/opt/backups/linguistpro
#   LINGUISTPRO_BACKUP_KEEP_DAYS=14

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
umask 077

CONFIG_FILE="${LINGUISTPRO_BACKUP_CONFIG:-/etc/linguistpro-backup.env}"
if [[ -r "$CONFIG_FILE" ]]; then
  # shellcheck disable=SC1090 -- production-only config, root-owned mode 0600.
  source "$CONFIG_FILE"
fi

: "${LINGUISTPRO_VOLUME_NAME:?LINGUISTPRO_VOLUME_NAME is required}"

VOLUME_NAME="$LINGUISTPRO_VOLUME_NAME"
VOLUME_SRC="${LINGUISTPRO_VOLUME_SRC:-/var/lib/docker/volumes/${VOLUME_NAME}/_data}"
DEST="${LINGUISTPRO_BACKUP_DIR:-/opt/backups/linguistpro}"
KEEP_DAYS="${LINGUISTPRO_BACKUP_KEEP_DAYS:-14}"
DATE="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="$DEST/app-data-$DATE.tar.gz"
ARCHIVE_TMP="$DEST/.app-data-$DATE.tar.gz.tmp"
LOCK_FILE="$DEST/.backup.lock"
WORK_DIR=""
CONTAINER_ID=""
CONTAINER_SNAPSHOT="/tmp/linguistpro-online-backup-$DATE.db"

die() {
  echo "$(date -Is) backup ERROR: $*" >&2
  exit 1
}

cleanup() {
  local rc=$?
  trap - EXIT INT TERM
  if [[ -n "$CONTAINER_ID" ]]; then
    docker exec "$CONTAINER_ID" rm -f "$CONTAINER_SNAPSHOT" >/dev/null 2>&1 || true
  fi
  [[ -n "$WORK_DIR" ]] && rm -rf -- "$WORK_DIR"
  rm -f -- "$ARCHIVE_TMP"
  exit "$rc"
}
trap cleanup EXIT INT TERM

[[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] || die "LINGUISTPRO_BACKUP_KEEP_DAYS must be a non-negative integer"
[[ -d "$VOLUME_SRC" ]] || die "volume source not found: $VOLUME_SRC"
mkdir -p -- "$DEST"

exec 9>"$LOCK_FILE"
flock -n 9 || die "another backup run holds $LOCK_FILE"

mapfile -t CONTAINERS < <(docker ps --filter "volume=$VOLUME_NAME" --format '{{.ID}}')
[[ ${#CONTAINERS[@]} -eq 1 ]] || die "expected exactly one running container for volume $VOLUME_NAME, found ${#CONTAINERS[@]}"
CONTAINER_ID="${CONTAINERS[0]}"

WORK_DIR="$(mktemp -d "$DEST/.backup-work-$DATE.XXXXXX")"
SNAPSHOT="$WORK_DIR/app.db"
RESTORE_DIR="$WORK_DIR/restore-check"
mkdir -p -- "$RESTORE_DIR"

# sqlite3's .backup command uses the Online Backup API and produces a
# transactionally consistent single-file snapshot while the app remains live.
docker exec "$CONTAINER_ID" rm -f "$CONTAINER_SNAPSHOT"
docker exec "$CONTAINER_ID" sqlite3 -cmd '.timeout 30000' /app/data/app.db ".backup '$CONTAINER_SNAPSHOT'"

INTEGRITY="$(docker exec "$CONTAINER_ID" sqlite3 "$CONTAINER_SNAPSHOT" 'PRAGMA integrity_check;')"
[[ "$INTEGRITY" == "ok" ]] || die "snapshot integrity_check failed: $INTEGRITY"

docker cp "$CONTAINER_ID:$CONTAINER_SNAPSHOT" "$SNAPSHOT" >/dev/null
docker exec "$CONTAINER_ID" rm -f "$CONTAINER_SNAPSHOT"

SNAPSHOT_SHA256="$(sha256sum "$SNAPSHOT" | awk '{print $1}')"
SNAPSHOT_BYTES="$(stat -c '%s' "$SNAPSHOT")"
printf '%s  app.db\n' "$SNAPSHOT_SHA256" > "$WORK_DIR/app.db.sha256"
printf '%s\n' \
  'format=linguistpro-volume-online-backup-v1' \
  "created_at=$(date -Is)" \
  'sqlite_method=online_backup_api' \
  'sqlite_integrity_check=ok' \
  "snapshot_bytes=$SNAPSHOT_BYTES" \
  "snapshot_sha256=$SNAPSHOT_SHA256" \
  > "$WORK_DIR/backup-manifest.txt"

# Preserve the rest of the volume, but replace the three live SQLite files with
# the verified snapshot above. tar exit 1 means a non-DB volume file changed
# while being read; retain the current best-effort behavior, but reject >1.
set +e
tar --warning=no-file-changed -czf "$ARCHIVE_TMP" \
  -C "$WORK_DIR" app.db app.db.sha256 backup-manifest.txt \
  -C "$VOLUME_SRC" \
  --exclude='./app.db' \
  --exclude='./app.db-wal' \
  --exclude='./app.db-shm' \
  .
TAR_RC=$?
set -e
[[ $TAR_RC -le 1 ]] || die "tar failed with exit $TAR_RC"

gzip -t "$ARCHIVE_TMP"

ARCHIVE_LIST="$WORK_DIR/archive-list.txt"
tar -tzf "$ARCHIVE_TMP" > "$ARCHIVE_LIST"
mapfile -t ROOT_DB_ENTRIES < <(grep -E '^(\./)?app\.db$' "$ARCHIVE_LIST" || true)
[[ ${#ROOT_DB_ENTRIES[@]} -eq 1 ]] || die "archive must contain exactly one root app.db"
if grep -Eq '^(\./)?app\.db-(wal|shm)$' "$ARCHIVE_LIST"; then
  die "archive contains a live root SQLite sidecar"
fi

tar -xzf "$ARCHIVE_TMP" -C "$RESTORE_DIR" "${ROOT_DB_ENTRIES[0]}"
EXTRACTED_DB="$RESTORE_DIR/${ROOT_DB_ENTRIES[0]#./}"
EXTRACTED_SHA256="$(sha256sum "$EXTRACTED_DB" | awk '{print $1}')"
[[ "$EXTRACTED_SHA256" == "$SNAPSHOT_SHA256" ]] || die "archived snapshot checksum mismatch"

mv -- "$ARCHIVE_TMP" "$ARCHIVE"
find "$DEST" -maxdepth 1 -type f -name 'app-data-*.tar.gz' -mtime "+$KEEP_DAYS" -delete

ARCHIVE_BYTES="$(stat -c '%s' "$ARCHIVE")"
echo "$(date -Is) backup OK: $(basename "$ARCHIVE") bytes=$ARCHIVE_BYTES sqlite_snapshot_bytes=$SNAPSHOT_BYTES sqlite_sha256=$SNAPSHOT_SHA256 method=online_backup_api"
