#!/usr/bin/env bash
# Read-only H2.5 checks; does not load the model or inspect transcript content.

check_ivrit_asr() {
  if ! docker exec -u hermes -e HOME=/home/hermes hermes-agent \
    /opt/hermes/.venv/bin/hermes mcp list 2>/dev/null | grep -q 'ivrit_asr.*1 selected.*enabled'; then
    echo "[FAIL] ivrit_asr MCP is not enabled with exactly one selected tool"
    return 1
  fi

  if ! docker exec hermes-webui sh -lc '
    test -f /workspace/mcp-servers/ivrit-asr/ivrit_asr_mcp.py &&
    test -d /workspace/voice-inbox &&
    test -s /workspace/models/ivrit-ai-whisper-large-v3-turbo-ct2/model.bin &&
    /home/hermeswebui/.hermes/mcp-runtimes/asr-py312/bin/python -c \
      "import av, ctranslate2, faster_whisper, fastmcp"
  ' >/dev/null 2>&1; then
    echo "[FAIL] ivrit_asr runtime, inbox, or pinned local model is unavailable"
    return 1
  fi

  echo "[OK]   ivrit_asr -> one tool; runtime/model/inbox ready"
}

check_ivrit_asr
