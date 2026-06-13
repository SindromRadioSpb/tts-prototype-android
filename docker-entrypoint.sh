#!/bin/sh
# LinguistPro container entrypoint.
#
# Runs as root ONLY to make the mounted /app/data volume writable by the
# unprivileged `node` user (UID 1000), then drops privileges via su-exec so the
# Node server runs non-root (least privilege — limits blast radius of any RCE).
# Chowning here (rather than at build time) also fixes a pre-existing volume that
# an earlier root-running image created root-owned.
set -e
# Only chown when ownership isn't already correct, so steady-state restarts are
# instant (no slow recursive chown every boot on a large volume). The one-time
# cost happens on the first boot after switching from a root-running image.
if [ "$(stat -c '%U' /app/data 2>/dev/null)" != "node" ]; then
  echo "[entrypoint] /app/data not owned by node — chowning once (may take a moment on a large volume)..."
  chown -R node:node /app/data 2>/dev/null || true
fi
exec su-exec node "$@"
