#!/bin/sh
# LinguistPro container entrypoint.
#
# Runs as root ONLY to make the mounted /app/data volume writable by the
# unprivileged `node` user (UID 1000), then drops privileges via su-exec so the
# Node server runs non-root (least privilege — limits blast radius of any RCE).
# Chowning here (rather than at build time) also fixes a pre-existing volume that
# an earlier root-running image created root-owned.
set -e
chown -R node:node /app/data 2>/dev/null || true
exec su-exec node "$@"
