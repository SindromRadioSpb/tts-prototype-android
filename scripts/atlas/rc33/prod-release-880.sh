#!/usr/bin/env bash
# Atlas 97001 RC3.3 → production 3.11.880. Run by the owner from the main checkout (Git Bash):
#   bash .worktrees/atlas97001-rc33/scripts/atlas/rc33/prod-release-880.sh stage     # 1. data onto the volume (before code)
#   bash .worktrees/atlas97001-rc33/scripts/atlas/rc33/prod-release-880.sh push      # 2. code to main → Coolify deploy
#   bash .worktrees/atlas97001-rc33/scripts/atlas/rc33/prod-release-880.sh activate  # 3. after 3.11.880 is live
# Never touches the database, learner data or old atlas namespaces. Rollback: previous image + ADDENDUM_RELEASE pin.
set -euo pipefail
H=peter@167.235.200.19
V=/var/lib/docker/volumes/glmw0wjd6nm70fntxgjy6fkp-linguistpro-data/_data
ARCH="E:/projects/tts-prototype-android/Архив/atlas97001-rc33-880/atlas-release-880.tar.gz"
INST="E:/projects/tts-prototype-android/Архив/atlas97001-rc33-880/install-release-data.py"
SHA=470d239965fdeb53af689da78a41e2e2649b3252e9f904108686fbdefe67639c
WT="E:/projects/tts-prototype-android/.worktrees/atlas97001-rc33"
run_installer() { ssh "$H" "sudo -n python3 /tmp/install-release-data-880.py --data-root $V --archive /tmp/atlas-release-880.tar.gz --sha256 $SHA --phase $1 --version 3.11.880"; }

case "${1:-}" in
  stage)
    [ "$(sha256sum "$ARCH" | cut -c1-64)" = "$SHA" ] || { echo "archive SHA mismatch"; exit 1; }
    free=$(ssh "$H" "df -B1 --output=avail / | tail -1")
    echo "free on server: $((free / 1024 / 1024 / 1024)) GiB"
    [ "$free" -gt $((6 * 1024 * 1024 * 1024)) ] || { echo "less than 6 GiB free: clean the build cache first"; exit 1; }
    ssh "$H" "sudo -n python3 -c \"import json;print(json.load(open('$V/atlas-sources/a97001rc32/manifest.json'))['edition_revision'])\"" | grep -q '^841fd642' \
      || { echo "server source is not 3.11.879 (841fd642): stop"; exit 1; }
    scp "$ARCH" "$H:/tmp/atlas-release-880.tar.gz"
    scp "$INST" "$H:/tmp/install-release-data-880.py"
    run_installer stage
    ;;
  push)
    git -C "$WT" push origin feat/atlas97001-rc33
    git -C "$WT" push origin feat/atlas97001-rc33:main
    echo "pushed; wait for Coolify, then: curl -s https://linguistpro.kolosei.com/sw.js | grep CACHE_VERSION"
    ;;
  activate)
    curl -s https://linguistpro.kolosei.com/sw.js | grep -q 'v3.11.880' || { echo "3.11.880 is not live yet"; exit 1; }
    run_installer activate
    ssh "$H" "rm -f /tmp/atlas-release-880.tar.gz /tmp/install-release-data-880.py"
    curl -s https://linguistpro.kolosei.com/healthz | head -c 300; echo
    ;;
  *) echo "usage: $0 stage|push|activate"; exit 2 ;;
esac
