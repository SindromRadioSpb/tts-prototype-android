#!/bin/sh
set -eu

# The broker reads the owner-only Hermes .env, immediately drops to
# hermeswebui, and only then opens its loopback listener.
python3 /opt/c2-live-sidecar/c2_token_sidecar.py &
sidecar_pid=$!
/hermeswebui_init.bash &
webui_pid=$!

stop_children() {
  kill "$webui_pid" "$sidecar_pid" 2>/dev/null || true
}
trap stop_children INT TERM EXIT
wait "$webui_pid"
status=$?
kill "$sidecar_pid" 2>/dev/null || true
wait "$sidecar_pid" 2>/dev/null || true
exit "$status"
